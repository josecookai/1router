#!/usr/bin/env bash
set -euo pipefail

FROM_LABELS_CSV="${1:-}"
TO_LABEL="${2:?target label required (in_progress|done)}"

if [[ -z "$FROM_LABELS_CSV" ]]; then
  echo "[transition-check] FAIL: source labels are required" >&2
  exit 1
fi

if [[ "$TO_LABEL" != "in_progress" && "$TO_LABEL" != "done" ]]; then
  echo "[transition-check] FAIL: target must be in_progress or done, got '$TO_LABEL'" >&2
  exit 1
fi

IFS=',' read -r -a LABELS <<<"$FROM_LABELS_CSV"
has_label() {
  local target="$1"
  local label
  for label in "${LABELS[@]}"; do
    if [[ "${label//[[:space:]]/}" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ "$TO_LABEL" == "in_progress" ]]; then
  if has_label "ready"; then
    echo "[transition-check] PASS: ready -> in_progress"
    exit 0
  fi
  echo "[transition-check] FAIL: in_progress transition requires 'ready' label" >&2
  exit 1
fi

if has_label "in_progress" || has_label "ready"; then
  echo "[transition-check] PASS: $(printf '%s' "$FROM_LABELS_CSV") -> done"
  exit 0
fi

echo "[transition-check] FAIL: done transition requires 'in_progress' or 'ready' label" >&2
exit 1
