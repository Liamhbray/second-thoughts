#!/bin/bash
# e2e.sh — End-to-end test for Second Thoughts plugin
# Requires: Obsidian 1.12+ running with CLI enabled, seed-vault open
# Uses the seed vault's existing whale notes — no synthetic files created.
# Usage: npm run e2e

set -euo pipefail

VAULT="seed-vault"
PLUGIN="second-thoughts"
TIMEOUT=120
POLL_INTERVAL=2

# Seed vault notes used by tests
SYSTEM1_NOTE="Biology/Blue Whales.md"       # dense links, good System 1 candidate
SYSTEM2_NOTE="Culture/Moby-Dick.md"         # kept for cleanup
SWITCH_NOTE="Ecology/Ocean Currents.md"     # switch-away target
SEED_COUNT=17                               # expected note count in seed vault

pass=0
fail=0
total=0

# --- Helpers ---

# CLI eval: parse "=> <result>" from output, discard loading messages.
eval_ob() {
  obsidian vault="$VAULT" eval code="$1" 2>/dev/null | sed -n 's/^=> //p'
}

# Async eval: wraps code in async IIFE (bare await unsupported in CLI eval).
aeval_ob() {
  eval_ob "(async () => { $1 })()"
}

P="app.plugins.plugins['$PLUGIN']"

assert_true() {
  local desc="$1" check="$2"
  ((total++))
  local result
  result=$(eval_ob "$check")
  if [ "$result" = "true" ]; then
    echo "  PASS: $desc"
    ((pass++))
  else
    echo "  FAIL: $desc (got: $result)"
    ((fail++))
  fi
}

assert_gte() {
  local desc="$1" actual="$2" expected="$3"
  ((total++))
  if [ "$actual" -ge "$expected" ] 2>/dev/null; then
    echo "  PASS: $desc ($actual >= $expected)"
    ((pass++))
  else
    echo "  FAIL: $desc (expected >= $expected, got '$actual')"
    ((fail++))
  fi
}

assert_eq() {
  local desc="$1" actual="$2" expected="$3"
  ((total++))
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $desc"
    ((pass++))
  else
    echo "  FAIL: $desc (expected '$expected', got '$actual')"
    ((fail++))
  fi
}

wait_for() {
  local desc="$1" check="$2" max="${3:-$TIMEOUT}"
  ((total++))
  local elapsed=0
  while [ $elapsed -lt $max ]; do
    local result
    result=$(eval_ob "$check" || echo "false")
    if [ "$result" = "true" ]; then
      echo "  PASS: $desc (${elapsed}s)"
      ((pass++))
      return 0
    fi
    sleep $POLL_INTERVAL
    ((elapsed+=POLL_INTERVAL))
  done
  echo "  FAIL: $desc (timed out after ${max}s)"
  ((fail++))
  return 1
}

await_for() {
  local desc="$1" check="$2" max="${3:-$TIMEOUT}"
  wait_for "$desc" "(async () => { $check })()" "$max"
}

switch_away() {
  aeval_ob "await app.workspace.openLinkText('$SWITCH_NOTE', '', false)" > /dev/null 2>&1
  sleep 1
}

# Modify a file via vault.modify() to trigger vault 'modify' event.
trigger_modify() {
  local path="$1"
  aeval_ob "const f = app.vault.getFileByPath('$path'); const c = await app.vault.read(f); await app.vault.modify(f, c + '\\n'); return 'ok';" > /dev/null 2>&1
}

# Strip all callouts from a file.
strip_callouts() {
  local path="$1"
  aeval_ob "
    const f = app.vault.getFileByPath('$path');
    await app.vault.process(f, (data) => {
      return data.replace(/\\n?> \\[!(connection|ideation)\\][^]*?(?=\\n[^>]|$)/gm, '').trimEnd() + '\\n';
    });
    return 'stripped';
  " > /dev/null 2>&1
}

# Strip all Second Thoughts footnotes from a file.
strip_footnotes() {
  local path="$1"
  aeval_ob "
    const f = app.vault.getFileByPath('$path');
    await app.vault.process(f, (data) => {
      let r = data.replace(/\\[\\^st-\\d+\\](?!:)/g, '');
      r = r.replace(/^\\[\\^st-\\d+\\]:.*\\n?/gm, '');
      return r.trimEnd() + '\\n';
    });
    return 'stripped';
  " > /dev/null 2>&1
}

# --- Pre-flight ---

echo "=== Pre-flight checks ==="

if ! command -v obsidian &> /dev/null; then
  echo "  ERROR: 'obsidian' CLI not found. Enable in Obsidian Settings > General > CLI."
  exit 1
fi

# Ensure Obsidian is running with the seed vault open
vault_check=$(eval_ob "typeof app.vault" 2>/dev/null || echo "unreachable")
if [ "$vault_check" = "unreachable" ]; then
  echo "  Opening vault '$VAULT' in Obsidian..."
  open "obsidian://open?vault=$VAULT"
  elapsed=0
  while [ $elapsed -lt 30 ]; do
    sleep 2
    ((elapsed+=2))
    vault_check=$(eval_ob "typeof app.vault" 2>/dev/null || echo "unreachable")
    if [ "$vault_check" = "object" ]; then break; fi
  done
  if [ "$vault_check" != "object" ]; then
    echo "  ERROR: Timed out waiting for Obsidian to open vault '$VAULT'"
    exit 1
  fi
