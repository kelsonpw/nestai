# syntax=docker/dockerfile:1
#
# Multi-stage build for the NestAI API (services/api).
#
# Build context = repo root:  docker build -f infra/Dockerfile -t nestai-api .
#
# NOTE: local Docker image pulls are blocked in the dev sandbox, so this image is
# build-ready but is NOT built here — CI / the operator builds and pushes it.
# Stages: deps (full install) -> build (compile workspace) -> runtime (prod-only).

ARG NODE_VERSION=20-bookworm-slim

# ---- deps: install the full workspace (incl. dev) for building ----------------
FROM node:${NODE_VERSION} AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy only manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/adapters/package.json packages/adapters/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile=false

# ---- build: compile contracts/db/core/adapters + the API ---------------------
FROM deps AS build
WORKDIR /app
COPY . .
# Prisma client must be generated before the TS build that references it.
RUN pnpm --filter @nestai/db exec prisma generate
RUN pnpm --filter @nestai/contracts --filter @nestai/db \
        --filter @nestai/core --filter @nestai/adapters \
        --filter @nestai/api -r build

# ---- runtime: production-only deps + compiled output -------------------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PROVIDER_MODE=real
ENV PORT=3000
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Manifests + lockfile for a production install.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/adapters/package.json packages/adapters/
COPY services/api/package.json services/api/

RUN pnpm install --prod --frozen-lockfile=false --filter @nestai/api...

# Compiled JS + Prisma schema/client from the build stage.
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/adapters/dist packages/adapters/dist
COPY --from=build /app/services/api/dist services/api/dist
# Generated Prisma client (engine + client) for runtime queries.
COPY --from=build /app/node_modules/.pnpm/@prisma+client* node_modules/.pnpm/
COPY --from=build /app/node_modules/.prisma node_modules/.prisma

# Mock fixtures are dev-only; real deployments use live providers.
EXPOSE 3000
# Run migrations then boot the API. DATABASE_URL/ANTHROPIC_API_KEY come from env.
CMD ["sh", "-c", "pnpm --filter @nestai/db exec prisma migrate deploy && node services/api/dist/main.js"]
