# Changelog

## 1.0.0

### Features

- **Footnotes** — Automated connection discovery. The plugin analyses notes on idle and proposes relationships as native Obsidian footnotes with `*(Second Thoughts)*` markers. Threshold-based: only connections above the configured confidence level are generated.
- **Ideation** — Modal-driven cross-cluster bridging. Select text, invoke "Ask Second Thoughts", and receive novel ideas that connect notes from different areas of your vault using Maximal Marginal Relevance.
- **Configurable model** — Choose between gpt-4o-mini (fast/cheap) and gpt-4o (creative) for ideation.
- **Feature toggles** — Enable/disable footnotes and ideation independently.

### Architecture

- Modular feature-activate pattern with shared Services infrastructure.
- LLMProvider interface for future provider swapping.
- Feature template (`src/features/_template/`) for adding new features.
- Automated E2E test suite via Obsidian CLI.
- 27 unit tests + 8 E2E tests.
