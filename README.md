# NestAI

NestAI is a **household orchestrator**: an AI assistant that turns the messy
stream of family life — WhatsApp messages, school flyers, work calendars,
offhand "we should take the kids to Yosemite this fall" remarks — into a routed,
deconflicted, privacy-preserving plan, surfaced as a daily digest and a live
dashboard. It is a TypeScript monorepo with a strict separation between domain
logic, integration adapters, and the API/web surfaces.

## The data → AI → output flow

```
        inbound (WhatsApp / email / OCR'd flyers & work screenshots)
                              │
                     ┌────────▼─────────┐
                     │  PII SCRUB (core)│  raw SSN/phone/address/email → tokens
                     └────────┬─────────┘  (minor photos dropped here too)
                              │  scrubbed text only
                     ┌────────▼─────────┐
                     │   LLM EXTRACT    │  tasks + events + intents
                     │ (mock | Anthropic)│  (never sees raw PII)
                     └────────┬─────────┘
                              │
   ┌──────────────────────────┼───────────────────────────────────────┐
   │            nine deterministic core engines                        │
   │  routing · recurrence · seasonal · dependencies · escalation ·    │
   │  commute (Conflict Radar) · wellbeing (Balance Battery) · privacy │
   └──────────────────────────┬───────────────────────────────────────┘
                              │  persisted per-household (tenant-scoped)
                     ┌────────▼─────────┐
                     │   OUTPUTS         │  Daily Digest (email/messaging),
                     │                   │  dashboard, escalation broadcasts
                     └───────────────────┘
```

Inbound content is **scrubbed before it ever reaches the model**, raw content is
**ephemeral** (a 24h purge sweep blanks raw message text/media and deletes raw
availability source), and every read/write is **tenant-scoped** to one
household.

## Quick start

```bash
pnpm install        # pnpm workspaces
pnpm db:migrate     # prisma migrate deploy (needs Postgres 16 + pgvector)
pnpm db:seed        # seeds "The Rivera Family"
pnpm -r build       # compile all packages (required before pnpm demo)
pnpm demo           # full end-to-end acceptance narrative (mock providers)
```

`pnpm demo` boots the real NestJS app in-process against the live Postgres with
mock providers and walks all nine scenarios — ingest → scrub → extract → route,
school flyer → approvals, seasonal project + milestones, ski-trip dependency
chain, drop → escalate → claim, commute conflict, well-being, and the rendered
Daily Digest (read back from `fixtures/_sink/`). It prints a ✅/❌ summary and
exits non-zero on any failed assertion.

### Mock mode (no secrets required)

The default `PROVIDER_MODE=mock` runs every external integration (LLM, calendar,
messaging, email, OCR) against in-memory mock implementations and uses the
in-memory job queue — so **no API keys, Redis, or Docker are needed** to build,
test, or run the demo. The only infra is a Postgres 16 + pgvector database at
`DATABASE_URL` (defaults to `postgresql://nestai:nestai@localhost:5432/nestai`).
Copy `.env.example` to `.env` and fill provider credentials only for live mode.

## Monorepo layout

```
packages/
  contracts/   @nestai/contracts  - shared types, Zod schemas & provider interfaces
  db/          @nestai/db         - Prisma client, migrations, seed (The Rivera Family)
  adapters/    @nestai/adapters   - mock + real provider impls + createProviders() factory
  core/        @nestai/core       - nine deterministic, time-injectable engines
services/
  api/         @nestai/api        - NestJS API (13 modules, tenant guard, job queue, scheduler)
apps/
  web/         @nestai/web        - Vite/React dashboard (Household Matrix, Balance Battery, …)
scripts/       demo.ts (the pnpm demo acceptance narrative)
tests/         root-level security + e2e suites (pnpm test:e2e)
fixtures/      demo/test fixtures (fixtures/_sink/ is mock-output scratch, gitignored)
infra/         Dockerfile + AWS/GCP/Azure deploy manifests (see infra/README.md)
.github/       CI + GitHub Pages workflows
```

See `AGENTS.md` for the package boundaries and how to plug in real providers.

## Tests

| Command                         | What it runs                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| `pnpm -r test`                  | every package's unit/integration suite (90 tests)               |
| `pnpm test:e2e`                 | root security hardening tests + the demo as a smoke test        |
| `pnpm demo`                     | the full nine-step acceptance narrative                         |

The security suite (`tests/security.test.ts`) asserts: cross-tenant access is
blocked; the LLM only ever receives scrubbed text (verified via a recording spy
provider); a minor's photo/media is deleted immediately post-extraction; and the
24h purge sweep blanks expired raw content.

## Conventions

- **ESM everywhere** (`"module": "NodeNext"`). Workspace deps use `workspace:*`.
- **All external integrations sit behind interfaces** in `@nestai/contracts`;
  concrete impls live in `@nestai/adapters`, mock variants selected by
  `PROVIDER_MODE=mock` (per-adapter override via `NESTAI_<ADAPTER>_MODE`).
- **Core engines are pure & time-injectable** — callers pass `now`; nothing
  reaches for `Date.now()`. They depend only on `@nestai/contracts`.
- TypeScript project references wire packages; `tsc -b` builds in dependency
  order.

## Deploy

- **Dashboard → GitHub Pages** (`.github/workflows/pages.yml`): builds
  `apps/web` with `VITE_BASE=/nestai/` and publishes via `actions/deploy-pages`.
- **API → a container** (`infra/Dockerfile`) on **one of AWS (ECS/Fargate),
  GCP (Cloud Run), or Azure (Container Apps)** — pluggable manifests in `infra/`,
  each parameterized by `DATABASE_URL` / `REDIS_URL` / `ANTHROPIC_API_KEY`.

Full deployment guide: [`infra/README.md`](infra/README.md).

## Scripts

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `pnpm build`       | `turbo run build`                                |
| `pnpm test`        | `turbo run test`                                 |
| `pnpm lint`        | `turbo run lint`                                 |
| `pnpm typecheck`   | `turbo run typecheck`                            |
| `pnpm db:migrate`  | `prisma migrate deploy` (`@nestai/db`)           |
| `pnpm db:seed`     | seed the database (`@nestai/db`)                 |
| `pnpm demo`        | end-to-end acceptance narrative (`scripts/demo.ts`) |
| `pnpm test:e2e`    | security tests + demo smoke                      |
| `pnpm ci`          | install + build + test (used by CI)              |
