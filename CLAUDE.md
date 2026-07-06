# Dat

Case-based workspace where users and the Dat agent collaborate on documents and
spreadsheets. Read PLAN.md before making architectural decisions — it specifies
the storage model, conflict policy, and agent runtime.

## Layout

- `apps/web` — Next.js 16 (App Router), tRPC v11 API, UI
- `apps/worker` — standalone BullMQ worker; hosts the agent loop (Claude Agent SDK)
- `packages/db` — Prisma schema + client (`@dat/db`)
- `packages/shared` — queue names, job/progress types, CSV utils shared by web and worker (`@dat/shared`)
- `packages/storage` — case git storage (git CLI wrapper) + per-case Redis lease (`@dat/storage`)
- `infra/sandbox` — Dockerfile for the per-case agent sandbox image

## Commands

- `pnpm infra:up` — start Postgres, Redis, MinIO (docker compose)
- `pnpm dev` — run web + worker in parallel
- `pnpm db:migrate` — Prisma migrate dev
- `pnpm test` — run all package test suites (Redis must be up for lease tests)
- `pnpm typecheck` — typecheck all packages

## Hard rules from PLAN.md

- Git operations use the git CLI on the local case-storage volume. Never add a
  JS git implementation.
- The agent loop runs only in `apps/worker`. Next.js route handlers enqueue
  jobs and relay progress; they never run agent work inline.
- Repo writes go through the per-case Redis lease; never write to a case
  worktree without holding it.
- Docs are Markdown, sheets are CSV + `.univer.json` sidecar. Editor features
  that can't round-trip through these formats are out of scope.
- Agent tools stay minimal: bash on the mounted worktree plus
  `request_approval` and `checkpoint`. Don't add bespoke file/git tools.
