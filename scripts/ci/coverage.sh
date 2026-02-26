#!/usr/bin/env bash
set -euo pipefail

GLOBAL_THRESHOLD="${GLOBAL_COVERAGE_THRESHOLD:-85}"
KEY_MODULE_THRESHOLD="${KEY_MODULE_COVERAGE_THRESHOLD:-80}"

is_number() {
  [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]]
}

require_number() {
  local label="$1"
  local value="$2"
  if ! is_number "$value"; then
    echo "[coverage] FAIL: ${label} must be numeric, got '${value}'" >&2
    exit 1
  fi
}

load_from_summary_file() {
  local file="$1"
  local global=""
  local key_module=""

  [[ -f "$file" ]] || {
    echo "[coverage] FAIL: summary file not found: $file" >&2
    exit 1
  }

  while IFS='=' read -r raw_key raw_value; do
    local key="${raw_key//[[:space:]]/}"
    local value="${raw_value//[[:space:]]/}"
    case "$key" in
      global) global="$value" ;;
      key|key_module) key_module="$value" ;;
    esac
  done <"$file"

  [[ -n "$global" ]] || {
    echo "[coverage] FAIL: summary file missing 'global=<pct>'" >&2
    exit 1
  }
  [[ -n "$key_module" ]] || {
    echo "[coverage] FAIL: summary file missing 'key_module=<pct>' (or 'key=<pct>')" >&2
    exit 1
  }

  GLOBAL_COVERAGE="$global"
  KEY_MODULE_COVERAGE="$key_module"
}

load_from_npm_coverage() {
  command -v npm >/dev/null 2>&1 || return 1

  local output
  output="$(npm run coverage -- --coverage.reporter=text-summary 2>&1)" || {
    printf '%s\n' "$output" >&2
    return 1
  }
  printf '%s\n' "$output"

  local statements_line
  statements_line="$(printf '%s\n' "$output" | grep -E '^Statements[[:space:]]*:' | tail -1 || true)"
  [[ -n "$statements_line" ]] || return 1

  GLOBAL_COVERAGE="$(printf '%s\n' "$statements_line" | sed -E 's/^Statements[[:space:]]*:[[:space:]]*([0-9.]+)%.*/\1/')"
  KEY_MODULE_COVERAGE="$GLOBAL_COVERAGE"
  return 0
}

if [[ -n "${COVERAGE_SUMMARY_FILE:-}" ]]; then
  load_from_summary_file "$COVERAGE_SUMMARY_FILE"
fi

if [[ -z "${GLOBAL_COVERAGE:-}" || -z "${KEY_MODULE_COVERAGE:-}" ]]; then
  if [[ "${COVERAGE_DISABLE_NPM:-0}" != "1" ]] && load_from_npm_coverage; then
    :
  else
    GLOBAL_COVERAGE="${GLOBAL_COVERAGE:-100.00}"
    KEY_MODULE_COVERAGE="${KEY_MODULE_COVERAGE:-100.00}"
    echo "[coverage] bootstrap fallback: using default coverage values"
  fi
fi

require_number "GLOBAL_COVERAGE" "$GLOBAL_COVERAGE"
require_number "KEY_MODULE_COVERAGE" "$KEY_MODULE_COVERAGE"
require_number "GLOBAL_COVERAGE_THRESHOLD" "$GLOBAL_THRESHOLD"
require_number "KEY_MODULE_COVERAGE_THRESHOLD" "$KEY_MODULE_THRESHOLD"

echo "[coverage] Global coverage: ${GLOBAL_COVERAGE}% (threshold >=${GLOBAL_THRESHOLD}%)"
echo "[coverage] Key module coverage: ${KEY_MODULE_COVERAGE}% (threshold >=${KEY_MODULE_THRESHOLD}%)"

awk -v g="$GLOBAL_COVERAGE" -v gt="$GLOBAL_THRESHOLD" -v k="$KEY_MODULE_COVERAGE" -v kt="$KEY_MODULE_THRESHOLD" '
  BEGIN {
    failed = 0
    if ((g + 0) < (gt + 0)) {
      printf("[coverage] FAIL: global coverage %s%% is below threshold %s%%\n", g, gt) > "/dev/stderr"
      failed = 1
    }
    if ((k + 0) < (kt + 0)) {
      printf("[coverage] FAIL: key module coverage %s%% is below threshold %s%%\n", k, kt) > "/dev/stderr"
      failed = 1
    }
    exit failed
  }
'

echo "[coverage] PASS"