fi

echo "  Obsidian CLI connected to vault '$VAULT'"

# Verify seed notes exist
note_count=$(eval_ob "app.vault.getMarkdownFiles().length")
if [ "$note_count" -lt "$SEED_COUNT" ] 2>/dev/null; then
  echo "  ERROR: Expected $SEED_COUNT+ notes in seed vault, found $note_count"
  exit 1
fi
echo "  Seed vault has $note_count notes"

# --- Setup ---

echo ""
echo "=== Setup ==="

# Inject API key from .env into plugin settings
ENV_FILE="$(dirname "$0")/.env"
DATA_JSON="$VAULT/.obsidian/plugins/$PLUGIN/data.json"
if [ -f "$ENV_FILE" ]; then
  API_KEY=$(grep '^OPENAI_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
  if [ -n "$API_KEY" ]; then
    python3 -c "
import json, sys
with open('$DATA_JSON') as f: d = json.load(f)
d['apiKey'] = '$API_KEY'
with open('$DATA_JSON', 'w') as f: json.dump(d, f, indent=2)
print('  done')
" 2>/dev/null && echo "  Injected API key from .env"
  fi
elif [ "$(python3 -c "import json; print(json.load(open('$DATA_JSON'))['apiKey'])" 2>/dev/null)" = "" ]; then
  echo "  ERROR: No .env file and no API key in data.json"
  exit 1
fi

# Clear stale embeddings and callouts from prior runs
EMBED_DIR="$VAULT/.obsidian/plugins/$PLUGIN/embeddings"
if [ -d "$EMBED_DIR" ]; then
  rm -f "$EMBED_DIR"/*.json
  echo "  Cleared embedding cache"
fi

strip_callouts "$SYSTEM1_NOTE"
strip_callouts "$SYSTEM2_NOTE"
strip_footnotes "$SYSTEM1_NOTE"
strip_footnotes "$SYSTEM2_NOTE"
echo "  Stripped leftover callouts and footnotes from test notes"

# Reload plugin for clean state
obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
sleep 3
echo "  Plugin reloaded"

# --- Test 1: Bootstrap ---

echo ""
echo "=== Test 1: Bootstrap ==="

wait_for "Bootstrap completes" \
  "$P.getDebugState().bootstrapComplete" \
  "$TIMEOUT"

# --- Test 2: Embedding ---

echo ""
echo "=== Test 2: Embedding ==="

index_size=$(eval_ob "$P.getDebugState().indexSize")
assert_gte "Index has $SEED_COUNT+ entries" "$index_size" "$SEED_COUNT"

wait_for "System 1 note indexed" \
  "$P.getDebugState().hasEntry('$SYSTEM1_NOTE')" \
  "$TIMEOUT"


# --- Test 3: System 1 — Footnote Proposal ---

echo ""
echo "=== Test 3: System 1 (Footnotes) ==="

trigger_modify "$SYSTEM1_NOTE"
switch_away

await_for "Blue Whales gets footnote" \
  "return (await app.vault.adapter.read('$SYSTEM1_NOTE')).includes('[^st-')" \
  "$TIMEOUT" || true

# --- Test 4: Ideation command registered ---

echo ""
echo "=== Test 4: Ideation Command ==="

assert_true "Ideation command registered" \
  "!!app.commands.commands['$PLUGIN:ideate']"

# --- Test 5: Deduplication ---

echo ""
echo "=== Test 5: Deduplication ==="

count_before=$(aeval_ob "return ((await app.vault.adapter.read('$SYSTEM1_NOTE')).match(/\\[\\\\^st-\\d+\\]:/g)||[]).length")

trigger_modify "$SYSTEM1_NOTE"
switch_away
sleep 15

count_after=$(aeval_ob "return ((await app.vault.adapter.read('$SYSTEM1_NOTE')).match(/\\[\\\\^st-\\d+\\]:/g)||[]).length")
assert_eq "No duplicate footnote on Blue Whales" "$count_after" "$count_before"

# --- Test 6: ownWrites guard ---

echo ""
echo "=== Test 6: ownWrites ==="

assert_true "No idle timer after own write" \
  "!$P.getDebugState().idleTimerPaths.includes('$SYSTEM1_NOTE')"

# --- Test 7: Footnote has AI marker ---

echo ""
echo "=== Test 7: AI Marker ==="

assert_true "Footnote has *(Second Thoughts)* marker" \
  "(async () => { return (await app.vault.adapter.read('$SYSTEM1_NOTE')).includes('*(Second Thoughts)*') })()"

# --- Cleanup ---

echo ""
echo "=== Cleanup ==="

# Restore seed notes to their original state
strip_callouts "$SYSTEM1_NOTE"
strip_callouts "$SYSTEM2_NOTE"
strip_footnotes "$SYSTEM1_NOTE"
strip_footnotes "$SYSTEM2_NOTE"

# Clear embeddings so next run starts fresh
rm -f "$EMBED_DIR"/*.json

obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
echo "  Restored seed notes and reloaded plugin"

# --- Results ---

echo ""
echo "================================"
echo "  Results: $pass/$total passed"
if [ $fail -gt 0 ]; then
  echo "  $fail FAILED"
  echo "================================"
  exit 1
else
  echo "  All tests passed"
  echo "================================"
  exit 0
fi
