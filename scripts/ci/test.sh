#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="${TEST_DIR:-tests}"

if [[ ! -d "$TEST_DIR" ]]; then
  echo "[test] bootstrap repository: no tests directory (${TEST_DIR})"
  echo "[test] PASS"
  exit 0
fi

TEST_FILES=()
while IFS= read -r test_file; do
  TEST_FILES+=("$test_file")
done < <(find "$TEST_DIR" -maxdepth 1 -type f -name '*_test.sh' | sort)

if [[ "${#TEST_FILES[@]}" -eq 0 ]]; then
  echo "[test] bootstrap repository: no runtime tests yet"
  echo "[test] PASS"
  exit 0
fi

for test_file in "${TEST_FILES[@]}"; do
  echo "[test] running ${test_file}"
  bash "$test_file"
done

echo "[test] PASS"
