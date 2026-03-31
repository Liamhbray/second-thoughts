# Logbook: Second Thoughts

Progress tracker for the [Implementation Plan](PLAN.md).

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Skeleton | Complete |
| 2 | Idle Detection | Complete |
| 3 | Embedding | Complete |
| 4 | Bootstrap | Complete |
| 5 | Retrieval + System 1 | Complete |
| 6 | System 2 | Complete |
| 7a | CM6 Callout Decorations | Complete |
| 7b | Accept / Reject Logic | Complete |
| 8 | E2E Testing | Complete |
| 9 | Hardening | Complete |

---

## Log

### 2026-03-31 — QA: E2E suite passing (11/11)

- **Bug fix:** `metadataCache.resolved` boolean doesn't exist in Obsidian 1.12.7 — bootstrap hung forever. Now checks `resolvedLinks` population instead
- **E2E rewrite:** CLI eval requires `(async () => { ... })()` wrapper for await expressions
- **E2E rewrite:** File modifications must use `vault.modify()` (not `adapter` methods) to fire `vault.on('modify')` events
- **E2E rewrite:** Test notes need `[[wiki-links]]` between them for BFS scope filter to find candidates
- **E2E rewrite:** Embedding cache cleared in setup to prevent stale `proposed` arrays blocking dedup
- **E2E rewrite:** Accept/reject tests call `vault.process()` directly (commands need active MarkdownView + cursor)
- **New helpers:** `aeval_ob` (async eval), `await_for` (async wait), `trigger_modify` (vault.modify trigger)
- **Offline docs:** Added `obsidian-cli.md` and `obsidian-vault-events.md` to `.planning/resources/`
- All 8 test groups pass: bootstrap, embedding, System 1, System 2, dedup, ownWrites, accept, reject

### 2026-03-31 — Phase 9: Hardening complete

- API failure pause: 5 consecutive failures → 60s cooldown, checked before all API calls
- `recordApiSuccess()`/`recordApiFailure()` track consecutive failures
- Bootstrap batch loop respects API pause
- `onNoteIdle()` wrapped in outer try-catch — plugin errors never crash Obsidian
- `loadSettings()` validates all numeric/array fields, falls back to defaults on corruption
- `onunload()` clears all state: timers, processing set, ownWrites, index, API pause
- Data privacy disclosure added to settings tab header
- Compliance audit: no `fetch()`, no `innerHTML` in any source file
- All network calls use `requestUrl()`, all DOM uses `createEl()`/`createElement()`

### 2026-03-31 — Phase 8: E2E testing complete

- `getDebugState()` public method exposes index, bootstrap, processing, idle, entry lookup
- `e2e.sh`: 8 test cases via Obsidian CLI (eval, plugin:reload)
- Tests: bootstrap, embedding, System 1, System 2, dedup, ownWrites, accept, reject
- Polls real plugin state — no sleeps, no mocking
- `npm run e2e` (requires Obsidian 1.12+ with CLI enabled)

### 2026-03-31 — Phase 7b: Accept/reject logic complete

- `handleAccept()`: vault.process strips callout header + `> ` prefixes, keeps content as plain text
- `handleReject()`: vault.process deletes entire callout block + surrounding blank lines
- `handleRejectAll()`: processes all callouts in reverse offset order to preserve positions
- `createCalloutEffectListener()` bridges CM6 StateEffects → plugin handler methods
- `EditorView.updateListener` registered alongside StateField in editor extension array
- Three command palette commands with `editorCheckCallback`:
  - `accept-callout`: accept proposal at cursor
  - `reject-callout`: reject proposal at cursor
  - `reject-all-callouts`: reject all proposals in note
- `findCalloutAtLine()` maps cursor line to callout offset range for command fallback
- Accept/reject do NOT use `ownWrites` — modifications re-enter idle pipeline for re-embedding
- Exported `findCallouts` from decorations.ts for command and reject-all use
- **Next:** Phase 8 — E2E Testing

### 2026-03-31 — Phase 7a: CM6 callout decorations complete

- New `src/decorations.ts`: StateField, WidgetType, callout detection, button rendering
- `findCallouts()` scans document text for `> [!connection]` and `> [!ideation]` blocks
- `CalloutButtonWidget` renders inline accept/reject buttons on each callout header line
- Buttons dispatch `acceptCallout`/`rejectCallout` StateEffects (consumed by Phase 7b)
- `RangeSetBuilder` for sorted decoration construction
- Decorations rebuild on every document change via `tr.docChanged`
- Registered via `registerEditorExtension([calloutDecorationField])` in onload()
- Imports only `@codemirror/view` and `@codemirror/state` — both externalized, never bundled
- Inline styles use Obsidian CSS variables for theme compatibility
- **Next:** Phase 7b — Accept/Reject Logic

