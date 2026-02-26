#!/usr/bin/env bash
set -euo pipefail

LANE="${1:?usage: pick-ready-issue.sh <router|billing|ui|infra>}"

gh issue list \
  --label "ready" \
  --label "area/${LANE}" \
  --limit 20 \
  --json number,title,labels,createdAt \
  --jq '
    map(select(any(.labels[]; .name == "ready"))) |
    .[0]
  '
