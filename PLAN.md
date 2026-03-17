# Implementation Plan: Second Thoughts

How the SDD behaviour and TDD decisions compose into a working Obsidian plugin. Covers control flow, module boundaries, dependency chain, and build order.

---

## 1. Plugin Structure

One class extends `Plugin`. Everything hangs off `onload()`.

```
SecondThoughtsPlugin extends Plugin
  ├─ settings: Settings
  ├─ settingsTab: SettingsTab
  ├─ idleTracker: IdleTracker
  ├─ index: EmbeddingIndex
  ├─ pipeline: RetrievalPipeline
  └─ commands: accept, reject, reject-all
```

Not separate files yet — start in `main.ts` and extract when complexity demands it. The only guaranteed separate file is the settings tab (Obsidian convention).

---

## 2. End-to-End Flows

### Flow A: Note goes idle → System 1 proposal

```
vault.on('modify') fires for note
  → idleTracker resets debounce timer for that note
  → ... user stops editing, switches away ...
  → timer fires, note is not active file
  → IDLE

idle triggers processing:
  1. Wait for metadataCache 'changed' for this file (ensures fresh metadata)
  2. Re-embed: extract 4 compartments (vault.read for content), call OpenAI embeddings, save shadow file
  3. Scope: BFS on resolvedLinks + folder/tag filters → candidate set
  4. Similarity: cosine search across 4 compartments → 4 top-K result sets
  5. Generate: pass result sets + full note content to LLM → [!connection] callout
  6. vault.process(file, data => data + callout) — final idle re-check inside callback
```

### Flow B: User tags @agent → System 2 response

```
vault.on('modify') fires for note
  → idleTracker resets debounce timer
  → ... user finishes writing, switches away ...
  → timer fires, note is not active file
  → IDLE

idle triggers processing:
  1. Wait for metadataCache 'changed' for this file
  2. Scan note content for @agent tag (with optional scope modifiers)
  3. If no tag → skip System 2
  4. Re-embed note (same as Flow A step 2)
  5. Scope + Similarity + Generate (same pipeline, different prompt + callout type)
  6. vault.process(file, data => data + callout) — final idle re-check inside callback
```

### Flow C: Startup / Bootstrap

```
onload()
  → register settings, commands, events (fast)
  → onLayoutReady()
       → wait for metadataCache 'resolved' (unregister after first fire)
       → list all .md files in vault
       → for each: check if shadow file exists and mtime matches
       → queue stale/missing notes for embedding
       → process queue in batches (recently modified first)
       → each batch: embed → save shadow file → yield to main thread
```

### Flow D: Accept / Reject

```
User runs command (command palette or hotkey)
  → editorCheckCallback: is cursor inside a callout? → show/hide command
  → Accept: vault.process() strips callout markers, content stays
  → Reject: vault.process() deletes entire callout block
  → Note is now modified → re-enters idle pipeline
```

---

## 3. Module Boundaries

Start with two files. Split later if needed.

**`main.ts`** — everything:
- Plugin class with onload/onunload
- Idle tracking (timer map, focus tracking)
- Embedding index (shadow file read/write, runtime map)
- Retrieval pipeline (scope filters, similarity, LLM call)
- Callout writing (vault.process, accept, reject)
- @agent tag scanning

**`settings.ts`** — settings tab:
- Settings interface and defaults
- PluginSettingTab subclass

**When to split:** If any section of `main.ts` exceeds ~200 lines of focused logic, extract it. Likely candidates in order: embedding API calls, retrieval pipeline, idle tracker.

---

## 4. Dependency Chain

What depends on what — determines build order.

```
Settings
  ↓ (needed by everything)
Idle Tracker
  ↓ (triggers processing)
Embedding Index (shadow files + runtime map)
  ↓ (needed by retrieval)
Scope Filters (needs MetadataCache + settings)
  ↓
Similarity Search (needs index)
  ↓
LLM Generation (needs search results + note content)
  ↓
Callout Writer (needs LLM output + idle check)
  ↓
Accept/Reject Commands (needs callout parsing)
```

---

## 5. Build Order

Sequential phases. Each phase is testable independently before moving on.

### Phase 1 — Skeleton
- Plugin class with onload/onunload
- Settings interface, defaults, settings tab with API key field
- Manifest, build config, LICENSE, README stub
- **Test:** Plugin loads in Obsidian, settings tab appears, API key saves/loads

### Phase 2 — Idle Detection
- Wire up vault.on('modify'), workspace.on('file-open'), workspace.on('active-leaf-change')
- Per-file debounce timers
- Idle callback (just console.log for now)
- **Test:** Edit a note, switch away, see idle log after debounce window

### Phase 3 — Embedding
- Compartment extraction (title, tags, links, content from MetadataCache)
- OpenAI embedding API call via requestUrl()
- Shadow file write/read via vault.adapter
- Runtime map of path → embeddings
- **Test:** Note goes idle → shadow file appears with 4 vectors

### Phase 4 — Bootstrap
- On startup: scan vault, diff mtime, queue stale notes
- Batched processing with yields
- System 1 suppressed until 100% of vault indexed (TDD Section 6)
- System 2 runs at any coverage — responds with whatever context is available (SDD Section 6.1)
- **Test:** Install plugin on a vault with existing notes → shadow files populate over time

### Phase 5 — Retrieval + System 1
- Scope pre-filters (hop depth BFS, folder, tag, exclusions)
- Cosine similarity across 4 compartments → 4 top-K sets
- LLM prompt assembly and API call
- Callout write via vault.process() (atomic, with idle re-check inside callback)

- **Test:** Note goes idle → [!connection] callout appears with contextual wikilink

### Phase 6 — System 2
- @agent tag scanner (find tag in note content)
- Same pipeline as System 1 with different prompt and [!ideation] callout type
- **Test:** Write a question with @agent, switch away → [!ideation] callout appears

### Phase 7 — Accept / Reject
- Three commands with editorCheckCallback
- Callout parsing (find callout block boundaries)
- Accept: strip markers via vault.process()
- Reject: delete block via vault.process()
- Reject all: find and remove all plugin callouts
- **Test:** Accept a proposal → markers gone, content remains. Reject → block gone.

### Phase 8 — Hardening
- API failure pause (5 consecutive failures → 60s pause, per TDD Section 4)
- Error handling in all event handlers (try-catch, never crash Obsidian)
- Deduplication tracker (proposed targets in shadow files, per TDD Section 9)
- Settings validation (merge with defaults, handle corrupt data.json)
- onunload() cleanup: clear timers, abort in-flight requests, release runtime map
- Community compliance audit (no fetch, no innerHTML, proper cleanup)
- Data privacy disclosure in README and settings tab

---

## 6. What's Deferred

Not in v1. Revisit after the core loop works.

- Per-note scope overrides via frontmatter
- Per-folder scope configuration
- Inline scope modifiers on @agent (`@agent scope:vault`, `@agent hops:3`)
- Configurable embedding/LLM model selection
- Concurrent idle processing (process one note at a time for v1)
- Index splitting for very large vaults
- styles.css (rely on Obsidian's default callout styling initially)
