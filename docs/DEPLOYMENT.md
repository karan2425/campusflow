# CampusFlow — Deployment

Three services, three hosting targets, one pipeline. Nothing here requires
rewriting code for a different environment — the same images and the same
environment variables are used everywhere.

```
Vercel              Render                    Cloud Run / Fly / any container host
apps/web  ────────► apps/api  ────────────────► apps/ai
(Next.js)           (Express)                  (FastAPI + FAISS)
      │                  │
      └──── HTTPS ───────┘
                  PostgreSQL (Render / Neon / RDS)
```

---

## 1. Local development

```bash
npm install
cd apps/ai && python3 -m pip install -r requirements.txt && cd ../..

docker compose up -d postgres          # or point DATABASE_URL at your own PG
cp apps/api/.env.example apps/api/.env
cp apps/ai/.env.example apps/ai/.env   # GEMINI_API_KEY optional
echo "API_ORIGIN=http://127.0.0.1:4000" > apps/web/.env.local

npm run db:push && npm run db:seed
npm run dev                            # api :4000 · web :3000 · ai :8000
```

Verify before you ship anything:

```bash
python3 scripts/smoke_test.py          # 43 end-to-end checks
```

Ports: **web 3000 · api 4000 · ai 8000 · postgres 5432**.

---

## 2. Docker

Each service has its own multi-stage Dockerfile; the API and web builds use the
repo root as context so they can install from the workspace lockfile.

```bash
# whole stack
docker compose up --build

# individual images
docker build -f apps/api/Dockerfile -t campusflow-api .
docker build -f apps/ai/Dockerfile  -t campusflow-ai  apps/ai
docker build -f apps/web/Dockerfile -t campusflow-web .
```

The API container runs `prisma db push` on start and seeds **only if the database
is empty** (`prisma/seed-if-empty.mjs`), so restarting an existing deployment never
destroys data.

Useful:

```bash
docker compose logs -f api
docker compose exec postgres psql -U campusflow -d campusflow
docker compose down            # stop
docker compose down -v         # stop and delete the database volume
```

Health endpoints: `GET /health` (API), `GET /ai/health` (AI), `GET /` (web).

---

## 3. Production deployment

### 3.1 Web → Vercel

This is an npm-workspaces monorepo, so pick one of two setups:

**Option A — Root Directory `apps/web` (recommended, least configuration)**

1. **New Project → import the repository.**
2. **Root Directory: `apps/web`.** Vercel finds the lockfile at the repo root and
   installs the whole workspace automatically.
3. Framework preset: **Next.js** (auto-detected). Leave the build command default.
4. Add the environment variable below, then deploy.

**Option B — Root Directory = repository root**

Committing `vercel.json` (already in this repo) drives the workspace build
explicitly: `npm ci` at the root, `npm --workspace @campusflow/web run build`,
output in `apps/web/.next`.

Either way, set:

| Variable     | Example                                | Notes                            |
| ------------ | -------------------------------------- | -------------------------------- |
| `API_ORIGIN` | `https://campusflow-api.onrender.com`  | Server-side only, never exposed   |

The rewrite in `apps/web/next.config.ts` proxies `/api/backend/*` to `API_ORIGIN`,
so the browser keeps talking to a single origin and the API needs no CORS entry
for web traffic.

> `API_ORIGIN` is read by `next.config.ts` — redeploy the web app whenever the API
> URL changes.

### 3.2 API → Render

`render.yaml` is a working blueprint (API + managed PostgreSQL).

1. **New → Blueprint → select the repo.** Render reads the blueprint and creates
   the database and the web service.
2. Set the two values marked `sync: false`:

   | Variable        | Value                                                    |
   | --------------- | -------------------------------------------------------- |
   | `AI_SERVICE_URL`| The deployed FastAPI URL, e.g. `https://campusflow-ai-….run.app` |
   | `CORS_ORIGIN`   | Your Vercel origin, e.g. `https://campusflow.vercel.app`  |

   `JWT_SECRET` is generated automatically; `DATABASE_URL` is injected from the
   managed database.
