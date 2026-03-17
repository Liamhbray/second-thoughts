# Software Design Document: Second Thoughts — Obsidian AI Augmentation Plugin

## 1. Overview

A TypeScript community plugin for Obsidian that augments the user's notes with AI-generated proposals. The plugin contains two independent systems — one for discovering connections between notes, one for exploring the user's ideas — built on a shared semantic index and unified by a shared delivery format (Obsidian callouts). AI content is always clearly separated from human content, always reviewable, and never written while the user is actively editing.

## 2. Core Principles

### 2.1 Human-First Authorship

AI never edits files a user is actively working on. Humans write first; the plugin responds after. All AI contributions are proposals — never silent edits. The user accepts or rejects each one individually.

### 2.2 Clear Delineation

AI-generated content is delivered as Obsidian callouts, visually distinct from human writing. Each system uses a different callout type so the user can instantly tell whether a proposal is a discovered connection (System 1) or an ideation response (System 2). No separate companion files — everything lives in the source note.

### 2.3 Non-Conversational

Neither system is a chat experience. Both produce standalone callouts — artifacts to be accepted or rejected. There is no back-and-forth, no follow-up, no threading. The user writes, the system responds once, the user reviews.

### 2.4 Vault-Sourced, Not Vault-Contained

The *knowledge* used to generate proposals comes exclusively from the user's vault. No web searches, no external datasets, no pre-trained knowledge influences the content of proposals. However, *processing* — specifically embedding generation and LLM inference — uses an external service. Vault content is sent to this service for the purpose of generating vector representations and proposals, but the substance of every proposal is drawn entirely from the user's own notes.

**Data transmitted:** For each processed note, the plugin sends four pieces of data to the external API: the note's title, its tags, its wikilinks, and its body content. This happens once per note on first index, and again whenever a note changes. The plugin's README and settings tab must clearly disclose what data is sent, to which service, and how often.

### 2.5 Invisible Infrastructure

The user has no awareness of the semantic index, the retrieval pipeline, or the internal state of the plugin. There is no status bar, no progress indicator, no coverage percentage. The plugin either produces proposals or it doesn't. The user's only interface is the callouts themselves — accept or reject.

## 3. The Two Systems

### 3.1 System 1 — Relational Connector

**Purpose:** Discover connections between notes that the user hasn't made explicitly.

**Trigger:** Automatic. Runs in the background. The user never asks for this — it happens whenever a note becomes idle (no longer being edited or viewed).

**Behaviour:** The system monitors file changes, waits for a note to become idle, then queries the semantic index to find related notes within the configured scope. When it finds a meaningful connection, it proposes it as a callout containing:

- A Wikipedia-style embedded link within a sentence — not a bare `[[link]]`, but a contextual sentence fragment with the link woven in.
- The reasoning for why the connection exists — what the two notes share, how they relate, why the user might care.

**Example:**

```markdown

> [!connection]
> This concept of "feedback loops" connects to your note on [[Systems Thinking]] — both describe how outputs cycle back as inputs to reinforce or dampen behaviour. The framing here is biological; your Systems Thinking note approaches it from an engineering perspective.

```

**What it is not:** It is not a link suggester that dumps a list of related files. Every proposal must explain *why* the connection matters in the context of what the user wrote.

### 3.2 System 2 — Ideation Agent

**Purpose:** Explore the user's questions, problems, and ideas using only the knowledge already in their vault.

**Trigger:** Explicit. The user writes a prompt and tags it with `@agent`. The system only processes the tagged prompt once the note becomes idle — it still respects the same recency rules as System 1.

**Behaviour:** The user writes something — a question, an unsolved problem, a half-formed idea — and tags it. The system picks up the tagged prompt, queries the semantic index to retrieve relevant notes within the configured scope, and produces a single callout response. The response synthesises relevant material from across the vault to address what the user wrote.

**Example:**

