## What does this PR do?

<!-- A brief description of the change. -->

## Why?

<!-- Link to an issue or explain the motivation. -->

## How to test

<!-- Steps for reviewers to verify the change. -->

- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manually tested in Obsidian (if applicable)

## Checklist

- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] Features only import from `core/` — no cross-feature imports
- [ ] No new `fetch()` calls (use `requestUrl()`)
- [ ] No new `innerHTML` usage (use `createEl()`)
