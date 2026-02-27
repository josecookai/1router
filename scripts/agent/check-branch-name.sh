#!/usr/bin/env bash
set -euo pipefail

LANE="${1:?lane required (router|billing|ui|infra)}"
MILESTONE_ID="${2:?milestone id required (e.g. M-013)}"
BRANCH_INPUT="${3:-}"

if [[ "$LANE" != "router" && "$LANE" != "billing" && "$LANE" != "ui" && "$LANE" != "infra" ]]; then
  echo "[branch-check] FAIL: lane must be router, billing, ui, or infra, got '$LANE'" >&2
  exit 1
fi

MILESTONE_LOWER="$(tr '[:upper:]' '[:lower:]' <<<"$MILESTONE_ID")"
BRANCH="${BRANCH_INPUT:-$(git rev-parse --abbrev-ref HEAD)}"

PATTERN="^codex/${LANE}-${MILESTONE_LOWER}-[a-z0-9][a-z0-9-]*$"
if [[ ! "$BRANCH" =~ $PATTERN ]]; then
  echo "[branch-check] FAIL: branch '$BRANCH' does not match 'codex/${LANE}-${MILESTONE_LOWER}-<slug>'" >&2
  exit 1
fi

echo "[branch-check] PASS: $BRANCH"