3. First deploy runs `prisma db push` and then serves. Seed the demo dataset once
   from a shell:

   ```bash
   npm --workspace @campusflow/api run db:seed
   ```

Any other Node host works the same way — `render.yaml` is only a convenience:

```bash
npm ci
npx prisma generate --schema apps/api/prisma/schema.prisma
npm --workspace @campusflow/api run build
cd apps/api && npx prisma db push --skip-generate && node dist/index.js
```

### 3.3 AI → Cloud Run (or any container host)

```bash
gcloud builds submit apps/ai --tag gcr.io/$PROJECT/campusflow-ai:v1

gcloud run deploy campusflow-ai \
  --image gcr.io/$PROJECT/campusflow-ai:v1 \
  --region asia-south1 --platform managed \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=$GEMINI_API_KEY \
  --memory 1Gi --port 8000
```

Notes:

- The image needs **1 GiB** — FAISS + NumPy are memory-hungry in a 512 MiB instance.
- Without `GEMINI_API_KEY` the service still runs (deterministic fallbacks), which
  is a perfectly good demo configuration.
- Keep it private behind your API if you prefer (`--no-allow-unauthenticated`) and
  give the API a service-account token; the API client sends plain bearer headers.

### 3.4 Database

Any PostgreSQL 16 works. Migrations are schema-driven:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma   # versioned migrations
npx prisma db push --schema apps/api/prisma/schema.prisma          # quick sync (used by Compose)
```

See `infra/postgres/README.md` for setup, backup and tuning.

---

## 4. Environment variables

| Variable                | Service | Required | Purpose                                                      |
| ----------------------- | ------- | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | api     | ✅       | PostgreSQL connection string                                  |
| `JWT_SECRET`            | api     | ✅       | Signing key — **must** be long and random in production       |
| `JWT_EXPIRES_IN`        | api     | —        | Token lifetime (default `7d`)                                 |
| `PORT`                  | api     | —        | Default `4000`                                                |
| `CORS_ORIGIN`           | api     | —        | Comma-separated allowed browser origins                       |
| `AI_SERVICE_URL`        | api     | —        | FastAPI base URL (default `http://127.0.0.1:8000`)            |
| `SEED_DEFAULT_PASSWORD` | api     | —        | Password for seeded demo accounts (default `Password@123`)    |
| `NODE_ENV`              | api/web | —        | `production` enables stricter rate limits                     |
| `API_ORIGIN`            | web     | ✅       | Where the server proxies `/api/backend/*`                     |
| `GEMINI_API_KEY`        | ai      | —        | Enables Gemini; absent → local fallbacks                      |
| `GEMINI_MODEL`          | ai      | —        | Default `gemini-2.0-flash`                                    |
| `GEMINI_EMBED_MODEL`    | ai      | —        | Default `text-embedding-004`                                  |
| `CORS_ORIGINS`          | ai      | —        | Origins allowed to call the AI service directly               |
| `FAISS_INDEX_PATH`      | ai      | —        | Index file path (default `data/faiss/students.index`)         |
| `EMBEDDING_DIM`         | ai      | —        | Vector dimension (default `512`)                              |

`apps/api/src/env.ts` validates the API environment with Zod **at boot** and exits
with a readable error rather than failing later on the first request.

---

## 5. CI/CD

### `.github/workflows/ci.yml` — every push / PR

| Job      | What it proves                                                              |
| -------- | --------------------------------------------------------------------------- |
| `api`    | Spins up PostgreSQL 16, generates Prisma, typechecks, seeds, runs vitest     |
| `web`    | Typechecks, runs the vitest suite, produces a production `next build`        |
| `ai`     | Installs Python deps, compile-checks all modules, runs the 14 pytest cases with `GEMINI_API_KEY` **empty** (proves the fallbacks work) |
| `docker` | Builds all three images with layer caching                                   |

