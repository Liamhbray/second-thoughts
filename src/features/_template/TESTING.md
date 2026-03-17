# Testing Guide for New Features

## Unit Tests

Unit tests live in `src/__tests__/` and use [Vitest](https://vitest.dev/). They test pure functions only — no Obsidian API mocking.

### Adding tests for your feature

1. Create `src/__tests__/your-feature.test.ts`
2. Import only pure functions (prompts, formatting, similarity)
3. Run with `npm test`

```typescript
import { describe, it, expect } from "vitest";
import { yourFunction } from "../features/your-feature/format";

describe("yourFunction", () => {
    it("does the thing", () => {
        expect(yourFunction("input")).toBe("output");
    });
});
```

### What to test

- **Format functions** — string manipulation, ID generation, marker detection
- **Similarity functions** — cosine similarity, MMR selection (use mock embeddings)
- **Prompt builders** — verify prompt structure (don't call the LLM)

### What NOT to test (in unit tests)

- Anything that needs `app`, `vault`, or `workspace` — these are Obsidian APIs
- LLM calls — these hit the network
- File I/O — embedding caches, vault reads/writes

## E2E Tests

E2E tests live in `e2e.sh` and run against a real Obsidian instance via the CLI.

### How the E2E harness works

The script uses these helpers:

```bash
# Evaluate JavaScript in Obsidian's context
eval_ob "expression"              # sync, returns result
aeval_ob "await something()"      # async, wrapped in IIFE

# Assertions
assert_true "description" "js expression that returns true/false"
assert_eq "description" "$actual" "$expected"
assert_gte "description" "$actual" "$minimum"

# Wait for a condition (polls every 2s, up to TIMEOUT)
wait_for "description" "sync js expression" $TIMEOUT
await_for "description" "return async expression" $TIMEOUT

# Trigger the idle pipeline on a note
trigger_modify "path/to/Note.md"
switch_away  # navigate to a different note so idle fires
```

### Adding E2E tests for your feature

1. Open `e2e.sh`
2. Add your test section before the `# --- Cleanup ---` section
3. Follow this pattern:

```bash
# --- Test N: Your Feature ---

echo ""
echo "=== Test N: Your Feature ==="

# If your feature runs on idle:
trigger_modify "Biology/Blue Whales.md"
switch_away
await_for "Description of what should happen" \
  "return (await app.vault.adapter.read('Biology/Blue Whales.md')).includes('expected text')" \
  "$TIMEOUT"

# If your feature registers a command:
assert_true "Command registered" \
  "!!app.commands.commands['$PLUGIN:your-command-id']"

# If your feature modifies plugin state:
assert_true "State changed" \
  "$P.getDebugState().someProperty"
```

4. Add cleanup if your test modifies seed vault files:

```bash
# In the Cleanup section, add:
strip_your_feature "$SYSTEM1_NOTE"
```

### Accessing plugin state

The plugin exposes `getDebugState()` for testing:

```javascript
app.plugins.plugins['second-thoughts'].getDebugState()
// Returns: { indexSize, bootstrapComplete, processingPaths, idleTimerPaths, hasEntry(path), getProposed(path) }
```

If your feature needs additional debug state, add it to `getDebugState()` in `main.ts`.

### Running tests

```bash
npm run build     # Must build before E2E (deploys to seed vault)
npm test          # Unit tests only
npm run e2e       # E2E tests (requires Obsidian running with seed-vault open)
```

### Key gotchas

- **Obsidian CLI eval**: bare `await` doesn't work — use `aeval_ob` which wraps in `(async () => { ... })()`
- **vault.modify()** triggers events; `vault.adapter.write()` does NOT
- **Idle debounce**: seed vault uses 0.1 minutes (6 seconds) for fast testing
- **Embedding**: bootstrap must complete before features that depend on the index
- **Cleanup**: always restore seed vault notes to original state after tests
