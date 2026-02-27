#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COVERAGE_SCRIPT="$ROOT_DIR/scripts/ci/coverage.sh"

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
  local name="$1"
  local expected_status="$2"
  shift 2

  local output
  local status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -ne "$expected_status" ]]; then
    echo "[case:$name] expected status $expected_status, got $status" >&2
    echo "$output" >&2
    exit 1
  fi

  printf '%s\n' "$output"
}

test_bootstrap_defaults_pass() {
  local out
  out="$(run_case bootstrap 0 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 bash "$COVERAGE_SCRIPT")"
  assert_contains "$out" "bootstrap fallback"
  assert_contains "$out" "[coverage] PASS"
}

test_env_values_pass() {
  local out
  out="$(run_case env-pass 0 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 GLOBAL_COVERAGE=91.2 KEY_MODULE_COVERAGE=80 bash "$COVERAGE_SCRIPT")"
  assert_contains "$out" "Global coverage: 91.2%"
  assert_contains "$out" "Key module coverage: 80%"
}

test_threshold_failure_fails() {
  local out
  out="$(run_case threshold-fail 1 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 GLOBAL_COVERAGE=84.9 KEY_MODULE_COVERAGE=88 bash "$COVERAGE_SCRIPT")"
  assert_contains "$out" "below threshold 85%"
}

test_invalid_numeric_fails() {
  local out
  out="$(run_case invalid 1 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 GLOBAL_COVERAGE=abc KEY_MODULE_COVERAGE=90 bash "$COVERAGE_SCRIPT")"
  assert_contains "$out" "GLOBAL_COVERAGE must be numeric"
}

test_summary_file_pass_and_parse() {
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
global=88.5
key_module=80.1
EOF
  local out
  out="$(run_case file-pass 0 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 COVERAGE_SUMMARY_FILE="$tmp" bash "$COVERAGE_SCRIPT")"
  rm -f "$tmp"
  assert_contains "$out" "Global coverage: 88.5%"
  assert_contains "$out" "[coverage] PASS"
}

test_summary_file_key_alias_pass() {
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
global=90
key=81.25
EOF
  local out
  out="$(run_case file-key-alias 0 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 COVERAGE_SUMMARY_FILE="$tmp" bash "$COVERAGE_SCRIPT")"
  rm -f "$tmp"
  assert_contains "$out" "Global coverage: 90%"
  assert_contains "$out" "Key module coverage: 81.25%"
  assert_contains "$out" "[coverage] PASS"
}

test_output_summary_lines_stable() {
  local out
  out="$(run_case output-stable 0 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 GLOBAL_COVERAGE=92 KEY_MODULE_COVERAGE=83 bash "$COVERAGE_SCRIPT")"
  assert_contains "$out" "[coverage] Global coverage: 92% (threshold >=85%)"
  assert_contains "$out" "[coverage] Key module coverage: 83% (threshold >=80%)"
}

test_summary_file_missing_key_fails() {
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
global=90
EOF
  local out
  out="$(run_case file-missing-key 1 env -i PATH="$PATH" HOME="${HOME:-/tmp}" COVERAGE_DISABLE_NPM=1 COVERAGE_SUMMARY_FILE="$tmp" bash "$COVERAGE_SCRIPT")"
  rm -f "$tmp"
  assert_contains "$out" "missing 'key_module=<pct>'"
}

test_bootstrap_defaults_pass
test_env_values_pass
test_threshold_failure_fails
test_invalid_numeric_fails
test_summary_file_pass_and_parse
test_summary_file_key_alias_pass
test_output_summary_lines_stable
test_summary_file_missing_key_fails

echo "[test] coverage_gate_test.sh PASS"
