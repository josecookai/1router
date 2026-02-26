# 1router

OpenAI-compatible LLM router / unified API MVP with:
- `/v1/models`
- `/v1/embeddings`
- `/v1/chat/completions` (non-streaming stub)
- `/api/keys`
- `/api/models`
- `/api/policies`
- Landing page at `/`

## What This Repo Is

`1router` is a developer-first LLM router / unified API project modeled after products like OpenRouter, with:
- OpenAI-compatible API surface
- Multi-provider routing abstraction
- Transparent billing strategy (passthrough + platform fee)
- Control-plane endpoints for keys, models, and policies
- Security-conscious defaults (request IDs, error envelopes, key handling direction)

This repository is currently in **MVP buildout mode** and is being developed with milestone-based automation + CI gates.

## MVP Scope (Current)

### In scope (implemented or actively shipping)
- `GET /healthz`
- `GET /v1/models`
- `POST /v1/embeddings` (stub/provider-adapter backed)
- `POST /v1/chat/completions` (non-streaming stub)
- `GET /api/keys`, `POST /api/keys`
- `GET /api/models`
- `GET /api/policies`, `POST /api/policies`
- Landing page served from `/`
- OpenAPI contract and generated TypeScript artifacts
- SQL-first migration baseline (`db/migrations/0001_mvp_schema.sql`)

### Not in scope yet (next iterations)
- `/v1/responses` full implementation
- streaming chat completions (`stream=true`)
- provider failover/retry orchestration in production form
- real billing settlement/reconciliation and payments integration
- auth middleware + quotas/rate limits (partially in progress)

## Architecture (MVP-level)

### Data plane
- Fastify app (`src/app.ts`)
- OpenAI-compatible endpoints (`/v1/*`)
- Provider adapter abstractions for routing/model providers
- Shared error envelope + request_id support

### Control plane
- API key management endpoints (`/api/keys`)
- Models and policy endpoints (`/api/models`, `/api/policies`)
- SQL-first schema for orgs/keys/providers/models/usage/invoices

### Docs / Contract
- OpenAPI spec: `openapi/mvp.yaml`
- Generated artifacts: `src/generated/*`

## Project Structure

```text
src/
  app.ts                  Fastify app and route registration
  server.ts               process entrypoint
  models-catalog.ts       /v1/models + control-plane model data helpers
  embeddings.ts           /v1/embeddings stub logic
  provider-adapters.ts    provider adapter abstractions / registry
  chat-completions.ts     /v1/chat/completions stub logic
  api-keys.ts             /api/keys logic
  policies.ts             /api/policies mock/in-memory logic
  generated/              OpenAPI-generated TS artifacts

test/                     Vitest route/unit tests
tests/                    Shell tests (coverage gate, migration smoke)
db/migrations/            SQL-first schema migrations
scripts/
  ci/                     lint/test/coverage gates
  db/                     migration runner
  openapi/                validate/generate scripts
  agent/                  automation helper scripts

public/                   landing page assets (served by Fastify)
docs/milestones/          per-milestone acceptance docs
openapi/mvp.yaml          source API contract
```

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- npm
- Optional: PostgreSQL + `psql` (for migration smoke tests)

### Install

```bash
npm install
```

### Optional: install `jq`
The examples below use `jq` for pretty-printing JSON.

### Run locally

```bash
npm run dev
```

App starts on:
- `http://localhost:3000/` (landing page)
- `http://localhost:3000/healthz`
- `http://localhost:3000/v1/*` (inference endpoints)
- `http://localhost:3000/api/*` (control-plane endpoints)

### Run quality gates

```bash
make test
make coverage
make ci
```

Current CI gate expectations:
- Global coverage `>=85%`
- Key module coverage `>=80%`

### OpenAPI validation / generation

```bash
npm run openapi:validate
npm run openapi:generate
npm run openapi:check
```

## API Smoke Test (Local)

### Health check

```bash
curl -s http://localhost:3000/healthz | jq
```

### List models

```bash
curl -s http://localhost:3000/v1/models | jq
```

### Embeddings (stub)

```bash
curl -s http://localhost:3000/v1/embeddings \
  -H 'content-type: application/json' \
  -d '{
    "model": "text-embedding-3-small",
    "input": "hello world"
  }' | jq
```

### Chat completions (non-streaming stub)

```bash
curl -s http://localhost:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"Say hello in JSON"}],
    "stream": false
  }' | jq
```

### API keys (control plane, in-memory/DB-backed depending current implementation)

```bash
curl -s -X POST http://localhost:3000/api/keys \
  -H 'content-type: application/json' \
  -d '{
    "name": "local-dev",
    "project_id": "proj_local"
  }' | jq
```

```bash
curl -s http://localhost:3000/api/keys | jq
```

