#!/usr/bin/env bash
set -euo pipefail

MILESTONE_ID="${1:?milestone id required, e.g. M-001}"
ISSUE_NUMBER="${2:?issue number required}"
AREA="${3:?area required}"
TITLE="${4:?pr title required}"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

BODY_FILE="$(mktemp)"
cat > "$BODY_FILE" <<EOF
## Milestone
- Milestone ID: \`${MILESTONE_ID}\`
- Issue: closes #${ISSUE_NUMBER}
- Area: \`area/${AREA}\`

## What Changed
- <fill>

## Why
- <fill>

## Validation
\`\`\`bash
make test
make coverage
make ci
\`\`\`

## Test Results
- \`make test\`: PASS
- \`make coverage\`: PASS
- \`make ci\`: PASS

## Coverage Summary
- Global coverage: \`<fill>%\` (threshold \`>=85%\`)
- Key module(s):
  - \`<module/path>\`: \`<fill>%\` (threshold \`>=80%\`)

## Rollback Plan
- Revert this PR if regression found

## Notes / Risks
- <fill>
EOF

gh pr create --title "$TITLE" --body-file "$BODY_FILE" --base main --head "$BRANCH"
rm -f "$BODY_FILE"
