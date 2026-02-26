# 1router

Bootstrap repository.

## Database Migrations (SQL-first)

The billing lane uses SQL files in `db/migrations` plus a lightweight Postgres runner.

Apply migrations locally:

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/1router_dev?sslmode=disable" \
bash scripts/db/migrate.sh
```

Useful options:

```bash
bash scripts/db/migrate.sh --help
bash scripts/db/migrate.sh --dry-run
```

Run the migration smoke test (skips cleanly if `psql` or `DATABASE_URL` is missing):

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/1router_test?sslmode=disable" \
make test
```
