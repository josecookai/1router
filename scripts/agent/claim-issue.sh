#!/usr/bin/env bash
set -euo pipefail

ISSUE="${1:?issue number required}"
ASSIGNEE="${2:-@me}"

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
