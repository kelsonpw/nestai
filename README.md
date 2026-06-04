# NestAI

NestAI is a household orchestrator: an AI assistant that coordinates a
household's calendars, messaging, email, and tasks. It is built as a
TypeScript monorepo with a clear separation between domain logic, integration
adapters, and the API/web surfaces.

## Quick start

```bash
# 1. Start local infrastructure (Postgres + pgvector, Redis)
docker compose up -d

# 2. Install dependencies (pnpm workspaces)
pnpm install

# 3. Build everything
pnpm -r build
```

### Mock mode (no secrets required)

The default `PROVIDER_MODE=mock` runs every external integration (LLM,
calendar, messaging, email, etc.) against in-memory mock implementations, so
**no API keys or credentials are needed** to build, test, or run the demo.
Copy `.env.example` to `.env` and only fill in provider credentials when you
switch to live mode.

```bash
cp .env.example .env
```

## Monorepo layout

```
packages/
  contracts/   @nestai/contracts  - shared types & integration interfaces
  db/          @nestai/db         - database access, migrations, seeds
  adapters/    @nestai/adapters   - mock + live implementations of contracts
  core/        @nestai/core       - core domain logic & orchestration
services/
  api/         @nestai/api        - API service (NestJS, added by API agent)
apps/
  web/         @nestai/web        - web frontend (Vite, added by frontend agent)
fixtures/      shared test/demo fixtures (fixtures/_sink/ is scratch, gitignored)
scripts/       repo automation scripts
infra/         infrastructure definitions
```

## Conventions

- **ESM everywhere** with `"module": "NodeNext"` / `"moduleResolution": "NodeNext"`.
- **Workspace dependencies** use the `workspace:*` protocol.
- **All external integrations are behind interfaces** defined in
  `@nestai/contracts`. Concrete implementations live in `@nestai/adapters`,
  and the mock variants are selected by default via `PROVIDER_MODE=mock`.
- TypeScript project references wire the packages together; `tsc -b` builds in
  dependency order.

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `pnpm build`       | `turbo run build`                            |
| `pnpm test`        | `turbo run test`                             |
| `pnpm lint`        | `turbo run lint`                             |
| `pnpm typecheck`   | `turbo run typecheck`                        |
| `pnpm db:migrate`  | run database migrations (`@nestai/db`)       |
| `pnpm db:seed`     | seed the database (`@nestai/db`)             |
| `pnpm demo`        | run the demo entrypoint (`@nestai/api`)      |
| `pnpm ci`          | install + build + test (used by CI)          |
