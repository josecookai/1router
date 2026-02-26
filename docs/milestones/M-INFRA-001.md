# Milestone M-INFRA-001

## Source
- Issue: blocked (could not query assigned `in_progress` issues due `gh` auth/network failure in sandbox)
- Area: area/infra

## Acceptance Criteria
1. `scripts/ci/coverage.sh` enforces numeric global/key coverage thresholds and exits non-zero on failures.
2. Coverage gate can read coverage values from environment variables or a simple summary file for CI integration.
3. `make test` runs repeatable local shell tests that validate coverage gate pass/fail behavior.

## Scope
- In scope: harden local CI bootstrap scripts, add shell-based tests, improve failure diagnostics.
- Out of scope: GitHub issue claiming, PR creation, production coverage tool integration (lcov/jest/go test).

## Test Plan
- Unit: shell tests for coverage gate parsing/threshold checks.
- Integration: `make test`, `make coverage`, `make ci`.
- Manual: inspect gate output for pass/fail threshold messaging.

## Verification Commands
```bash
make test
make coverage
make ci
```

## Status
- [x] Implemented
- [x] Tests added/updated
- [x] Gates green
- [ ] PR opened

## Blockers
- `gh auth status` reports invalid token for `github.com` (`josecookai`).
- `gh issue list ...` cannot reach `api.github.com` because network access is restricted in this run.