### 2026-03-31 — Phase 6: System 2 complete

- `findAgentPrompt()`: scans note for @agent tag, extracts surrounding paragraph as prompt
- `filterCandidatesSystem2()`: folder-scoped (default) or vault-scoped, with exclusions
- `buildSystem2Prompt()`: ideation prompt requesting synthesis across vault notes
- `generateSystem2Callout()`: shared `callLLM()` helper, validates [!ideation] in output
- Refactored retrieval.ts: extracted shared `formatResults`, `formatResultSections`, `callLLM`
- System 2 runs at any coverage level (no bootstrapComplete gate), before System 1
- Same atomic `vault.process()` write with idle re-check and `ownWrites` guard
- **Next:** Test harness, then Phase 7 — CM6 Decorations

### 2026-03-31 — Phase 5: Retrieval + System 1 complete

- New `src/retrieval.ts` (~230 lines): scope filters, cosine similarity, LLM generation
- BFS scope on `resolvedLinks` (bidirectional) with configurable hop depth
- Folder/tag exclusion filters, index membership check
- Cosine similarity: 4 independent top-K searches per compartment
- LLM prompt: labelled result sets + full note content → `gpt-4o-mini` via `requestUrl()`
- Deduplication: skips if all top candidates already in shadow `proposed` array
- Callout write via `vault.process()` with final idle re-check inside callback
- `ownWrites` guard prevents re-triggering idle from plugin's own callout append
- System 1 gated by `bootstrapComplete` flag from Phase 4
- **Next:** Phase 6 — System 2

### 2026-03-31 — Phase 4: Bootstrap complete

- `onLayoutReady()` → wait for `metadataCache 'resolved'` (unregister after first fire)
- Load all existing shadow files, match to vault notes via path hash
- Diff `mtime` to detect stale/missing entries → queue for re-embedding
- Queue sorted by recently modified first, processed in batches of 50
- `setTimeout(resolve, 0)` yields between batches to keep main thread responsive
- `bootstrapComplete` flag set after full queue processed — gates System 1 in Phase 5
- `hashPath()` exported from embedding.ts for bootstrap reverse-lookup
- **Next:** Phase 5 — Retrieval + System 1

### 2026-03-31 — Phase 3: Embedding complete

- Extracted to `src/embedding.ts` (~190 lines) — compartment extraction, API calls, shadow files, runtime index
- 4-compartment extraction: title (basename), tags (cache + frontmatter), links (cache + frontmatterLinks, internal refs stripped), content (vault.read)
- OpenAI `text-embedding-3-small` via `requestUrl()` — single batch call for all 4 compartments
- Shadow files: per-note JSON in `.obsidian/plugins/second-thoughts/embeddings/<hash>.json`
- `EmbeddingIndex` class: runtime Map with notePath↔hash reverse lookup
- `onNoteIdle()` now waits for metadataCache, extracts, embeds, saves shadow file
- Guards: no API key → Notice, already processing → skip, not active file → proceed
- Preserves existing `proposed` array across re-embeddings
- **Next:** Phase 4 — Bootstrap

### 2026-03-31 — Phase 2: Idle detection complete

- `vault.on('modify')` resets per-file debounce timer (Map<path, timeout>)
- `workspace.on('file-open')` and `workspace.on('active-leaf-change')` track active file
- Timer fires → check file is not active → `onNoteIdle()` logs to console
- All events via `registerEvent()`, filtered to `.md` TFiles
- `onunload()` clears all pending timers
- Debounce window reads from settings (default 5 min)
- **Next:** Phase 3 — Embedding

### 2026-03-31 — Phase 1: Skeleton complete

- Created build toolchain: `package.json`, `tsconfig.json`, `esbuild.config.mjs`
- esbuild targets ES2018 CommonJS with all CM6/Obsidian/Electron packages external
- `manifest.json` and `versions.json` per community standards
- `src/main.ts`: minimal Plugin subclass with `onload()`/`onunload()`, `loadSettings()`/`saveSettings()`
- `src/settings.ts`: `SecondThoughtsSettings` interface with all SDD Section 8 defaults, full `PluginSettingTab` with API key, debounce, scope, top-K, exclusions, agent tag
- Build outputs `main.js` to project root and copies to `second-thoughts-dev/.obsidian/plugins/second-thoughts/`
- Dev vault `community-plugins.json` updated to load the plugin
- **Next:** Phase 2 — Idle Detection
