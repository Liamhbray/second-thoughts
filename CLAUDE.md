# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Obsidian community plugin (TypeScript) that augments notes with AI-generated footnotes (automated connections) and cross-cluster bridging ideas (on-demand via modal).

## Status

Feature branch `feature/ideas` — implementing modal-driven ideation with MMR-based diverse retrieval. Footnotes feature complete. E2E 8/8 + unit tests 27/27 passing.

## Key Files

- `src/main.ts` — Plugin entry point. Idle detection, bootstrap, footnote pipeline, post-processor for `<!-- st-idea -->` markers, ideation command.
- `src/embedding.ts` — Compartment extraction, OpenAI embedding calls, shadow file I/O, runtime index.
- `src/retrieval.ts` — BFS scope filtering, cosine similarity, footnote reason generation, MMR diverse selection (`selectDiverseResults`), cross-cluster bridging ideation (`generateBridgingIdeas`), on-the-fly text embedding (`embedText`).
- `src/ideation-modal.ts` — `IdeationModal` class. Prompt input with selection context, loading state, multi-idea display with per-idea Accept/Dismiss.
- `src/decorations.ts` — Callout detection (`findCallouts`), footnote utilities (`nextFootnoteId`, `formatFootnote`).
- `src/settings.ts` — Settings interface with feature toggles, grouped settings UI.
- `styles.css` — `.st-ai-generated` blue left-border styling for accepted ideas.
- `e2e.sh` — Automated E2E test suite using Obsidian CLI against the seed vault.
- `seed-vault/` — Whale-themed test vault with 17 interconnected notes.
- `.env` — Local OpenAI API key. Injected into seed vault by build and E2E scripts.

## Key Technical Decisions

- **Native Obsidian footnotes** (`[^st-N]`) for connection proposals. `*(Second Thoughts)*` marker identifies AI-generated footnotes.
- **Cross-cluster bridging** via Maximal Marginal Relevance (MMR) for ideation — balances relevance with diversity among retrieved notes.
- **`selectedText`** property name on Modal subclass — `selection` is reserved by Obsidian's Modal base class and gets overwritten between constructor and `onOpen`.
- **`<!-- st-idea -->` HTML comments** for idea markers — `%%comments%%` are stripped in reading mode, but HTML comments survive and are accessible to the post-processor.
- **`callLLM` accepts model parameter** — footnotes use `gpt-4o-mini`, ideation model is configurable.
- **`vault.process()`** for all file writes (atomic).
- **`requestUrl()`** for all network calls (not `fetch()`).
- **Shadow files** (one JSON per note) for embedding storage.
- **`metadataCache.resolvedLinks`** to detect cache readiness (not `metadataCache.resolved`).
- **Obsidian CLI eval** requires `(async () => { ... })()` wrapper for await.

## Build & Test

```bash
npm run build     # Build + deploy to seed-vault + inject .env API key
npm test          # 27 unit tests (pure functions, no Obsidian mocking)
npm run e2e       # 8 E2E tests via Obsidian CLI (requires Obsidian running)
```
