# Dat — Architecture Plan

Dat is a case-based workspace where users and an embedded agent (also called Dat)
collaborate on documents and spreadsheets. Each case is a git repository; the agent
works alongside the user, executing analysis in a sandbox and committing its progress.

## System Overview

```
+-------------------------------------------------------------------------+
|                         FRONTEND (Next.js 16)                           |
|  +---------------+  +---------------+  +---------------+  +------------+|
|  |  File Tree    |  | Doc/Sheet     |  | Chat Panel    |  | Agent      ||
|  |  Component    |  |  Editors      |  |  + Commands   |  | Activity   ||
|  +---------------+  +---------------+  +---------------+  +------------+|
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                      API LAYER (tRPC, Next.js)                          |
|  +-------------------------+  +------------------+  +-----------------+ |
|  |  tRPC router            |  | tRPC SSE         |  | REST (only for  | |
|  |  queries + mutations    |  | subscriptions    |  | file up/down-   | |
|  |  (enqueues jobs)        |  | (chat, progress) |  | load streams)   | |
|  +-------------------------+  +------------------+  +-----------------+ |
+-------------------------------------------------------------------------+
            |                          ^                      |
            v                          | pub/sub              v
+----------------------+  +------------------------+  +-------------------+
|  PostgreSQL          |  |  Redis                 |  | Case Storage      |
|  +----------------+  |  |  +------------------+  |  | +---------------+ |
|  | cases          |  |  |  | BullMQ queues    |  |  | | Local volume: | |
|  | messages       |  |  |  | Progress pub/sub |  |  | | one bare git  | |
|  | entities       |  |  |  +------------------+  |  | | repo + work-  | |
|  | users          |  |  +------------------------+  | | tree per case | |
|  +----------------+  |              |               | +---------------+ |
|  + pgvector          |              |               | | MinIO (S3):   | |
|  (schema-ready,      |              |               | | repo bundles, | |
|   deferred)          |              |               | | originals     | |
+----------------------+              |               | | (PDFs etc.)   | |
                                      |               | +---------------+ |
                                      |               +-------------------+
                                      v                        ^
+-------------------------------------------------------------------------+
|                  WORKER PROCESS (standalone, BullMQ)                     |
|  +-------------------------------------------------------------------+  |
|  |                  Dat Agent (Claude Agent SDK)                     |  |
|  |  - Consumes jobs: user messages, file-change notifications       |  |
|  |  - Runs inside per-case Docker sandbox (worktree bind-mounted)   |  |
|  |  - bash is the primary tool; bespoke tools for workflow only     |  |
|  |  - Commits progress with git CLI                                 |  |
|  |  - Publishes progress to Redis pub/sub -> SSE relay              |  |
|  +-------------------------------------------------------------------+  |
|         |                                                               |
|         +---------------------------------+                             |
|         v                                 v                             |
|  +-------------------------------+  +----------------------------+      |
|  |      DOCKER SANDBOX           |  |   WORKFLOW TOOLS           |      |
|  |  (one warm container per      |  |  +----------------------+  |      |
|  |   case, reset between tasks)  |  |  | request_approval     |  |      |
|  |  +-------------------------+  |  |  | checkpoint           |  |      |
|  |  | bash tool (primary)     |  |  |  +----------------------+  |      |
|  |  | - git CLI               |  |  |                            |      |
|  |  | - pdftotext, jq         |  |  | (file + git access come    |      |
|  |  | - python3, pandas       |  |  |  from bash on the mounted  |      |
|  |  | - openpyxl, pdfplumber  |  |  |  worktree; no bespoke      |      |
|  |  | - csvkit, miller        |  |  |  read/write/commit tools)  |      |
|  |  |                         |  |  |                            |      |
|  |  | No network access       |  |  |                            |      |
|  |  | 4GB memory limit        |  |  |                            |      |
|  |  | 10 min task timeout     |  |  |                            |      |
|  |  +-------------------------+  |  +----------------------------+      |
|  +-------------------------------+                                      |
+-------------------------------------------------------------------------+
```

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Framework | Next.js 16 (App Router) | SSR, streaming, single deployable for UI + API |
| Language | TypeScript (strict mode) | Type safety, better DX |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development, consistent design |
| API Layer | tRPC v11 | End-to-end type safety; SSE subscriptions cover streaming, so REST exists only for file upload/download |
| Database | PostgreSQL + Prisma | Robust, typed ORM, migrations (self-hosted) |
| Vector Search | pgvector (deferred) | Schema-ready; structured queries preferred initially |
| Auth | Auth.js (NextAuth v5) | Self-hosted, supports credentials/OAuth |
| Case Storage | Local volume + git CLI | Real git on a real filesystem: full packfile/gc support, fast, battle-tested |
| Archive Storage | MinIO | S3-compatible, self-hosted; holds repo bundles (backup) and large binary originals |
| Background Jobs | BullMQ + Redis | Self-hosted queue with retries; Redis pub/sub doubles as the progress channel |
| AI | Claude Agent SDK | Provides the agent loop, bash/file tools, checkpointing, and sandbox hooks out of the box |
| Sandbox | Docker | Isolated bash/Python execution, one warm container per case |
| Document Editor | Tiptap | Rich text, ProseMirror-based, markdown serialization |
| Spreadsheet Editor | Univer | Open-source, formula support, no commercial license requirement |
| Real-time | Server-Sent Events (via tRPC subscriptions) | Simple, unidirectional streaming |

