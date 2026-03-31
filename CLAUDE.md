# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Obsidian community plugin (TypeScript) that augments notes with AI-generated footnotes (automated connections) and ideation callouts (on-demand synthesis).

## Status

Footnotes feature implemented on `feature/footnotes` branch. E2E tests passing (10/10). Ideation system still uses `[!ideation]` callouts — pending refactor to modal workflow.

## Key Files

- `src/main.ts` — Plugin entry point. Idle detection, bootstrap, footnote pipeline, ideation orchestration, post-processor for callout buttons.
- `src/embedding.ts` — Compartment extraction, OpenAI embedding calls, shadow file I/O, runtime index.
- `src/retrieval.ts` — BFS scope filtering, cosine similarity, footnote reason generation, ideation callout generation.
- `src/decorations.ts` — Callout detection (`findCallouts`), footnote utilities (`nextFootnoteId`, `formatFootnote`, `stripFootnoteMarker`, `removeFootnote`).
- `src/settings.ts` — Settings interface, defaults, and PluginSettingTab.
- `e2e.sh` — Automated E2E test suite using Obsidian CLI against the seed vault.
- `seed-vault/` — Whale-themed test vault with 17 interconnected notes. Used by E2E and build.
- `.env` — Local OpenAI API key (`OPENAI_API_KEY=sk-...`). Injected into seed vault by build and E2E scripts.

## Key Technical Decisions

- **Native Obsidian footnotes** (`[^st-N]`) for connection proposals. `*(Second Thoughts)*` marker identifies AI-generated footnotes. `Notice` shown on creation.
- **`registerMarkdownPostProcessor`** for ideation callout Accept/Reject buttons (reading mode only).
- **Paragraph-level placement** — footnote references inserted at the most semantically relevant paragraph, not end of file.
- **Dual deduplication** — shadow file `proposed` array + file-content scan inside `vault.process()`.
- **`vault.process()`** for all file writes (atomic). Never `vault.append()` or `vault.modify()`.
- **`requestUrl()`** for all network calls (not `fetch()`). Community review requirement.
- **Shadow files** (one JSON per note) for embedding storage. Not `data.json`.
- **`metadataCache.resolvedLinks`** to detect cache readiness (not `metadataCache.resolved` which doesn't exist in 1.12.x).
- **Obsidian CLI eval** requires `(async () => { ... })()` wrapper for await. Only `vault.modify()`/`vault.process()` trigger `vault.on('modify')` events — adapter methods do not.

## Build & Test

```bash
npm run build     # Build + deploy to seed-vault + inject .env API key
npm test          # 33 unit tests (pure functions, no Obsidian mocking)
npm run e2e       # 10 E2E tests via Obsidian CLI (requires Obsidian running)
```
