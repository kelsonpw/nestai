# AGENTS.md — working in the NestAI monorepo

This document describes the package boundaries, how to plug in real providers,
and how the job queue swaps to Redis. It is the contract every contributor (and
agent) should respect when changing code.

## Package boundaries (dependency direction)

Dependencies point **inward**; nothing lower-level imports a higher-level
package.

```
@nestai/contracts   ← pure types, Zod schemas, provider interfaces. No deps on siblings.
      ▲
@nestai/db          ← Prisma client + schema + seed. Depends on: contracts (types only).
@nestai/core        ← nine deterministic engines. Depends on: contracts ONLY.
@nestai/adapters    ← mock + real provider impls + createProviders(). Depends on: contracts.
      ▲
@nestai/api         ← NestJS app. Composes db + core + adapters behind tenant-scoped modules.
@nestai/web         ← Vite/React dashboard. Depends on: contracts (types) + the API over HTTP.
```

Rules of the road:

- **`@nestai/core` is pure and time-injectable.** It must depend only on
  `@nestai/contracts`, never on `db`, `adapters`, or `api`. Every engine takes
  `now`/clocks as input — no `Date.now()`, no I/O, no provider construction.
- **All external I/O goes through a `@nestai/contracts` interface** (`LlmProvider`,
  `CalendarProvider`, `EmailProvider`, `MessagingProvider`, `OcrProvider`).
  Implementations live in `@nestai/adapters`; the API injects them by DI token.
- **Tenancy is enforced in the API layer.** Every request resolves a household
  (`HouseholdGuard` → `TenantContext`) and all DB access flows through
  `TenantPrisma`, which scopes queries and asserts ownership. Core engines are
  tenant-agnostic; they operate on data the API has already scoped.
- **Privacy is upstream of the model.** Ingestion scrubs PII (`scrub()` in core)
  before calling the LLM, persists `RawMessage` with a `purgeAfter`, and drops a
  minor's media at ingest time. Don't move the scrub step downstream of extract.

## Plugging in real providers

Providers default to **mock** (no secrets, no network). Switch to real by
setting `PROVIDER_MODE=real` (and/or a per-adapter override) plus the relevant
credentials. The `createProviders(configFromEnv())` factory in `@nestai/adapters`
resolves each adapter independently.

### Selection precedence (highest first)

1. Per-adapter env override: `NESTAI_<ADAPTER>_MODE = mock | real`
   (e.g. `NESTAI_LLM_MODE=real`, `NESTAI_OCR_MODE=mock`).
2. The global `PROVIDER_MODE` (`mock` | `real`).
3. Default: `mock`.

Special case: in real mode a **missing `ANTHROPIC_API_KEY` safely falls back to
the deterministic mock LLM** (so the app still boots) — every other real adapter
throws a descriptive error when used unconfigured.

### Environment variables

| Adapter    | Mode flag             | Real-mode credentials                                                  |
| ---------- | --------------------- | ---------------------------------------------------------------------- |
| LLM        | `NESTAI_LLM_MODE`     | `ANTHROPIC_API_KEY` (opt: `NESTAI_LLM_MODEL`, `ANTHROPIC_BASE_URL`)    |
| Calendar   | `NESTAI_CALENDAR_MODE`| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` (or CalDAV) |
| Email      | `NESTAI_EMAIL_MODE`   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`|
| Messaging  | `NESTAI_MESSAGING_MODE`| Twilio (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`) or WhatsApp Cloud (`WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_VERIFY_TOKEN`) |
| OCR        | `NESTAI_OCR_MODE`     | Google Document AI or Azure Document Intelligence endpoint + key       |

Shared infra:

| Var            | Purpose                                                              |
| -------------- | -------------------------------------------------------------------- |
| `DATABASE_URL` | Postgres 16 + pgvector connection string (required).                 |
| `REDIS_URL`    | Optional — enables the BullMQ queue driver (see below).              |
| `PORT`         | API listen port (default `3000`).                                    |
| `CORS_ORIGIN`  | Comma-separated allowed origins for the dashboard (default: any).    |

See `.env.example` for the full template. In mock mode none of the credentials
are needed.

## The job queue & the Redis driver

The API registers recurring jobs (daily digest, Sunday check-in, milestone
firing, the **24h purge sweep**, and the escalation timer) on a `JobQueue`
abstraction (`services/api/src/queue/`). Two drivers implement it:

- **In-memory (default):** used whenever `REDIS_URL` is unset. Zero infra —
  ideal for local dev, the demo, tests, and the sandbox. Jobs run on `everyMs`
  intervals within the process.
- **BullMQ / Redis:** used automatically when `REDIS_URL` is set. The same job
  handlers run, driven by Redis-backed repeatable jobs (cron-style) so they
  survive restarts and scale across replicas.

Swapping drivers requires no handler changes — set or unset `REDIS_URL`. In
tests the scheduler does **not** start repeatables (`NODE_ENV=test` or
`NESTAI_DISABLE_SCHEDULER`) so runs stay deterministic; handlers (e.g.
`purgeSweep(now)`) remain directly callable.

## Building & verifying

```bash
pnpm install
pnpm -r build           # tsc -b in dependency order (required before pnpm demo)
pnpm -r test            # all package suites
pnpm test:e2e           # security + demo smoke (needs live Postgres)
pnpm demo               # full acceptance narrative
```

`pnpm demo` and the root e2e tests import the **compiled** API
(`services/api/dist`), so run `pnpm -r build` first.
