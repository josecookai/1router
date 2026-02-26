#!/usr/bin/env bash
set -euo pipefail

PR="${1:?pr number required}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/check-pr-ready.sh" "$PR"
gh pr merge "$PR" --squash --delete-branch

ISSUES="$(gh pr view "$PR" --json closingIssuesReferences --jq '.closingIssuesReferences[].number' || true)"
for ISSUE in $ISSUES; do
  gh issue edit "$ISSUE" --add-label "done" --remove-label "in_progress" --remove-label "review" --remove-label "blocked" >/dev/null || true
  gh issue comment "$ISSUE" --body "Merged via automation. Milestone completed and gates passed (\`make test\`, \`make coverage\`, \`make ci\`)." || true
done
