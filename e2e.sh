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

eval_ob() {
  obsidian vault="$VAULT" eval code="$1" 2>/dev/null
}

debug_state() {
  eval_ob "JSON.stringify(app.plugins.plugins['$PLUGIN'].getDebugState())"
}

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

switch_away() {
  # Open a different file to make the edited file no longer active
  eval_ob "app.workspace.openLinkText('E2E-NoteB', '', false)" > /dev/null 2>&1
  sleep 1
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

# Clean up any leftover test files
rm -f "$VAULT/E2E-NoteA.md" "$VAULT/E2E-NoteB.md" "$VAULT/E2E-NoteC.md"

# Reload plugin for clean state
obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
sleep 3

# Create test notes with overlapping semantic content
cat > "$VAULT/E2E-NoteA.md" << 'NOTEEOF'
# Feedback Loops

Feedback loops are circular processes where outputs become inputs.
Positive feedback amplifies change; negative feedback dampens it.
Systems with feedback loops exhibit emergent behaviour.
Biological systems use feedback for homeostasis.
NOTEEOF

cat > "$VAULT/E2E-NoteB.md" << 'NOTEEOF'
# Systems Thinking

Systems thinking examines how components interrelate within a whole.
Key concepts: emergence, feedback, nonlinearity, self-organisation.
Engineers use systems thinking to design resilient architectures.
The discipline draws from cybernetics and control theory.
NOTEEOF

cat > "$VAULT/E2E-NoteC.md" << 'NOTEEOF'
# Resilience Patterns

Resilience in engineering means graceful degradation under stress.
Redundancy, circuit breakers, and backpressure are core patterns.

How do my notes on feedback loops connect to systems thinking? @agent
NOTEEOF

echo "  Created 3 test notes"

# --- Test 1: Bootstrap ---

echo ""
echo "=== Test 1: Bootstrap ==="

obsidian vault="$VAULT" plugin:reload id="$PLUGIN" 2>/dev/null
sleep 2

wait_for "Bootstrap completes" \
  "app.plugins.plugins['$PLUGIN'].getDebugState().bootstrapComplete" \
  "$TIMEOUT"

# --- Test 2: Embedding ---

echo ""
echo "=== Test 2: Embedding ==="

wait_for "E2E-NoteA indexed" \
  "app.plugins.plugins['$PLUGIN'].getDebugState().hasEntry('E2E-NoteA.md')" \
  "$TIMEOUT"

wait_for "E2E-NoteB indexed" \
  "app.plugins.plugins['$PLUGIN'].getDebugState().hasEntry('E2E-NoteB.md')" \
  "$TIMEOUT"

wait_for "E2E-NoteC indexed" \
  "app.plugins.plugins['$PLUGIN'].getDebugState().hasEntry('E2E-NoteC.md')" \
  "$TIMEOUT"

index_size=$(eval_ob "app.plugins.plugins['$PLUGIN'].getDebugState().indexSize")
echo "  Index size: $index_size"
assert_true "Index has 3+ entries" \
  "app.plugins.plugins['$PLUGIN'].getDebugState().indexSize >= 3"

# --- Test 3: System 1 — Connection Proposal ---

echo ""
echo "=== Test 3: System 1 ==="

# Append to NoteA to trigger modify event, then switch away
echo "" >> "$VAULT/E2E-NoteA.md"
switch_away

wait_for "NoteA gets [!connection] callout" \
  "(await app.vault.adapter.read('E2E-NoteA.md')).includes('[!connection]')" \
  "$TIMEOUT" || true

# --- Test 4: System 2 — @agent Response ---

echo ""
echo "=== Test 4: System 2 ==="

# NoteC has @agent — trigger modify and switch away
echo "" >> "$VAULT/E2E-NoteC.md"
switch_away

wait_for "NoteC gets [!ideation] callout" \
  "(await app.vault.adapter.read('E2E-NoteC.md')).includes('[!ideation]')" \
  "$TIMEOUT" || true

# --- Test 5: Deduplication ---

echo ""
echo "=== Test 5: Deduplication ==="

count_before=$(eval_ob "((await app.vault.adapter.read('E2E-NoteA.md')).match(/\\\\[!connection\\\\]/g)||[]).length")

# Trigger idle again on NoteA
echo " " >> "$VAULT/E2E-NoteA.md"
switch_away

# Wait for processing to complete
sleep 15

count_after=$(eval_ob "((await app.vault.adapter.read('E2E-NoteA.md')).match(/\\\\[!connection\\\\]/g)||[]).length")
assert_eq "No duplicate callout on NoteA" "$count_after" "$count_before"

# --- Test 6: ownWrites guard ---

echo ""
echo "=== Test 6: ownWrites ==="

assert_true "No idle timer after own write on NoteA" \
  "!app.plugins.plugins['$PLUGIN'].getDebugState().idleTimerPaths.includes('E2E-NoteA.md')"

# --- Test 7: Accept ---

echo ""
echo "=== Test 7: Accept ==="

# Check if NoteA has a callout to accept
has_callout=$(eval_ob "(await app.vault.adapter.read('E2E-NoteA.md')).includes('[!connection]')" || echo "false")
if [ "$has_callout" = "true" ]; then
  content_before=$(eval_ob "(await app.vault.adapter.read('E2E-NoteA.md')).length")

  # Open NoteA and run accept command
  eval_ob "app.workspace.openLinkText('E2E-NoteA', '', false)" > /dev/null 2>&1
  sleep 1
  eval_ob "app.commands.executeCommandById('$PLUGIN:accept-callout')" > /dev/null 2>&1
  sleep 2

  assert_true "Callout markers removed after accept" \
    "!(await app.vault.adapter.read('E2E-NoteA.md')).includes('[!connection]')"
else
  echo "  SKIP: No callout present to test accept (System 1 may not have fired)"
fi

# --- Test 8: Reject ---

echo ""
echo "=== Test 8: Reject ==="

has_ideation=$(eval_ob "(await app.vault.adapter.read('E2E-NoteC.md')).includes('[!ideation]')" || echo "false")
if [ "$has_ideation" = "true" ]; then
  eval_ob "app.workspace.openLinkText('E2E-NoteC', '', false)" > /dev/null 2>&1
  sleep 1
  eval_ob "app.commands.executeCommandById('$PLUGIN:reject-callout')" > /dev/null 2>&1
  sleep 2

  assert_true "Callout block removed after reject" \
    "!(await app.vault.adapter.read('E2E-NoteC.md')).includes('[!ideation]')"
else
  echo "  SKIP: No ideation callout present to test reject"
fi

# --- Cleanup ---

echo ""
echo "=== Cleanup ==="

rm -f "$VAULT/E2E-NoteA.md" "$VAULT/E2E-NoteB.md" "$VAULT/E2E-NoteC.md"
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