```markdown
How does my reading on stoicism connect to the resilience framework I drafted last month? @agent

> [!ideation]
> Your note [[Stoic Practices]] discusses "voluntary discomfort" as a way to build tolerance. Your [[Resilience Framework]] draft lists "stress inoculation" as a core pillar. Both describe deliberate exposure to manageable difficulty as a strengthening mechanism — the Stoic framing is philosophical, your framework is operational. You might also look at [[Antifragility Notes]], which uses Taleb's language to describe systems that gain from disorder — a third lens on the same underlying pattern.
```

**What it is not:** It is not a chatbot. The `@agent` tag is a one-shot invocation. The response is a standalone artifact — a research memo, not the start of a conversation.

### 3.3 What the Two Systems Share

- **Semantic index:** Both systems query the same shared index to retrieve relevant notes (see Section 5).
- **Retrieval pipeline:** Both use the same scope → similarity → top-K → generate pipeline (see Section 5.2 and `TDD.md` Section 4).
- **Delivery format:** Both produce Obsidian callouts (different types) that can be individually accepted or rejected.
- **Recency rules:** Neither system will write to a note that is actively being edited or viewed. Both wait for idle.
- **Additive only:** Neither system deletes or rewrites human content. They only append callouts.

### 3.4 How They Differ

| | System 1 — Relational Connector | System 2 — Ideation Agent |
| --- | --- | --- |
| Trigger | Automatic (background) | Explicit (`@agent` tag) |
| Purpose | Discovery — surface connections the user didn't ask for | Exploration — respond to something the user explicitly asked |
| Output | Contextual link with reasoning | Synthesis drawn from the vault |
| Callout type | `[!connection]` | `[!ideation]` |
| When it runs | Idle notes, bounded by scope and retrieval | Only notes with `@agent` tags, bounded by scope and retrieval |

## 4. Idle Detection

Both systems depend on knowing when a note is no longer being actively worked on. A note is considered idle when:

1. It has not been modified within a configurable debounce window (default: 5 minutes).
2. It is not the file in the currently active editor pane.

Both conditions must be true. The debounce window is user-configurable.

When a note transitions to idle:

- System 1 runs — querying the semantic index for relational connections within scope.
- System 2 runs only if `@agent` tags are present in the note.

Before writing any callout, the system performs a final idle check to ensure the user hasn't resumed editing since processing began.

## 5. Semantic Index

The semantic index is the shared foundation that both systems depend on. It enables retrieval of semantically related notes — notes that are conceptually connected even if they share no explicit links or tags. The index is entirely invisible to the user.

### 5.1 Design Decisions

- **Unit of knowledge:** A note. Each note is represented by multiple embeddings that capture distinct semantic signals (see `TDD.md` Section 3.2 for the embedding strategy).
- **Embedding service:** External service, not local compute (see `TDD.md` Section 3.1 for vendor choice).
- **Freshness:** Always re-embed on change. When a note is modified and goes idle, its embeddings are regenerated before either system processes it. The index is never stale.
- **Feedback:** The index does not learn from user rejections. Rejections are destructive — the callout is deleted. The system is stateless with respect to rejections. The same connection could be proposed again on a future idle cycle.
- **Visibility:** None. The user cannot observe the index, its state, its coverage, or its existence.

### 5.2 Retrieval

Both systems use the same retrieval approach: scope the candidate pool first, then find semantically similar notes, then pass the results to an LLM for reasoning and generation. This ensures cost scales with the retrieval window, not vault size. See `TDD.md` Section 4 for the pipeline architecture.

### 5.4 Why Scoping Is Required

Scoping is not a user preference — it is an operational necessity. Without scope boundaries:

- System 1 would compare every idle note against every other note in the vault. In a large vault, this produces noise (shallow, low-relevance connections) and burns compute.
- System 2 would attempt to traverse the entire graph for every `@agent` prompt. The retrieval would be slow and the LLM context would be unfocused.

Scope pre-filters (stage 1 of the pipeline) are what make the system practical at scale. They are always applied before similarity search runs.

### 5.5 Scoping Mechanisms

