# Second Thoughts

An Obsidian plugin that surfaces AI-generated connections and ideas from your vault. Two independent systems propose contextual links and synthesised responses, presented as inline callouts you can accept or reject.

## Features

### System 1 — Relational Connector

Runs automatically in the background. When you stop editing a note, the plugin analyses its content against nearby notes (by link distance) and proposes connections you may have missed.

Proposals appear as `[!connection]` callouts with reasoning explaining why the link is relevant.

### System 2 — Ideation Agent

Triggered explicitly by writing `@agent` in a note followed by a question or prompt. The plugin synthesises knowledge from across your vault to generate a response.

Responses appear as `[!ideation]` callouts with cited sources from your notes.

### Accept / Reject

Each proposal includes inline **Accept** and **Reject** buttons:

- **Accept** strips the callout formatting and keeps the content as plain text
- **Reject** removes the entire callout block

Commands are also available in the command palette:
- `Second Thoughts: Accept proposal at cursor`
- `Second Thoughts: Reject proposal at cursor`
- `Second Thoughts: Reject all proposals`

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
| System 1 Hop Depth | 3 | How many link hops to search for related notes |
| System 2 Scope | folder | Default scope for ideation queries (`folder` or `vault`) |
| Top-K per Compartment | 5 | Number of similar results to retrieve per category |
| Excluded Folders | — | Folders to exclude from analysis |
| Excluded Tags | — | Tags to exclude from analysis |
| Agent Tag | `@agent` | Marker that triggers System 2 |

## How It Works

1. **Idle detection** — The plugin watches for file modifications and starts a debounce timer. When you stop editing and navigate away, processing begins.
2. **Embedding** — Note content is split into four compartments (title, tags, links, content) and embedded via OpenAI's `text-embedding-3-small` model. Embeddings are cached as shadow files.
3. **Retrieval** — Candidate notes are found via link-distance BFS, then ranked by cosine similarity across all compartments.
4. **Generation** — An LLM synthesises the retrieved context into a proposal, which is appended as a callout.

All file writes use Obsidian's atomic `vault.process()` API. All network calls use `requestUrl()`. The plugin never modifies your existing content — proposals are always additive.

## Development

```bash
git clone https://github.com/Liamhbray/second-thoughts.git
cd second-thoughts
npm install
```

Add your OpenAI API key to the seed vault settings:

```bash
# Edit seed-vault/.obsidian/plugins/second-thoughts/data.json
# Set "apiKey" to your key
```

Open the `seed-vault` folder as a vault in Obsidian (one-time setup), then enable the plugin in **Settings > Community Plugins**.

```bash
npm run build     # Build and deploy to seed vault
npm test          # Run unit tests (33 tests, pure functions)
npm run e2e       # Run E2E tests against seed vault (requires Obsidian running)
```

The E2E suite auto-opens the vault, bootstraps embeddings for 17 whale-themed notes, and tests the full pipeline: embedding, System 1/2 proposals, deduplication, accept/reject.

## Privacy

Note content is sent to the OpenAI API for embedding and generation. No data is stored externally. Embeddings are cached locally in your vault's plugin data directory.

## License

[MIT](LICENSE)
