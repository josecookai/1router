#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "[assert] expected output to contain: $needle" >&2
    echo "[assert] actual output:" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

run_case() {
  local expected_status="$1"
  shift

  local output
  local status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -ne "$expected_status" ]]; then
    echo "[case] expected status $expected_status, got $status" >&2
    echo "$output" >&2
    exit 1
  fi

  printf '%s\n' "$output"
}

test_branch_naming_validator() {
  local out
  out="$(run_case 0 bash "$ROOT_DIR/scripts/agent/check-branch-name.sh" infra M-013 codex/infra-m-013-state-consistency)"
  assert_contains "$out" "[branch-check] PASS"

  out="$(run_case 1 bash "$ROOT_DIR/scripts/agent/check-branch-name.sh" ui M-013 codex/infra-m-013-state-consistency)"
  assert_contains "$out" "does not match"
}

test_blocked_helper_dry_run() {
  local out
  out="$(run_case 0 bash "$ROOT_DIR/scripts/agent/mark-blocked.sh" 25 "make ci" "test_failure" "unit tests failed" --dry-run)"
  assert_contains "$out" "would add label: blocked"
  assert_contains "$out" "Failing command: \`make ci\`"
  assert_contains "$out" "Error category: \`test_failure\`"
}

test_merge_script_removes_ready_label() {
  local out
  out="$(run_case 0 cat "$ROOT_DIR/scripts/agent/merge-pr.sh")"
  assert_contains "$out" "--remove-label \"ready\""
}

test_branch_naming_validator
test_blocked_helper_dry_run
test_merge_script_removes_ready_label

echo "[test] agent_state_consistency_test.sh PASS"
