#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/agent/check-pr-template.sh"

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

write_body() {
  local target="$1"
  local with_changed="${2:-1}"
  local with_validation="${3:-1}"
  local with_coverage="${4:-1}"

  {
    echo "## Milestone"
    echo "- M-019"
    if [[ "$with_changed" == "1" ]]; then
      echo
      echo "## What Changed"
      echo "- updated scripts"
    fi
    if [[ "$with_validation" == "1" ]]; then
      echo
      echo "### Validation"
      echo "- make test"
    fi
    if [[ "$with_coverage" == "1" ]]; then
      echo
      echo "## Coverage Summary"
      echo "- global: 96.55%"
    fi
  } >"$target"
}

test_pass_when_all_required_sections_exist() {
  local tmp
  tmp="$(mktemp)"
  write_body "$tmp" 1 1 1
  local out
  out="$(run_case 0 bash "$SCRIPT" --body-file "$tmp")"
  rm -f "$tmp"
  assert_contains "$out" "[check-pr-template] PASS"
}

test_fail_when_what_changed_missing() {
  local tmp
  tmp="$(mktemp)"
  write_body "$tmp" 0 1 1
  local out
  out="$(run_case 1 bash "$SCRIPT" --body-file "$tmp")"
  rm -f "$tmp"
  assert_contains "$out" "missing required PR section heading: 'What Changed'"
}

test_fail_when_validation_missing() {
  local tmp
  tmp="$(mktemp)"
  write_body "$tmp" 1 0 1
  local out
  out="$(run_case 1 bash "$SCRIPT" --body-file "$tmp")"
  rm -f "$tmp"
  assert_contains "$out" "missing required PR section heading: 'Validation'"
}

test_fail_when_coverage_summary_missing() {
  local tmp
  tmp="$(mktemp)"
  write_body "$tmp" 1 1 0
  local out
  out="$(run_case 1 bash "$SCRIPT" --body-file "$tmp")"
  rm -f "$tmp"
  assert_contains "$out" "missing required PR section heading: 'Coverage Summary'"
}

test_pass_when_heading_uses_single_hash() {
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
# What Changed
- a

# Validation
- b

# Coverage Summary
- c
EOF
  local out
  out="$(run_case 0 bash "$SCRIPT" --body-file "$tmp")"
  rm -f "$tmp"
  assert_contains "$out" "[check-pr-template] PASS"
}

test_pass_when_all_required_sections_exist
test_fail_when_what_changed_missing
test_fail_when_validation_missing
test_fail_when_coverage_summary_missing
test_pass_when_heading_uses_single_hash

echo "[test] pr_template_gate_test.sh PASS"
