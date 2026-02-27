#!/usr/bin/env bash
set -euo pipefail

PR="${1:?pr number required}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/check-pr-ready.sh" "$PR"
gh pr merge "$PR" --squash --delete-branch

ISSUES="$(gh pr view "$PR" --json closingIssuesReferences --jq '.closingIssuesReferences[].number' || true)"
for ISSUE in $ISSUES; do
  LABELS="$(gh issue view "$ISSUE" --json labels --jq '.labels[].name' || true)"
  if grep -qx "in_progress" <<<"$LABELS"; then
    "$SCRIPT_DIR/check-issue-transition.sh" in_progress done
  elif grep -qx "done" <<<"$LABELS"; then
    echo "[issue-transition] INFO: issue already done"
  else
    echo "[issue-transition] FAIL: issue #$ISSUE missing in_progress before close" >&2
    exit 1
  fi

  gh issue edit "$ISSUE" --add-label "done" --remove-label "in_progress" --remove-label "ready" --remove-label "review" --remove-label "blocked" >/dev/null || true
  gh issue comment "$ISSUE" --body "Merged via automation. Milestone completed and gates passed (\`make test\`, \`make coverage\`, \`make ci\`)." || true
done
