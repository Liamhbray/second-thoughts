# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Obsidian community plugin (TypeScript) that augments notes with AI-generated proposals — relational links and tagged agent responses.

## Status

All 9 implementation phases complete. E2E tests passing (10/10). Ready for real-vault testing and community submission.

## Key Files

- `src/main.ts` — Plugin entry point. Idle detection, bootstrap, System 1/2 orchestration, accept/reject commands.
- `src/embedding.ts` — Compartment extraction, OpenAI embedding calls, shadow file I/O, runtime index.
- `src/retrieval.ts` — BFS scope filtering, cosine similarity, LLM prompt generation, callout formatting.
- `src/decorations.ts` — CM6 StateField for inline accept/reject buttons on callouts.
- `src/settings.ts` — Settings interface, defaults, and PluginSettingTab.
- `e2e.sh` — Automated E2E test suite using Obsidian CLI. Tests all 8 features against the seed vault.
- `seed-vault/` — Whale-themed test vault with 17 interconnected notes. Used by E2E and build.
- `.env` — Local OpenAI API key (`OPENAI_API_KEY=sk-...`). Injected into seed vault by build and E2E scripts.

## Key Technical Decisions

- **CM6 decorations** for inline accept/reject buttons on callouts (StateField, not ViewPlugin). Import `@codemirror/view` and `@codemirror/state` from Obsidian — never bundle your own CM6 packages.
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

