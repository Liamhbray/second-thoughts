# Contributing to Second Thoughts

## Getting Started

```bash
git clone https://github.com/Liamhbray/second-thoughts.git
cd second-thoughts
npm install
echo "OPENAI_API_KEY=sk-..." > .env
```

First run only: open `seed-vault/` as a vault in Obsidian and enable the plugin.

```bash
npm run build     # Build + deploy to seed vault
npm test          # Unit tests
npm run e2e       # E2E tests (requires Obsidian running)
```

## Adding a New Feature

1. Copy `src/features/_template/` to `src/features/your-feature/`
2. Implement `activate.ts`, `pipeline.ts`, and `prompts.ts`
3. Add one line in `src/main.ts`:
   ```typescript
   import { activateYourFeature } from "./features/your-feature/activate";
   // In onload():
   activateYourFeature(this, services);
   ```
4. Add tests (see `src/features/_template/TESTING.md`)

### Rules

- Features only import from `core/` and `obsidian` — never from sibling features
- Use `services.llm` for all LLM calls (swappable provider)
- Use `vault.process()` for all file writes (atomic)
- Use `requestUrl()` for network calls (not `fetch()`)
- Use `createEl()` for DOM creation (not `innerHTML`)
- Don't use `selection` as a property name on Modal subclasses (reserved by Obsidian)

## Architecture

```
src/
  core/         — shared infrastructure (LLM, embedding, similarity, idle, settings)
  features/     — isolated feature modules (footnotes, ideation)
  main.ts       — thin wiring
```

See `README.md` for the full architecture diagram.

## Releasing

```bash
npm version patch   # or minor/major — bumps manifest.json + versions.json
git push --follow-tags
```

The GitHub Actions workflow builds, tests, and creates a release with `main.js`, `manifest.json`, and `styles.css` attached.
