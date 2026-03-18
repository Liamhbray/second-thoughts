# Technical Design Document: Second Thoughts

Implementation architecture for `SDD.md`. The SDD owns behaviour and constraints; this document owns implementation decisions.

Grounded in the Obsidian Plugin API and known platform gotchas (see `resources/`).

---

## 0. What This Is

An Obsidian plugin is a client-side JavaScript bundle running inside Obsidian's Electron app (Chromium + Node.js, single process). There is no server, no backend, no cloud infrastructure. The plugin is a `.js` file loaded into the user's Obsidian instance on their machine.

Everything runs on the main thread — the plugin shares it with Obsidian's editor, renderer, and all other plugins. Web Workers are unreliable in Obsidian. The only thing that leaves the user's machine is `requestUrl()` calls to OpenAI for embedding generation and LLM inference. All other computation (similarity search, scope filtering, callout parsing) runs locally on the user's CPU.

Data is stored locally in the vault's `.obsidian/plugins/second-thoughts/` directory. There is no deployment — users install the plugin and it runs in their Obsidian.

**Architecture:** local single-threaded client → external API calls → local file storage.

---

## 1. Plugin Skeleton

### 1.1 Build

- esbuild, `src/main.ts` → `main.js`, CommonJS, target `es2018`
- Externals: `obsidian`, `electron`, `@codemirror/view`, `@codemirror/state`, `@codemirror/*`, `@lezer/*` — **never bundle CM6 packages**; Obsidian provides its own instance. Bundling duplicates causes silent `instanceof` failures.
- Use Obsidian builtins: `requestUrl()` (not `fetch`), `sanitizeHTMLToDom()` (not `innerHTML`), `moment` from `obsidian`

### 1.2 Manifest

```json
{
  "id": "second-thoughts",
  "name": "Second Thoughts",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "AI-generated relational links and ideation responses drawn from your vault.",
  "author": "...",
  "isDesktopOnly": true
}
```

### 1.3 Lifecycle

```
onload()
  ├─ loadSettings()
  ├─ addSettingTab(), addCommand(), registerEvent()
  ├─ registerEditorExtension() — CM6 callout decorations (accept/reject buttons)
  └─ workspace.onLayoutReady()
       ├─ Wait for metadataCache 'resolved' (unregister after first fire)
       ├─ Load shadow files into runtime map
       └─ Queue stale/missing notes for re-embedding

onunload()
  ├─ Automatic cleanup (all register*() resources)
  ├─ Clear all pending idle debounce timers
  ├─ Abort in-flight API requests (via AbortController)
  └─ Release runtime embedding map
```

**Gotchas:**
- `onLayoutReady()` gates all heavy work. `vault.on('create')` fires for every file during startup — guard handlers or register inside `onLayoutReady()`.
- `onunload()` is NOT reliably called on app close. Persist state eagerly.

---

## 2. Idle Detection

No built-in idle event. Built from three primitives:

| Event | API | Purpose |
| --- | --- | --- |
| File modified | `vault.on('modify')` | Reset debounce timer for that file |
| Active file changed | `workspace.on('file-open')` | Track focused file |
| Active leaf changed | `workspace.on('active-leaf-change')` | Track pane focus |

Per-file debounce timer in a `Map<string, timeout>`. On modify: reset timer. When timer fires: check file is not active → idle. On idle: wait for `metadataCache.on('changed')` for this file (ensures metadata is fresh) before extracting compartments and re-embedding. Before writing any callout: re-verify both idle conditions inside the `vault.process()` callback (user may have resumed editing during processing).

All events via `registerEvent()`. Filter to `TFile` with `.md` extension.

---

## 3. Semantic Index

### 3.1 Embedding Service

OpenAI Embeddings API via `requestUrl()` (mandatory for community plugin approval). API key in plugin settings, never logged.

### 3.2 Compartmentalised Embeddings

Four embeddings per note:

| Compartment | Source | Extraction |
| --- | --- | --- |
| Title | `TFile.basename` | Direct |
| Tags | `cache.tags` + `cache.frontmatter.tags` | `metadataCache.getFileCache()` |
| Links | `cache.links` + `cache.frontmatterLinks` | `metadataCache.getFileCache()` |
| Content | Note body | `vault.read()` |

**Rationale:** Single embeddings blend structural signals with content and content dominates. Compartmentalisation preserves each signal layer independently.

**Pre-processing:** Strip internal links (`[[#heading]]`, `[[#^block]]`) from Links compartment. Exclude source note from searches.

