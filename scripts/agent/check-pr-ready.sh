#!/usr/bin/env bash
set -euo pipefail

PR="${1:?pr number required}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

gh pr checks "$PR" --required

"$SCRIPT_DIR/check-pr-template.sh" "$PR"

STATE_JSON="$(gh pr view "$PR" --json mergeStateStatus,isDraft)"
IS_DRAFT="$(jq -r '.isDraft' <<<"$STATE_JSON")"
MERGE_STATE="$(jq -r '.mergeStateStatus' <<<"$STATE_JSON")"

[[ "$IS_DRAFT" == "false" ]]
[[ "$MERGE_STATE" != "DIRTY" ]]
