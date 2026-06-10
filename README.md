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
| `packages/shared` | `@dat/shared` | Queue names and job/progress event types shared by web and worker |
| `infra/sandbox` | — | Base image for the per-case agent sandbox |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run web and worker in parallel |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm lint` | Lint all packages |
| `pnpm db:migrate` | Create/apply migrations (`prisma migrate dev`) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm infra:up` / `pnpm infra:down` | Start/stop Postgres, Redis, MinIO |

## Environment

All variables are documented in [.env.example](.env.example). The defaults match
`docker-compose.yml`, so for local development you only need to set
`ANTHROPIC_API_KEY` and `AUTH_SECRET` (generate one with `openssl rand -base64 32`).

## Status

Scaffold stage: the monorepo, schema, queue wiring, and infra are in place;
the agent loop (`apps/worker/src/agent/run.ts`), case CRUD, editors, and SSE
relay are not yet implemented. PLAN.md's "Key Design Decisions" section is the
spec for that work.
