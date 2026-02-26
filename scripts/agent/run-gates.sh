#!/usr/bin/env bash
set -euo pipefail

echo "[gate] make test"
make test

echo "[gate] make coverage"
make coverage

echo "[gate] make ci"
make ci
