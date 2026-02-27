#!/usr/bin/env bash
set -euo pipefail

FROM="${1:?from state required (ready|in_progress|done|blocked)}"
TO="${2:?to state required (ready|in_progress|done|blocked)}"

case "$FROM" in
  ready)
    [[ "$TO" == "in_progress" ]] || {
      echo "[issue-transition] FAIL: only ready -> in_progress is allowed" >&2
      exit 1
    }
    ;;
  in_progress)
    [[ "$TO" == "done" || "$TO" == "blocked" ]] || {
      echo "[issue-transition] FAIL: only in_progress -> done|blocked is allowed" >&2
      exit 1
    }
    ;;
  blocked)
    [[ "$TO" == "in_progress" ]] || {
      echo "[issue-transition] FAIL: only blocked -> in_progress is allowed" >&2
      exit 1
    }
    ;;
  done)
    echo "[issue-transition] FAIL: done is terminal" >&2
    exit 1
    ;;
  *)
    echo "[issue-transition] FAIL: unknown state '$FROM'" >&2
    exit 1
    ;;
esac

echo "[issue-transition] PASS: ${FROM} -> ${TO}"