### Policies (control plane mock/in-memory)

```bash
curl -s http://localhost:3000/api/policies | jq
```

```bash
curl -s http://localhost:3000/api/policies \
  -H 'content-type: application/json' \
  -d '{
    "name": "balanced-default",
    "mode": "weighted_multi_objective",
    "weights": {"cost": 0.34, "latency": 0.33, "success": 0.33},
    "fallback_chain": ["openai:gpt-4o-mini"],
    "constraints": {"region": ["us"]}
  }' | jq
```

### UI model catalog (control plane)

```bash
curl -s http://localhost:3000/api/models | jq
```

## Environment Variables

### Runtime (Fastify app)
- `PORT` (default `3000`)
- `HOST` (default `0.0.0.0`)

### Database / migrations (SQL-first tooling)
- `DATABASE_URL` (required for running migrations against Postgres)

### CI / coverage gate (optional)
- `GLOBAL_COVERAGE_THRESHOLD` (default `85`)
- `KEY_MODULE_COVERAGE_THRESHOLD` (default `80`)
- `COVERAGE_SUMMARY_FILE` (optional custom summary input for shell gate)
- `COVERAGE_DISABLE_NPM=1` (test-only fallback mode for shell gate tests)

## Railway Deployment (MVP)

Minimal Railway config is included in:
- `railway.json`
- `docs/railway-deploy.md`

### Railway settings (minimum)
- Start command: `npm start`
- Health check path: `/healthz`
- Port: Railway provides `PORT` automatically
- Host: app defaults to `0.0.0.0` (can also set `HOST=0.0.0.0`)

### Deploy steps
1. Create a new Railway project.
2. Connect this GitHub repository.
3. Deploy from repo root.
4. Railway installs dependencies automatically (`npm install`) and runs `npm start`.
4. Confirm `/healthz` returns `200`.
5. Open `/` to verify the landing page.

### Recommended Railway environment variables
- `HOST=0.0.0.0`
- `NODE_ENV=production`

### Health check
- Path: `/healthz`
- Expected response: `{"status":"ok",...}` with HTTP `200`

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

## Development Workflow (Milestones + Gates)

This repo is operated with a milestone-oriented workflow and automation support.

### Core rules
- Feature changes must include tests.
- `make ci` must pass before merge.
- Coverage gates must remain above thresholds.
- Work is delivered in small milestone PRs.

### Milestone docs
For each milestone, create/update:
- `docs/milestones/<id>.md`

This should record:
- acceptance criteria
- test plan
- verification commands
- blockers (if any)

### PR expectations
Use the PR template and include:
- what changed
- validation commands
- coverage summary
- milestone id / linked issue

## Automation / Agent Notes

The repo includes helper scripts for automation threads in `scripts/agent/`, including:
- issue pick/claim
- gate execution
- PR readiness checks
- merge helpers

Current practical lessons:
- Keep branch naming consistent (prefer `codex/<lane>-<milestone>-<slug>`).
- Ensure issue labels and assignees are updated alongside PR actions.
- PR merger filters should support actual worker branch prefixes (`router/*`, `billing/*`, `ui/*`, `infra/*`, `codex/*`).

## Troubleshooting

### `make ci` passes unexpectedly after test failures
This was previously possible due to a coverage fallback path. The current `scripts/ci/coverage.sh` now fails if `npm coverage` fails unless `COVERAGE_DISABLE_NPM=1` is explicitly set (used for shell test scenarios).

### `psql` not installed
`tests/postgres_migration_smoke_test.sh` will skip cleanly if `psql` is unavailable. Install Postgres client tools for full migration smoke validation.

### OpenAPI generated files drift in CI
Run:
```bash
npm run openapi:generate
git status -- src/generated/api-types.ts src/generated/api-mocks.ts
```

### Automation creates wrong lane branch name
Update worker prompts to enforce:
- `codex/router-*`
- `codex/billing-*`
- `codex/ui-*`
- `codex/infra-*`

## Roadmap (Near-Term)

- [ ] M-005 infra middleware baseline merge (currently open PR / conflict-prone)
- [ ] M-010 `/api/usage` read endpoint
- [ ] M-011 Bearer auth middleware for router API keys
- [ ] M-012 policy persistence abstraction + validation hardening
- [ ] `/v1/responses` MVP implementation
- [ ] streaming chat completions + failover behavior
- [ ] Railway / preview deployment workflow automation

## Notes

- `M-005` (infra middleware baseline) may still be in an open PR depending on branch/merge timing, but the MVP routes and landing page are available on `main`.
- Generated OpenAPI artifacts are validated in CI via `npm run openapi:check`.
- Landing page assets live in `public/` and are served via Fastify routes (`/`, `/landing.css`).
