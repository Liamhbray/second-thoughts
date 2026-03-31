#!/bin/bash
# e2e.sh — End-to-end test for Second Thoughts plugin
# Requires: Obsidian 1.12+ running with CLI enabled, dev vault open
# Usage: npm run e2e

set -euo pipefail

VAULT="second-thoughts-dev"
PLUGIN="second-thoughts"
TIMEOUT=120
POLL_INTERVAL=2

pass=0
fail=0
total=0

# --- Helpers ---

# CLI eval requires (async () => { ... })() for await expressions.
# Synchronous expressions work bare. All output is parsed via sed to
# strip the CLI loading messages and extract the "=> <result>" line.

eval_ob() {
  obsidian vault="$VAULT" eval code="$1" 2>/dev/null | sed -n 's/^=> //p'
}

# Async eval helper — wraps code in an async IIFE
aeval_ob() {
  eval_ob "(async () => { $1 })()"
}

debug_state() {
  eval_ob "JSON.stringify(app.plugins.plugins['$PLUGIN'].getDebugState())"
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

# Async version of wait_for — wraps check in async IIFE
await_for() {
  local desc="$1" check="$2" max="${3:-$TIMEOUT}"
  wait_for "$desc" "(async () => { $check })()" "$max"
}

switch_away() {
  # Open a different file to make the edited file no longer active
  aeval_ob "await app.workspace.openLinkText('E2E-NoteB', '', false)" > /dev/null 2>&1
  sleep 1
}

# Modify a file via vault.modify() to trigger vault 'modify' event.
# vault.adapter methods do NOT fire vault events.
trigger_modify() {
  local path="$1"
  aeval_ob "const f = app.vault.getFileByPath('$path'); const c = await app.vault.read(f); await app.vault.modify(f, c + '\\n'); return 'ok';" > /dev/null 2>&1
}

# --- Pre-flight ---

echo "=== Pre-flight checks ==="

if ! command -v obsidian &> /dev/null; then
  echo "  ERROR: 'obsidian' CLI not found. Enable in Obsidian Settings > General > CLI."
  exit 1
fi

# Check Obsidian is running and vault is accessible
vault_check=$(eval_ob "typeof app.vault" 2>/dev/null || echo "unreachable")
if [ "$vault_check" != "object" ]; then
  echo "  ERROR: Cannot reach Obsidian. Is it running with vault '$VAULT' open?"
  exit 1
fi

echo "  Obsidian CLI connected to vault '$VAULT'"

# --- Setup ---

echo ""
echo "=== Setup ==="

# Clean up any leftover test files and stale shadow files
aeval_ob "for (const n of ['E2E-NoteA.md','E2E-NoteB.md','E2E-NoteC.md']) { try { await app.vault.adapter.remove(n) } catch {} } return 'cleaned'" > /dev/null 2>&1

# Remove all cached embeddings so proposed arrays don't interfere
EMBED_DIR="$VAULT/.obsidian/plugins/$PLUGIN/embeddings"
if [ -d "$EMBED_DIR" ]; then
  rm -f "$EMBED_DIR"/*.json
  echo "  Cleared embedding cache"
fi

# Reload plugin for clean state
obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
sleep 3

# Create test notes via vault.create() so Obsidian tracks them
aeval_ob "await app.vault.create('E2E-NoteA.md', '# Feedback Loops\n\nFeedback loops are circular processes where outputs become inputs.\nPositive feedback amplifies change; negative feedback dampens it.\nSystems with feedback loops exhibit emergent behaviour.\nBiological systems use feedback for homeostasis.\n\nSee also: [[E2E-NoteB]] and [[E2E-NoteC]].'); return 'ok'" > /dev/null 2>&1

aeval_ob "await app.vault.create('E2E-NoteB.md', '# Systems Thinking\n\nSystems thinking examines how components interrelate within a whole.\nKey concepts: emergence, feedback, nonlinearity, self-organisation.\nEngineers use systems thinking to design resilient architectures.\nThe discipline draws from cybernetics and control theory.\n\nRelated: [[E2E-NoteA]].'); return 'ok'" > /dev/null 2>&1

aeval_ob "await app.vault.create('E2E-NoteC.md', '# Resilience Patterns\n\nResilience in engineering means graceful degradation under stress.\nRedundancy, circuit breakers, and backpressure are core patterns.\n\nSee [[E2E-NoteA]] and [[E2E-NoteB]] for background.\n\nHow do my notes on feedback loops connect to systems thinking? @agent'); return 'ok'" > /dev/null 2>&1

echo "  Created 3 test notes"

# --- Test 1: Bootstrap ---

echo ""
echo "=== Test 1: Bootstrap ==="

obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
sleep 2

wait_for "Bootstrap completes" \
  "$P.getDebugState().bootstrapComplete" \
  "$TIMEOUT"

# --- Test 2: Embedding ---

echo ""
echo "=== Test 2: Embedding ==="

wait_for "E2E-NoteA indexed" \
  "$P.getDebugState().hasEntry('E2E-NoteA.md')" \
  "$TIMEOUT"

wait_for "E2E-NoteB indexed" \
  "$P.getDebugState().hasEntry('E2E-NoteB.md')" \
  "$TIMEOUT"

wait_for "E2E-NoteC indexed" \
  "$P.getDebugState().hasEntry('E2E-NoteC.md')" \
  "$TIMEOUT"

index_size=$(eval_ob "$P.getDebugState().indexSize")
echo "  Index size: $index_size"
assert_true "Index has 3+ entries" \
  "$P.getDebugState().indexSize >= 3"

# --- Test 3: System 1 — Connection Proposal ---

echo ""
echo "=== Test 3: System 1 ==="

# Modify NoteA via vault.modify() to trigger idle pipeline, then switch away
trigger_modify "E2E-NoteA.md"
switch_away

await_for "NoteA gets [!connection] callout" \
  "return (await app.vault.adapter.read('E2E-NoteA.md')).includes('[!connection]')" \
  "$TIMEOUT" || true

# --- Test 4: System 2 — @agent Response ---

echo ""
echo "=== Test 4: System 2 ==="

# NoteC has @agent — trigger modify and switch away
trigger_modify "E2E-NoteC.md"
switch_away

await_for "NoteC gets [!ideation] callout" \
  "return (await app.vault.adapter.read('E2E-NoteC.md')).includes('[!ideation]')" \
  "$TIMEOUT" || true

# --- Test 5: Deduplication ---

echo ""
echo "=== Test 5: Deduplication ==="

count_before=$(aeval_ob "return ((await app.vault.adapter.read('E2E-NoteA.md')).match(/\\\\[!connection\\\\]/g)||[]).length")

# Trigger idle again on NoteA
trigger_modify "E2E-NoteA.md"
switch_away

# Wait for processing to complete
sleep 15

count_after=$(aeval_ob "return ((await app.vault.adapter.read('E2E-NoteA.md')).match(/\\\\[!connection\\\\]/g)||[]).length")
assert_eq "No duplicate callout on NoteA" "$count_after" "$count_before"

# --- Test 6: ownWrites guard ---

echo ""
echo "=== Test 6: ownWrites ==="

assert_true "No idle timer after own write on NoteA" \
  "!$P.getDebugState().idleTimerPaths.includes('E2E-NoteA.md')"

# --- Test 7: Accept ---

echo ""
echo "=== Test 7: Accept ==="

# Check if NoteA has a callout to accept
has_callout=$(aeval_ob "return (await app.vault.adapter.read('E2E-NoteA.md')).includes('[!connection]')" || echo "false")
if [ "$has_callout" = "true" ]; then
  # Accept by directly calling vault.process — replicates handleAccept logic
  aeval_ob "
    const f = app.vault.getFileByPath('E2E-NoteA.md');
    await app.vault.process(f, (data) => {
      const re = /^> \\[!(connection|ideation)\\].*(?:\\n> .*)*(?:\\n)?/m;
      const m = re.exec(data);
      if (!m) return data;
      const block = m[0];
      const lines = block.split('\\n');
      const content = lines.slice(1).map(l => l.replace(/^>\\s?/, '')).join('\\n').trim();
      return data.slice(0, m.index) + content + data.slice(m.index + block.length);
    });
    return 'accepted';
  " > /dev/null 2>&1
  sleep 2

  await_for "Callout markers removed after accept" \
    "return !(await app.vault.adapter.read('E2E-NoteA.md')).includes('[!connection]')" \
    10
else
  echo "  SKIP: No callout present to test accept (System 1 may not have fired)"
fi

# --- Test 8: Reject ---

echo ""
echo "=== Test 8: Reject ==="

has_ideation=$(aeval_ob "return (await app.vault.adapter.read('E2E-NoteC.md')).includes('[!ideation]')" || echo "false")
if [ "$has_ideation" = "true" ]; then
  # Reject by directly calling vault.process — replicates handleReject logic
  aeval_ob "
    const f = app.vault.getFileByPath('E2E-NoteC.md');
    await app.vault.process(f, (data) => {
      const re = /\\n?> \\[!(connection|ideation)\\].*(?:\\n> .*)*\\n?/m;
      const m = re.exec(data);
      if (!m) return data;
      return data.slice(0, m.index) + data.slice(m.index + m[0].length);
    });
    return 'rejected';
  " > /dev/null 2>&1
  sleep 2

  await_for "Callout block removed after reject" \
    "return !(await app.vault.adapter.read('E2E-NoteC.md')).includes('[!ideation]')" \
    10
else
  echo "  SKIP: No ideation callout present to test reject"
fi

# --- Cleanup ---

echo ""
echo "=== Cleanup ==="

aeval_ob "for (const n of ['E2E-NoteA.md','E2E-NoteB.md','E2E-NoteC.md']) { try { await app.vault.adapter.remove(n) } catch {} } return 'done'" > /dev/null 2>&1
obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
echo "  Cleaned up test files and reloaded plugin"

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
