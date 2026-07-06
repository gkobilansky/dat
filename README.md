# Dat

A case-based workspace where you and an embedded agent collaborate on documents
and spreadsheets. Every case is a git repository: you edit files in the browser,
Dat analyzes them in a sandbox and commits its progress, and the full history of
who did what is always one `git log` away.

The complete architecture — storage model, conflict policy, agent runtime, and
the reasoning behind each decision — lives in [PLAN.md](PLAN.md).

## How it works

```
Browser (Next.js)  ──tRPC──▶  API layer  ──BullMQ──▶  Worker (agent loop)
      ▲                                                    │
      └────────── SSE progress ◀── Redis pub/sub ──────────┘
                                                           │
                              Docker sandbox (bash + git on the case worktree)
```

- **Cases are git repos** on a local volume. Documents are Markdown, sheets are
  CSV (+ a `.univer.json` sidecar for formulas/formatting) — everything diffs.
- **The agent runs in a standalone worker**, never in a request handler. Web
  routes enqueue jobs and relay progress; agent runs can take minutes.
- **The sandbox is the toolset.** Dat works through bash in a per-case Docker
  container (no network, 4 GB, 10-min timeout) with the worktree bind-mounted.
  Bespoke tools are limited to `request_approval` and `checkpoint`.
- **MinIO is archive, not primary**: repo bundles for backup plus large binary
  originals (PDFs, source spreadsheets) that don't belong in git history.

## Prerequisites

- Node.js >= 22 and pnpm
- Docker (runs Postgres, Redis, MinIO, and the agent sandbox)
- An Anthropic API key

## Quickstart

```sh
cp .env.example .env       # fill in ANTHROPIC_API_KEY and AUTH_SECRET
pnpm install
pnpm infra:up              # Postgres + Redis + MinIO via docker compose
pnpm db:migrate            # create the database schema
pnpm dev                   # web on :3000, worker alongside
```

Build the sandbox image when you start working on agent execution:

```sh
docker build -t dat-sandbox infra/sandbox
```

MinIO console: http://localhost:9001 (credentials in `docker-compose.yml`).

## Workspace

| Path | Package | Purpose |
|---|---|---|
| `apps/web` | `@dat/web` | Next.js 16 UI + tRPC v11 API |
| `apps/worker` | `@dat/worker` | Standalone BullMQ worker hosting the agent loop (Claude Agent SDK) |
| `packages/db` | `@dat/db` | Prisma schema + client (Postgres, pgvector-ready) |
| `packages/shared` | `@dat/shared` | Queue names, job/progress event types, CSV round-trip utils |
| `packages/storage` | `@dat/storage` | Case git storage (git CLI wrapper) + per-case Redis lease |
| `infra/sandbox` | — | Base image for the per-case agent sandbox |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run web and worker in parallel |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all package test suites (vitest; needs Redis up for lease tests) |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm lint` | Lint all packages |
| `pnpm db:migrate` | Create/apply migrations (`prisma migrate dev`) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm infra:up` / `pnpm infra:down` | Start/stop Postgres, Redis, MinIO |

## Environment

All variables are documented in [.env.example](.env.example). The defaults match
`docker-compose.yml`, so for local development you only need to set
`ANTHROPIC_API_KEY` and `AUTH_SECRET` (generate one with `openssl rand -base64 32`).

## Agent modes

The worker picks an agent runtime per `DAT_AGENT_MODE` (default `stub`):

- `claude` — the Claude Agent SDK runs against the case worktree with bash plus
  the `request_approval` / `checkpoint` workflow tools. Requires both
  `DAT_AGENT_MODE=claude` and `ANTHROPIC_API_KEY`: until the per-case Docker
  sandbox lands, agent bash runs on the host worktree (with a scrubbed
  environment — no DB/Redis/S3 credentials), so it must be opted into
  explicitly and is dev-only.
- `stub` — a deterministic offline agent that reads the case, analyzes CSVs,
  and commits `analysis/summary.md`. Used in dev without a key and by tests.

## Status

Working end-to-end: case CRUD on git repos, lease-serialized saves, doc (md)
and sheet (csv) editors, chat → BullMQ → agent → commit → SSE progress relay,
with unit/integration tests per package. Still to come from PLAN.md: Auth.js
multi-user auth, the Docker sandbox for agent bash (runs on the host worktree
today), Tiptap/Univer rich editors, MinIO bundle backups, file-level editor
locking, and the approval flow UI (approvals auto-accept in dev).
