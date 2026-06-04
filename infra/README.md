# NestAI — Deployment

NestAI ships as two independently deployable units:

| Unit                 | Artifact                | Host                                    |
| -------------------- | ----------------------- | --------------------------------------- |
| Dashboard (`apps/web`) | Static SPA (`dist/`)    | **GitHub Pages** (`.github/workflows/pages.yml`) |
| API (`services/api`)   | Container (`infra/Dockerfile`) | **One of AWS / GCP / Azure** (pluggable) |

## Dashboard → GitHub Pages

The Vite dashboard is built with a repo-name base path and published to GitHub
Pages by `.github/workflows/pages.yml` on push to `main`:

```bash
VITE_BASE=/nestai/ pnpm --filter @nestai/web build   # -> apps/web/dist
```

The workflow uploads `apps/web/dist` and deploys it with `actions/deploy-pages`
(`permissions: pages: write, id-token: write`). Point the dashboard at your API
origin via the build-time API base URL (configure in `apps/web` and set CORS on
the API via `CORS_ORIGIN`).

## API container → pluggable cloud host

Build the image from the repo root (build context = repo root):

```bash
docker build -f infra/Dockerfile -t nestai-api:latest .
```

> The dev sandbox blocks local Docker image pulls, so the image is **build-ready
> but is not built here**. CI or the operator builds and pushes it to the
> registry for the chosen cloud.

Choose **one** of the approved cloud container hosts. Each manifest is
parameterized by the same three env vars — `DATABASE_URL`, `REDIS_URL`,
`ANTHROPIC_API_KEY` — sourced from that cloud's secret store (never committed):

| Cloud | Manifest                              | Service        |
| ----- | ------------------------------------- | -------------- |
| AWS   | `infra/aws-ecs-task-definition.json`  | ECS / Fargate  |
| GCP   | `infra/gcp-cloud-run-service.yaml`    | Cloud Run      |
| Azure | `infra/azure-container-app.yaml`      | Container Apps |

### AWS (ECS / Fargate)

```bash
aws ecr create-repository --repository-name nestai-api
docker tag nestai-api:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/nestai-api:latest
docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/nestai-api:latest
aws ecs register-task-definition --cli-input-json file://infra/aws-ecs-task-definition.json
# then create/update a service on a Fargate cluster fronted by an ALB
```

Secrets are pulled from AWS Secrets Manager (`nestai/DATABASE_URL`, etc.).

### GCP (Cloud Run)

```bash
gcloud artifacts repositories create nestai --repository-format=docker --location=REGION
docker tag nestai-api:latest REGION-docker.pkg.dev/PROJECT_ID/nestai/nestai-api:latest
docker push REGION-docker.pkg.dev/PROJECT_ID/nestai/nestai-api:latest
gcloud run services replace infra/gcp-cloud-run-service.yaml --region=REGION
```

Secrets are pulled from Secret Manager (`nestai-database-url`, etc.).

### Azure (Container Apps)

```bash
az acr build --registry ACR_NAME --image nestai-api:latest --file infra/Dockerfile .
az containerapp create --resource-group RG --name nestai-api \
  --environment nestai-env --yaml infra/azure-container-app.yaml
```

Secrets are pulled from Key Vault via the app's managed identity.

## Database

All hosts expect a managed **Postgres 16 with the `pgvector` extension**
(AWS RDS / Aurora, GCP Cloud SQL, or Azure Database for PostgreSQL). The image's
entrypoint runs `prisma migrate deploy` on boot; seed with `pnpm db:seed` once.

## Real providers

Set `PROVIDER_MODE=real` (the manifests do) and supply the relevant credentials
(`ANTHROPIC_API_KEY`, calendar/email/messaging/OCR keys) — see the repo root
`.env.example` and `AGENTS.md`. When `REDIS_URL` is set the API uses the BullMQ
queue driver; otherwise it falls back to the in-memory queue.
