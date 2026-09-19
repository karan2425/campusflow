# 🎓 CampusFlow

[![CI](https://github.com/karan2425/campusflow/actions/workflows/ci.yml/badge.svg)](https://github.com/karan2425/campusflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](apps/ai/requirements.txt)

**An AI-powered college management & placement platform** — student records, attendance,
courses, recruiter drives, the full application pipeline, placement analytics, and a
Gemini + FAISS AI layer that scores résumés, matches candidates to roles and generates
interview prep.

Built as a runnable monorepo: **Next.js + TypeScript + Tailwind** on the front,
**Express + Prisma + PostgreSQL** in the middle, **FastAPI + Gemini + FAISS** for the AI,
and **Docker + GitHub Actions + Vercel/Render/Cloud Run** for delivery.

---

## Stack

| Layer     | Technology                                              | Location        |
| --------- | ------------------------------------------------------- | --------------- |
| Frontend  | Next.js 15 (App Router), React 19, TypeScript, Tailwind | `apps/web`      |
| Backend   | Node.js 20, Express 4, REST, Zod, JWT                   | `apps/api`      |
| Database  | PostgreSQL 16 + Prisma ORM (15 models)                  | `apps/api/prisma` |
| AI        | Python 3.12, FastAPI, Gemini, FAISS, NumPy              | `apps/ai`       |
| Shared    | Domain constants + API contracts                        | `packages/shared` |
| Ops       | Docker Compose, GitHub Actions, Vercel, Render, Cloud Run | `infra/`, `.github/` |
| Docs      | Architecture, API reference, deployment runbook          | `docs/`         |

---

## Quick start

### Option A — Docker Compose (everything)

```bash
git clone <your-repo> campusflow && cd campusflow
cp .env.example .env            # optionally add GEMINI_API_KEY
docker compose up --build
```

Open **http://localhost:3000**. The API container migrates and seeds the database
on first boot.

### Option B — native (fast dev loop)

```bash
# 1. dependencies
npm install
cd apps/ai && python3 -m pip install -r requirements.txt && cd ../..

# 2. database (Docker, or any local PostgreSQL 16)
docker compose up -d postgres

# 3. env
cp apps/api/.env.example apps/api/.env         # already correct for the compose DB
cp apps/ai/.env.example apps/ai/.env           # GEMINI_API_KEY optional
echo "API_ORIGIN=http://127.0.0.1:4000" > apps/web/.env.local

# 4. schema + demo data
npm run db:push && npm run db:seed

# 5. run everything (api :4000, web :3000, ai :8000)
npm run dev
```

Then sync the AI vector index once so matching uses the fast path:

```bash
TOKEN=$(curl -s localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"officer@campusflow.dev","password":"Password@123"}' | jq -r .data.token)

curl -s -X POST localhost:4000/api/v1/ai/sync-index -H "authorization: Bearer $TOKEN"
# {"data":{"indexed":60,"dimension":512,"provider":"local-hashing","latencyMs":136}}
```

### Verify the whole stack

```bash
python3 scripts/smoke_test.py      # 43 end-to-end checks
```

---

## Demo accounts

Every seeded account uses the password **`Password@123`**.

| Role              | Email                        | What to try                                                       |
| ----------------- | ---------------------------- | ----------------------------------------------------------------- |
| Placement Officer | `officer@campusflow.dev`     | Create a drive, AI-shortlist candidates, move the pipeline        |
| Student           | `demo.student@campusflow.dev`| Get AI recommendations, score a résumé, run interview prep        |
| Administrator     | `admin@campusflow.dev`       | Institute analytics, departments, staff accounts                  |
| Faculty           | `faculty@campusflow.dev`     | Course rosters, attendance, student 360° profiles                 |

The login screen has one-click buttons for all four.

---

## What's inside

### Student experience
- **Dashboard** — placement-readiness ring, AI-recommended openings with one-click apply,
  application timeline, offer status.
- **Placements** — searchable drives with type / branch / CTC / eligibility filters.
- **AI Studio** — personalised recommendations, résumé & ATS scoring with keyword gaps,
  and generated interview questions per role.
- **Attendance** — overall %, per-course breakdown with the 75 % requirement marked, and
  a warning when a course drops below the bar.
- **Applications** — track every stage, respond to offers, withdraw while eligible.

### Staff experience
- **Analytics** — placement rate, average/highest CTC, department breakdown, recruiter
  leaderboard, funnel and CTC distribution (client-side CSV export).
- **Pipeline** — kanban across the seven application stages with click-to-move actions and
  automatic student notifications.
- **Students** — filterable directory (CGPA, branch, batch, placement status) and a 360°
  profile with academics, attendance, applications and offers.
- **AI Studio** — rank every candidate for a role, shortlist with a written briefing,
  rebuild the vector index, and watch AI provider/latency telemetry.
- **Companies / Courses** — recruiter records with offers made and highest CTC; course
  rosters, enrolment and grade entry.
- **Copilot** — a global chat drawer that answers from live campus data (grounded in
  PostgreSQL, so it never invents a recruiter that does not exist).

### AI layer
| Capability        | How it works                                                                         |
| ----------------- | ------------------------------------------------------------------------------------ |
| Embeddings        | Gemini `text-embedding-004`; deterministic 512-dim hashed TF-IDF fallback offline     |
| Vector search     | FAISS `IndexFlatIP` over the student pool, rebuilt from PostgreSQL                    |
| Match score       | `0.35 × calibrated semantic + 0.50 × skill overlap + 0.15 × fit`, ineligible capped ≤45 |
| Résumé / ATS      | 55 % keyword coverage + 25 % section presence + 20 % quality signals                  |
| Interview prep    | Gemini-generated, deterministic skill-bank fallback offline                           |
| Chat              | Gemini with a role-aware system prompt; grounded fallback composes from live DB rows  |

The service runs **without an API key** — every endpoint degrades to a deterministic
local implementation, so demos, tests and CI never depend on a paid provider.

---

## Project layout

```
campusflow/
├── apps/
│   ├── api/          Express + Prisma REST API  (port 4000)
│   │   ├── prisma/   schema.prisma · seed.ts · seed-if-empty.mjs
│   │   └── src/      modules/ · services/ · middleware/ · lib/
│   ├── ai/           FastAPI AI microservice    (port 8000)
│   │   ├── app/      embeddings · vector_store · matching · llm · resume · interview
│   │   └── tests/    14 pytest cases
│   └── web/          Next.js front end          (port 3000)
│       └── src/      app/ · components/ · lib/
├── packages/shared/  domain constants + API contracts
├── infra/postgres/   database init notes & helpers
├── docs/             architecture · api · deployment
├── scripts/          smoke_test.py (end-to-end verification)
├── docker-compose.yml
└── vercel.json · render.yaml
```

---

## Commands

| Command                                | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `npm run dev`                          | API + web + AI together (concurrently)         |
| `npm run dev:api` / `dev:web` / `dev:ai` | Run one service                              |
| `npm run db:push` / `db:seed` / `db:reset` | Schema sync, demo data, wipe + reseed      |
| `npm test`                             | API suite (vitest) + web suite (vitest)        |
| `npm run build`                        | Compile API (tsc) and web (next build)         |
| `python3 scripts/smoke_test.py`        | 43-check end-to-end verification               |
| `docker compose up -d postgres`        | Just the database                              |
| `npm run infra:up` / `infra:down`      | Compose up/down                                |

---

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — services, data model, AI internals, request flows.
- **[docs/API.md](docs/API.md)** — every REST endpoint with payloads and examples.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Docker, Vercel + Render + Cloud Run, CI/CD.
- **[infra/postgres/README.md](infra/postgres/README.md)** — database setup, backup, troubleshooting.

---

## License

MIT — see [LICENSE](LICENSE).
