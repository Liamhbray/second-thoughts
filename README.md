# Second Thoughts

An Obsidian plugin that surfaces AI-generated connections and ideas from your vault. Two independent features discover relationships and synthesise novel ideas, using your notes as the sole knowledge source.

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

### Ideation — Cross-Cluster Bridging

Invoke via command palette (`Cmd/Ctrl+P` → "Ask Second Thoughts"). Select text first for context, or run with no selection to use the full note.

The plugin finds notes that are relevant to your selection but diverse from each other — pulling from different areas of your vault. It then generates concise bridging ideas that connect concepts you haven't explicitly linked.

Each idea can be individually accepted (inserted at cursor) or dismissed.

## Requirements

- Obsidian 1.12.0 or later (desktop only)
- An OpenAI API key (for embeddings and LLM generation)

## Installation

1. Open **Settings > Community Plugins > Browse**
2. Search for "Second Thoughts"
3. Install and enable the plugin
4. Go to **Settings > Second Thoughts** and enter your OpenAI API key

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/Liamhbray/second-thoughts/releases/latest)
2. Create a folder `second-thoughts` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into that folder
4. Enable the plugin in **Settings > Community Plugins**

## Settings

### Features

| Setting | Default | Description |
|---------|---------|-------------|
| Enable footnotes | On | Auto-generate footnote connections on idle |
| Enable ideation | On | Show the "Ask Second Thoughts" command |

### Footnotes

| Setting | Default | Description |
|---------|---------|-------------|
| Processing delay | 5 min | Time after last edit before footnote generation |
| Footnote link depth | 3 | How many link hops to search for related notes |
| Retrieval depth | 5 | Number of similar notes to consider per search |

### Ideation

| Setting | Default | Description |
|---------|---------|-------------|
| Ideation model | gpt-4o-mini | gpt-4o-mini is fast and cheap; gpt-4o is more creative |
| Ideas per generation | 3 | Number of bridging ideas per request |

### Exclusions

| Setting | Default | Description |
|---------|---------|-------------|
| Excluded folders | — | Folders exempt from all processing |
| Excluded tags | — | Tags that exempt notes from processing |

## How It Works

### Footnotes

1. **Idle detection** — The plugin watches for file modifications and starts a debounce timer. When you stop editing and navigate away, processing begins.
2. **Embedding** — Note content is split into four compartments (title, tags, links, content) and embedded via OpenAI's `text-embedding-3-small` model. Embeddings are cached as shadow files.
3. **Retrieval** — Candidate notes are found via link-distance BFS, then ranked by cosine similarity.
4. **Generation** — An LLM produces a short reason explaining the connection, formatted as a native Obsidian footnote.

### Ideation

1. **Selection** — The user highlights text and runs the command. The selection is embedded on the fly.
2. **Diverse retrieval** — Maximal Marginal Relevance (MMR) selects notes that are relevant to the selection but dissimilar to each other, pulling from different thought clusters.
3. **Bridging** — The LLM generates concise ideas that connect concepts across the diverse source notes.

All file writes use Obsidian's atomic `vault.process()` API. All network calls use `requestUrl()`. The plugin never modifies your existing content — footnotes and ideas are always additive.

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
npm test          # Run unit tests (27 tests, pure functions)
npm run e2e       # Run E2E tests against seed vault (requires Obsidian running)
```

The E2E suite auto-opens the vault, bootstraps embeddings for 17 whale-themed notes, and tests the full pipeline: embedding, footnote generation, deduplication, and ideation command registration.

## Privacy

Note content is sent to the OpenAI API for embedding and generation. No data is stored externally. Embeddings are cached locally in your vault's plugin data directory.

## License

[MIT](LICENSE)