## Key Design Decisions

### 1. Real git on a local volume; MinIO is archive, not primary

Each case is a bare git repository plus a checked-out worktree on a local volume.
All git operations use the git CLI — from the API layer (via a thin server-side
wrapper) and from the agent (via bash in the sandbox, where the worktree is
bind-mounted).

MinIO holds two things:

- **Repo bundles**: periodic `git bundle` snapshots per case, for backup/restore.
- **Originals**: large uploaded binaries (PDFs, source spreadsheets) that don't
  belong in git history. The worktree references them by object key.

Writes to a case repo are serialized through a per-case lock (Redis lease) so a
user save and an agent commit never interleave mid-operation. Two writers, one
repo, one lock.

### 2. The agent loop lives in a standalone worker, never in a request handler

Agent runs take minutes. Next.js API routes only:

1. Persist the message / change event.
2. Enqueue a BullMQ job.
3. Return immediately.

A standalone worker process consumes jobs and hosts the agent loop. Progress
(tokens, tool calls, status) is published to Redis pub/sub; the tRPC SSE
subscription endpoint relays it to the browser. The worker survives web deploys,
scales independently, and owns the Docker sandbox lifecycle.

### 3. Editor ↔ git round-trip is specified up front

| Surface | Editor | On-disk format | Notes |
|---|---|---|---|
| Documents | Tiptap | Markdown (`.md`) | Markdown is the source of truth. Editor features are restricted to the markdown-representable subset (no comments/suggestions in v1) so round-trips are lossless by construction. |
| Spreadsheets | Univer | CSV (`.csv`) | One file per sheet; diffable in git. Formulas and formatting live in a sidecar `.univer.json` next to the CSV; the CSV always contains computed values so the agent can work with plain data. |
| Originals | (viewer only) | PDF/XLSX in MinIO | Read-only; extractions are committed as new md/csv files. |

**Conflict policy**: file-level pessimistic locking. When the agent's task plan
touches a file, that file locks in the editor (banner: "Dat is working on this
file") until the agent commits. When a user has unsaved edits to a file, the
agent's plan skips it and reports the skip. Every save and every agent action is
a commit, so git history is the recovery path for anything the policy misses.

### 4. Claude Agent SDK as the agent runtime

The agent is built on the Claude Agent SDK rather than a hand-rolled loop over
the raw API. The SDK provides the agent loop, bash and file tools, checkpointing,
and sandbox integration hooks. Bespoke tools are limited to workflow concerns the
SDK can't know about:

- `request_approval` — pause for user sign-off before a destructive or
  outward-facing step.
- `checkpoint` — record a named milestone in the case timeline (also creates a
  git tag).

File reads/writes and git operations need no bespoke tools: bash on the mounted
worktree covers them, and keeping the toolset minimal keeps the agent's behavior
predictable.

### 5. Sandbox lifecycle: one warm container per case

Each active case gets a long-lived container with the case worktree bind-mounted.
Tasks reuse the warm container (no cold-start latency per agent action); the
container is reset (recreated from the base image) between tasks if the previous
task left modified system state, and reaped after a case goes idle.

Constraints per container: no network access, 4 GB memory, 10-minute task
timeout. The base image ships the analysis toolchain: git, pdftotext, jq,
python3 + pandas, openpyxl, pdfplumber, csvkit, miller.

## Deferred

- **pgvector / semantic search** — schema includes embedding columns from day
  one, but retrieval starts as structured queries over extracted entities.
  Revisit when keyword + entity search demonstrably falls short.
- **Doc comments/suggestions** — excluded from v1 to keep the markdown
  round-trip lossless.
- **Multi-user concurrent editing** — single-editor-per-file assumption for v1;
  the per-case lock and git history make this safe to relax later.