| Mechanism | Description |
| --- | --- |
| Hop depth | Only consider notes within N links of the source note |
| Folder boundaries | Restrict to specific folder subtrees |
| Tag filters | Include/exclude notes by tag |
| Relevance threshold | Minimum similarity score to include a note in top-K |

### 5.6 Scope Defaults

- **System 1:** Broad by default. The value is in discovering unexpected connections — narrow scope defeats the purpose. But scope is still enforced to manage noise and cost.
- **System 2:** Narrower by default. The user is asking a specific question, so tighter context produces more focused responses. The user can widen scope inline (e.g., `@agent scope:vault`).

### 5.7 Scope Controls

- Global defaults in plugin settings (v1).
- Per-note overrides via frontmatter (deferred).
- Per-folder overrides via folder-level configuration (deferred).
- Inline scope modifiers on `@agent` tags (e.g., `@agent scope:folder`, `@agent hops:3`) (deferred).

## 6. Bootstrapping

On first install, the semantic index is empty. The plugin must build it before proposals can be generated. This process is invisible to the user. See `TDD.md` Section 6 for the index construction strategy (processing order, throttling, persistence, bootstrap threshold).

### 6.1 Behaviour During Bootstrapping

- **System 1:** Suppressed until the entire vault has been indexed. The user experiences this as "the plugin hasn't suggested anything yet" — which is unremarkable, because they never asked it to.
- **System 2:** Allowed at any coverage level. If the user tags `@agent` before the vault is fully indexed, the system responds with whatever context is available. It does not communicate the limitation — the response is simply based on what has been indexed so far.

## 7. Callout Structure

Both systems deliver proposals using Obsidian's built-in callout rendering. See `TDD.md` Section 5 for rendering approach.

Each callout:

- Uses a system-specific type: `[!connection]` (System 1) or `[!ideation]` (System 2).
- Is visually distinct in both edit and reading mode via Obsidian's native callout styling.
- Can be individually accepted or rejected via plugin commands (not inline UI buttons).
- **Acceptance:** The callout markers are removed. The content becomes part of the note — indistinguishable from human-written text. The note is re-embedded on the next idle cycle.
- **Rejection:** The entire callout is deleted permanently. The system does not track rejections and may propose the same connection again in the future.
- Can be batch-managed via plugin commands (e.g., "reject all pending proposals").

## 8. User Controls and Settings

| Setting | Default | Description |
| --- | --- | --- |
| API key | — | Required. Used for embedding generation and LLM calls |
| Idle debounce (minutes) | 5 | Time since last edit before a note is eligible |
| System 1 scope — hop depth | 3 | Default link-hop boundary for relational proposals |
| System 2 scope — default | `folder` | Default context boundary for `@agent` responses |
| Top-K per compartment | 5 | Maximum notes retrieved per similarity search (up to 20 total before deduplication) |
| Excluded folders | `[]` | Folders exempt from all processing |
| Excluded tags | `[]` | Notes with these tags are exempt |
| Agent tag | `@agent` | The marker that triggers System 2 |

## 9. Constraints

- The knowledge used in proposals comes exclusively from the user's vault. No external datasets, web searches, or pre-trained knowledge influences proposal content.
- Vault content is sent to an external API for embedding generation and LLM inference. Users must provide their own API key and accept this data flow.
- Neither system modifies a note while it is actively focused or being edited.
- All proposals are additive — neither system deletes or rewrites human content.
- The user can disable processing for specific notes (via frontmatter) or folders (via settings).
- Scoping is always enforced. Both systems are bounded by the retrieval pipeline — no unbounded vault traversal.
- A note cannot propose connections to itself. The source note is excluded from all retrieval searches.
- The semantic index is invisible. No internal state is exposed to the user through any UI element.
- Desktop only. Mobile is not supported in this version.

## 10. Open Questions

- **Proposal deduplication:** If a note becomes idle multiple times, System 1 must avoid proposing the same connection twice. The system is stateless with respect to rejections (rejected proposals may recur), but it should not re-propose a connection to the same target note while the source note remains unchanged. See `TDD.md` Section 9 for implementation approach.