**Content extraction:** Use `vault.read()` (not `cachedRead()`) for the Content compartment — `cachedRead()` is documented as "suitable for display purposes" and may return stale content. For embeddings, accuracy matters.

**Cache timing:** `getFileCache()` returns `null` after file creation/modification until the `metadataCache.on('changed')` event fires. After idle is detected, wait for the `'changed'` event for that specific file before extracting Tags and Links compartments. This ensures embeddings capture current metadata, not stale data.

### 3.3 Index Storage

`data.json` must stay under 1MB — too small for embeddings. Use per-note shadow files instead:

```
.obsidian/plugins/second-thoughts/data.json          — settings only
.obsidian/plugins/second-thoughts/embeddings/
  <note-path-hash>.json                               — one file per note
```

Each shadow file contains all four compartment embeddings and the note's `mtime`:

```json
{
  "mtime": 1710648000000,
  "title": [0.012, -0.034, ...],
  "tags": [0.056, 0.011, ...],
  "links": [-0.023, 0.045, ...],
  "content": [0.067, -0.012, ...],
  "proposed": ["path/to/target-a.md"]
}
```

**Why shadow files, not a single index:**
- **Incremental** — re-embedding one note writes one small file (~30-50KB), not the entire index.
- **No corruption blast radius** — a bad write loses one note's embeddings, not everything.
- **No scaling ceiling** — 5,000 notes = 5,000 small files, no single-file parse bottleneck.
- **Eager persistence is trivial** — save each file right after its API call returns.
- **Cleanup maps to vault events** — note deleted → delete shadow file; note renamed → delete old, re-embed new.

Read/write via `vault.adapter` (valid for plugin-internal data in `.obsidian`).

**Startup loading:** On startup, load all shadow files into a runtime map and compare stored `mtime` against `TFile.stat.mtime` to detect stale entries. Stale notes are queued for re-embedding. Similarity search requires all embeddings in memory — no lazy loading, because the SDD requires embeddings to be fresh before either system processes a note.

### 3.4 Similarity

Cosine similarity in-memory. No vector DB. Fast enough after scope pre-filtering for vaults up to ~5,000 notes. Batch and yield to main thread for large candidate sets.

---

## 4. Retrieval Pipeline

### Stage 1 — Scope Pre-filters

All from MetadataCache, no API calls:

- **Hop depth:** BFS on `metadataCache.resolvedLinks` (nested `Record<source, Record<dest, count>>`), up to N hops. Used by System 1 (default 3 hops).
- **Folder boundaries:** String prefix match on `TFile.path`. Used by System 2 when scope is `folder` — restricts candidates to the source note's parent folder subtree. When System 2 scope is `folder`, hop depth is not applied.
- **Tag filters:** From `getFileCache(file).tags` + `frontmatter.tags`.
- **Exclusions:** From plugin settings.

### Stage 2 — Similarity Search

Four independent top-K searches (default K=5), one per compartment. A note may appear in multiple result sets.

### Stage 3 — LLM Context Assembly

Pass four un-merged result sets to LLM with labels ("matched on title similarity", "matched on tag patterns", etc.). Include full note content via `cachedRead()`. Token cost scales with K × 4, not vault size.

### Stage 4 — LLM Generation

`requestUrl()` to OpenAI Chat Completions. Prompt specifies callout format (`[!connection]` or `[!ideation]`), contextual wikilinks, vault-only knowledge.

On consecutive API failures (5+), pause requests for 60 seconds to avoid cascading failures.

---

## 5. Writing Callouts

### Writing

Always use `vault.process()` for callout writes — it is atomic (read-modify-write in one synchronous callback), preventing race conditions where the file changes between read and write. `vault.append()` and `vault.modify()` are both vulnerable to this race. Never use `vault.modify()` — it also conflicts with the editor's `requestSave` debounce (~2s window).

The final idle check happens inside the `vault.process()` callback: read the content, verify the note hasn't gained new edits (compare against expected state), then return the modified content with the callout appended. If the check fails, return the content unchanged (no-op).

### Format

```markdown

> [!connection]
> Content with [[wikilinks]] in context.

```

### Inline Accept / Reject (CM6 Decorations)

Each `[!connection]` and `[!ideation]` callout gets inline accept/reject buttons rendered via CodeMirror 6 editor decorations. This is the primary interaction — the user sees buttons directly on the callout without needing the command palette.

**Approach:** Register a `StateField` via `registerEditorExtension()` in `onload()`.

- The field scans the document for `> [!connection]` and `> [!ideation]` patterns.
- At each callout, it places a **widget decoration** containing accept and reject buttons.
- Decorations persist across edits via `DecorationSet.map(tr.changes)` — CM6 automatically remaps positions when the document changes.
- Button clicks trigger `vault.process()` to perform the accept/reject, then dispatch a `StateEffect` to remove the decoration.

