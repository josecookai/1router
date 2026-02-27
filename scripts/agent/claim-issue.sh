#!/usr/bin/env bash
set -euo pipefail

ISSUE="${1:?issue number required}"
ASSIGNEE="${2:-@me}"
MILESTONE_ID="${3:-}"
LANE="${4:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -n "$MILESTONE_ID" || -n "$LANE" ]]; then
  [[ -n "$MILESTONE_ID" && -n "$LANE" ]] || {
    echo "usage: claim-issue.sh <issue> [assignee] [milestone-id lane]" >&2
    exit 1
  }
  "$SCRIPT_DIR/check-branch-name.sh" "$LANE" "$MILESTONE_ID"
fi

LABELS="$(gh issue view "$ISSUE" --json labels --jq '.labels[].name' || true)"
if grep -qx "ready" <<<"$LABELS"; then
  "$SCRIPT_DIR/check-issue-transition.sh" ready in_progress
elif grep -qx "blocked" <<<"$LABELS"; then
  "$SCRIPT_DIR/check-issue-transition.sh" blocked in_progress
elif grep -qx "in_progress" <<<"$LABELS"; then
  echo "[issue-transition] INFO: issue already in_progress"
else
  echo "[issue-transition] FAIL: expected label ready|blocked|in_progress before claim" >&2
  exit 1
fi

gh issue edit "$ISSUE" --add-label "in_progress" --remove-label "ready" >/dev/null || true

if [[ "$ASSIGNEE" != "@me" ]]; then
  gh issue edit "$ISSUE" --add-assignee "$ASSIGNEE" >/dev/null || true
fi

gh issue comment "$ISSUE" --body "$(cat <<'EOF'
Automation claimed this issue.

Execution plan:
1. Write acceptance criteria to `docs/milestones/<id>.md` (>=3 items)
2. Implement minimal change with tests
3. Run:
   - `make test`
   - `make coverage`
   - `make ci`
4. Open PR with coverage summary

If blocked, label `blocked` and comment exact failing command/error category.
EOF
)"
