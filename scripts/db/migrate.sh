#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="db/migrations"
DB_URL="${DATABASE_URL:-}"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: scripts/db/migrate.sh [--database-url <url>] [--dir <path>] [--dry-run]

Applies SQL migrations in filename order and records applied versions in schema_migrations.
Requires psql and a PostgreSQL DATABASE_URL.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --database-url)
      DB_URL="${2:?missing value for --database-url}"
      shift 2
      ;;
    --dir)
      MIGRATIONS_DIR="${2:?missing value for --dir}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[db:migrate] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

command -v psql >/dev/null 2>&1 || {
  echo "[db:migrate] psql is required" >&2
  exit 1
}

[[ -n "$DB_URL" ]] || {
  echo "[db:migrate] DATABASE_URL is required (or pass --database-url)" >&2
  exit 1
}

[[ -d "$MIGRATIONS_DIR" ]] || {
  echo "[db:migrate] migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 1
}

mapfile -t MIGRATION_FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

if [[ "${#MIGRATION_FILES[@]}" -eq 0 ]]; then
  echo "[db:migrate] no migration files found in $MIGRATIONS_DIR"
  exit 0
fi

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

for migration_file in "${MIGRATION_FILES[@]}"; do
  filename="$(basename "$migration_file")"
  version="${filename%%_*}"
  if [[ "$version" == "$filename" ]]; then
    version="${filename%.sql}"
  fi

  already_applied="$("${PSQL[@]}" -t -A -c "SELECT 1 FROM schema_migrations WHERE version = '$version' LIMIT 1;" || true)"
  if [[ "$already_applied" == "1" ]]; then
    echo "[db:migrate] skip $filename (already applied)"
    continue
  fi

  echo "[db:migrate] applying $filename"
  if [[ "$DRY_RUN" == "1" ]]; then
    continue
  fi

  "${PSQL[@]}" -f "$migration_file"
  "${PSQL[@]}" -c "INSERT INTO schema_migrations(version, filename) VALUES ('$version', '$filename');"
done

echo "[db:migrate] complete"
