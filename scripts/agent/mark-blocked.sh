#!/usr/bin/env bash
set -euo pipefail

ISSUE="${1:?issue number required}"
FAILED_COMMAND="${2:?failed command required}"
ERROR_CATEGORY="${3:?error category required}"
DETAILS="${4:-}"

BODY="$(cat <<EOF
Automation blocked on this issue.

Failing command: \`${FAILED_COMMAND}\`
Error category: \`${ERROR_CATEGORY}\`
${DETAILS:+Details: ${DETAILS}}
EOF
)"

if [[ "${5:-}" == "--dry-run" ]]; then
  echo "[blocked] would add label: blocked"
  echo "[blocked] would comment:"
  echo "$BODY"
  exit 0
fi

gh issue edit "$ISSUE" --add-label "blocked" >/dev/null || true
gh issue comment "$ISSUE" --body "$BODY"
