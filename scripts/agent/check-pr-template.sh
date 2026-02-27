#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="check-pr-template"

usage() {
  cat <<EOF
usage:
  $SCRIPT_NAME <pr-number>
  $SCRIPT_NAME --body-file <path>
EOF
}

require_section() {
  local section="$1"
  local body="$2"
  if ! grep -Eiq "^[[:space:]]*#{1,6}[[:space:]]*${section}[[:space:]]*$" <<<"$body"; then
    echo "[$SCRIPT_NAME] FAIL: missing required PR section heading: '${section}'" >&2
    exit 1
  fi
}

BODY=""
case "${1:-}" in
  --body-file)
    FILE="${2:-}"
    [[ -n "$FILE" ]] || {
      usage >&2
      exit 1
    }
    [[ -f "$FILE" ]] || {
      echo "[$SCRIPT_NAME] FAIL: body file not found: $FILE" >&2
      exit 1
    }
    BODY="$(cat "$FILE")"
    ;;
  "")
    usage >&2
    exit 1
    ;;
  *)
    PR="$1"
    BODY="$(gh pr view "$PR" --json body --jq .body)"
    ;;
esac

require_section "What Changed" "$BODY"
require_section "Validation" "$BODY"
require_section "Coverage Summary" "$BODY"

echo "[$SCRIPT_NAME] PASS"
