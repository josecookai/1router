.PHONY: test coverage ci lint

test:
	@bash scripts/ci/test.sh

coverage:
	@bash scripts/ci/coverage.sh

lint:
	@bash scripts/ci/lint.sh

ci: lint test coverage
	@echo "[ci] all checks passed"