### `.github/workflows/deploy.yml` — `main`

| Job   | Target                                            | Required secrets                                             |
| ----- | ------------------------------------------------- | ------------------------------------------------------------ |
| `web` | Vercel (prebuilt deployment)                      | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`         |
| `api` | Render deploy hook                                | `RENDER_DEPLOY_HOOK_URL`                                     |
| `ai`  | Cloud Run                                         | `GCP_SA_KEY`, `GCP_PROJECT_ID`, `GEMINI_API_KEY`             |

Each job **skips cleanly with a message** if its secrets are missing, so the
workflow is safe to merge before you have set up every provider.

---

## 6. Operations

### Health checks

```bash
curl -fsS https://<api>/health          # {"status":"ok",...}
curl -fsS https://<ai>/ai/health        # provider + index size
curl -fsS https://<web>/                 # 200
```

`/health` is excluded from rate limiting, so it is safe to poll aggressively.

### Rebuilding the AI index after a data change

Matching works without it (the service embeds the pool on demand), but the index
is the fast path:

```bash
TOKEN=$(curl -s https://<api>/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"officer@campusflow.dev","password":"<password>"}' | jq -r .data.token)

curl -X POST https://<api>/api/v1/ai/sync-index -H "authorization: Bearer $TOKEN"
```

The index lives in memory: every container restart needs one `sync-index` call, or
you can mount `FAISS_INDEX_DIR` on a volume to persist it.

### Backups

```bash
pg_dump "$DATABASE_URL" -Fc -f campusflow-$(date +%F).dump     # backup
pg_restore -d "$DATABASE_URL" --clean campusflow-2026-09-18.dump  # restore
```

### Scaling notes

| Symptom                        | Action                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| API CPU-bound on analytics     | Analytics are pure SQL aggregates — add read replicas or cache      |
| AI latency high under load     | Scale AI horizontally; it is stateless apart from the index        |
| FAISS index too large for RAM  | Swap `IndexFlatIP` for `IndexIVFFlat` in `app/vector_store.py`      |
| Rate limiting too aggressive   | Tune the limiter in `apps/api/src/app.ts` (`RATE_LIMIT_MAX`)        |

---

## 7. Before you go live — checklist

- [ ] `JWT_SECRET` is a long random value, not the placeholder.
- [ ] `SEED_DEFAULT_PASSWORD` is changed, or demo accounts are deleted.
- [ ] `CORS_ORIGIN` lists only your real web origins (no `*`).
- [ ] Database backups are scheduled and one restore has been rehearsed.
- [ ] `AI_SERVICE_URL` points at a running AI service (or accept degraded AI).
- [ ] Rate limits reviewed for expected traffic.
- [ ] `python3 scripts/smoke_test.py` passes against the deployed URLs.
- [ ] HTTPS enforced end-to-end; the JWT cookie is `Secure` + `SameSite=Lax`.

---

## 8. Troubleshooting

| Symptom                                        | Cause / fix                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `P1001: Can't reach database server`           | Bad `DATABASE_URL`; inside Compose the host is `postgres`, not `localhost`      |
| Web shows "Could not reach the CampusFlow API" | `API_ORIGIN` wrong, or the API is down — check `<api>/health`                   |
| `502 UPSTREAM_UNAVAILABLE` on AI routes        | AI service unreachable; the rest of the app keeps working by design             |
| Login works but every call is 401              | `JWT_SECRET` differs between instances — all replicas must share one value      |
| Matches look weak or identical                 | Reseed ran after the last index build → `POST /ai/sync-index`                   |
| Gemini calls fail with 429                     | Quota; the service falls back per request, or lower the model in `GEMINI_MODEL` |
| `next build` fails with module resolution      | Run `npm install` at the repo root so workspace links exist                     |
