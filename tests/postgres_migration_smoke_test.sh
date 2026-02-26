#!/usr/bin/env bash
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "[postgres_migration_smoke_test] SKIP: psql not installed"
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[postgres_migration_smoke_test] SKIP: DATABASE_URL not set"
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

bash "$REPO_ROOT/scripts/db/migrate.sh"
# Re-run to verify idempotent behavior via schema_migrations bookkeeping.
bash "$REPO_ROOT/scripts/db/migrate.sh"

required_tables=(
  orgs
  api_keys
  providers
  models
  usage_events_raw
  usage_events_raw_default
  invoices
  audit_logs
)

for table_name in "${required_tables[@]}"; do
  result="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -t -A -c "SELECT to_regclass('public.${table_name}') IS NOT NULL;")"
  if [[ "$result" != "t" ]]; then
    echo "[postgres_migration_smoke_test] FAIL: missing table ${table_name}" >&2
    exit 1
  fi
  echo "[postgres_migration_smoke_test] found ${table_name}"
done

partition_parent="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -t -A -c "SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent WHERE c.relname = 'usage_events_raw_default' AND p.relname = 'usage_events_raw';")"
if [[ "$partition_parent" != "usage_events_raw_default" ]]; then
  echo "[postgres_migration_smoke_test] FAIL: usage_events_raw_default is not attached to usage_events_raw" >&2
  exit 1
fi

echo "[postgres_migration_smoke_test] PASS"
