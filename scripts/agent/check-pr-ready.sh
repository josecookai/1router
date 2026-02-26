#!/usr/bin/env bash
set -euo pipefail

PR="${1:?pr number required}"

gh pr checks "$PR" --required

BODY="$(gh pr view "$PR" --json body --jq .body)"
grep -q "Global coverage:" <<<"$BODY"
grep -q "threshold \`>=85%\`" <<<"$BODY"
grep -q "threshold \`>=80%\`" <<<"$BODY"

STATE_JSON="$(gh pr view "$PR" --json mergeStateStatus,isDraft)"
IS_DRAFT="$(jq -r '.isDraft' <<<"$STATE_JSON")"
MERGE_STATE="$(jq -r '.mergeStateStatus' <<<"$STATE_JSON")"

[[ "$IS_DRAFT" == "false" ]]
[[ "$MERGE_STATE" != "DIRTY" ]]
