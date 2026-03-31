# Second Thoughts

An Obsidian plugin that surfaces AI-generated connections and ideas from your vault. Two independent systems discover relationships and synthesise responses, presented as native footnotes and inline callouts.

## Features

### Footnotes — Automated Connections

Runs automatically in the background. When you stop editing a note and navigate away, the plugin analyses its content against nearby notes (by link distance) and proposes connections as native Obsidian footnotes.

A superscript reference is placed at the most relevant paragraph, with the footnote definition at the bottom:

```markdown
Sperm whales are the deepest-diving mammals.[^st-1]

---

[^st-1]: See [[Whale Diving]] — both notes explore physiological
adaptations enabling cetaceans to withstand extreme depth. *(Second Thoughts)*
```

The `*(Second Thoughts)*` marker identifies AI-generated footnotes. Remove it when you've reviewed the connection, or delete the footnote entirely if it's not useful.

A notification appears when a footnote is added (e.g. `Sperm Whales → [[Whale Diving]]`).

### Ideation — On-Demand Synthesis

Triggered explicitly by writing `@agent` in a note followed by a question or prompt. The plugin synthesises knowledge from across your vault to generate a response.

Responses appear as `[!ideation]` callouts with cited sources from your notes. Accept/Reject buttons appear in reading mode.

## Requirements

- Obsidian 1.12.0 or later (desktop only)
- An OpenAI API key (for embeddings and LLM generation)

## Installation

1. Open **Settings > Community Plugins > Browse**
2. Search for "Second Thoughts"
3. Install and enable the plugin
4. Go to **Settings > Second Thoughts** and enter your OpenAI API key

### Manual Installation

1. Download `main.js`, `manifest.json` from the [latest release](https://github.com/Liamhbray/second-thoughts/releases/latest)
2. Create a folder `second-thoughts` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into that folder
4. Enable the plugin in **Settings > Community Plugins**

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| API Key | — | Your OpenAI API key (required) |
| Idle Debounce | 5 min | Time after last edit before processing a note |
| Hop Depth | 3 | How many link hops to search for related notes |
| Ideation Scope | folder | Default scope for ideation queries (`folder` or `vault`) |
| Top-K per Compartment | 5 | Number of similar results to retrieve per category |
| Excluded Folders | — | Folders to exclude from analysis |
| Excluded Tags | — | Tags to exclude from analysis |
| Agent Tag | `@agent` | Marker that triggers ideation |

## How It Works

1. **Idle detection** — The plugin watches for file modifications and starts a debounce timer. When you stop editing and navigate away, processing begins.
2. **Embedding** — Note content is split into four compartments (title, tags, links, content) and embedded via OpenAI's `text-embedding-3-small` model. Embeddings are cached as shadow files.
3. **Retrieval** — Candidate notes are found via link-distance BFS, then ranked by cosine similarity across all compartments.
4. **Footnote generation** — An LLM produces a short reason explaining the connection. The plugin formats it as a native Obsidian footnote and inserts it at the most relevant paragraph.

All file writes use Obsidian's atomic `vault.process()` API. All network calls use `requestUrl()`. The plugin never modifies your existing content — footnotes and callouts are always additive.

## Development

```bash
git clone https://github.com/Liamhbray/second-thoughts.git
cd second-thoughts
npm install
```

Add your OpenAI API key:

```bash
echo "OPENAI_API_KEY=sk-..." > .env
```

The build and E2E scripts inject this into the seed vault settings automatically.

First run only: open the `seed-vault` folder as a vault in Obsidian (**Open another vault > Open folder as vault**) and enable the plugin in **Settings > Community Plugins**. After that, the E2E script opens the vault automatically.

```bash
npm run build     # Build and deploy to seed vault
npm test          # Run unit tests (33 tests, pure functions)
npm run e2e       # Run E2E tests against seed vault (requires Obsidian running)
```

The E2E suite auto-opens the vault, bootstraps embeddings for 17 whale-themed notes, and tests the full pipeline: embedding, footnote generation, deduplication, and ideation.

## Privacy

Note content is sent to the OpenAI API for embedding and generation. No data is stored externally. Embeddings are cached locally in your vault's plugin data directory.

## License

[MIT](LICENSE)