**Why StateField, not ViewPlugin:** Callouts can be anywhere in the document (not just the visible viewport). StateField processes the full document and supports block decorations. ViewPlugin is viewport-only and cannot produce block-level widgets.

**Critical:** Import `@codemirror/view` and `@codemirror/state` from Obsidian's own packages (marked external in esbuild). Never bundle your own — duplicate CM6 instances cause silent failures.

### Command Palette Fallback

Three commands remain via `addCommand()` with `editorCheckCallback` as a keyboard-accessible fallback:

- **Accept:** `vault.process()` — strip callout markers, keep content as plain text.
- **Reject:** `vault.process()` — delete entire callout block.
- **Reject all:** Same, for all `[!connection]` and `[!ideation]` callouts.

---

## 6. Background Processing

Single-threaded (Web Workers unreliable in Obsidian). Process in batches of 50 with `setTimeout(resolve, 0)` yields between batches. Use `requestIdleCallback()` for non-urgent work.

**Startup:** After `onLayoutReady()` + `metadataCache 'resolved'` (unregister after first fire — it fires multiple times, not just at startup) → load shadow files into runtime map → diff `mtime` against vault → queue stale/missing notes → process in priority order (recently modified first).

**Bootstrap threshold:** System 1 is suppressed until 100% of vault notes have been indexed. On a fresh install, the full vault must be embedded before System 1 begins proposing connections — partial coverage would produce low-quality results since the system can't know what it's missing. System 2 runs at any coverage level (per SDD Section 6.1), since the user is explicitly asking a question and a partial answer is better than none.

**Rate limiting:** Queue embedding requests and drain at a controlled rate to stay within OpenAI limits. The 5-minute idle debounce already prevents processing storms.

---

## 7. Settings

Settings in `data.json` via `saveData()`/`loadData()`, merged with defaults on load. `PluginSettingTab` with Obsidian's `Setting` class for UI.

Settings match the SDD Section 8 table: API key, idle debounce, hop depth, scope default, top-K per compartment, excluded folders/tags, agent tag.

---

## 8. Error Handling

- **Missing API key:** Plugin loads but systems disabled. Notice on first trigger.
- **API failures:** Pause after 5 consecutive failures, retry after 60s. Existing index still serves retrieval.
- **Corrupt index:** Log, discard, re-bootstrap from vault.
- **Event handlers:** Wrap in try-catch. Plugin errors must never crash Obsidian.
- **User feedback:** `Notice` API, sparingly, only for actionable errors. No status bar (SDD principle 2.5).

---

## 9. Proposal Deduplication

Track proposed connections inside each note's shadow file by adding a `proposed` field alongside the embeddings:

```json
{
  "mtime": 1710648000000,
  "title": [0.012, -0.034, ...],
  "tags": [...],
  "links": [...],
  "content": [...],
  "proposed": ["path/to/target-a.md", "path/to/target-b.md"]
}
```

Before generating a proposal, check if the source→target pair is already in the `proposed` list. The list is cleared whenever the note is re-embedded (i.e., when the note changes and `mtime` updates). This means: same note, same content → same proposals are suppressed. Note changes → all proposals eligible again.

This avoids storing per-note data in `data.json` (which must stay under 1MB) and co-locates dedup tracking with the embeddings it relates to.

Separate from rejection tracking — the SDD specifies that rejected proposals may recur. This tracker only prevents re-proposing identical connections while the source note hasn't changed.

---

## 10. Community Plugin Compliance

| Requirement | How |
| --- | --- |
| No `fetch()` | `requestUrl()` |
| No `innerHTML` | `createEl()`, `sanitizeHTMLToDom()` |
| No hardcoded secrets | API key in settings |
| `isDesktopOnly: true` | In manifest |
| Proper cleanup | All `register*()` |
| Awaited promises | try-catch everywhere |
| Release assets | `main.js`, `manifest.json` on GitHub release, semver tags |

---

## 11. Open Questions

- **Embedding model:** `text-embedding-3-small` (cheap, 1536d) vs `text-embedding-3-large` (better, 3072d). User-configurable?
- **LLM model:** `gpt-4o-mini` (cheap) vs `gpt-4o` (better). User-configurable?
- **Inline scope modifiers:** `@agent scope:folder` / `@agent hops:3` — needs a simple parser. Define grammar.
- **Concurrent idle processing:** Queue with what concurrency? One at a time is simplest.
