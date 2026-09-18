# CampusFlow — Architecture

Three independently deployable services share one PostgreSQL database and one
domain vocabulary. The browser only ever talks to the Next.js app.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│  · React 19 / Next.js App Router                                         │
│  · talks ONLY to same-origin /api/backend/*                              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  HTTP (same origin — no CORS anywhere)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  apps/web · Next.js 15  (:3000)                                          │
│  · server-side rewrite  /api/backend/:path*  →  API_ORIGIN/api/:path*    │
│  · AuthProvider (JWT in localStorage w/ in-memory fallback)              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│  apps/api · Express 4 + Prisma  (:4000)                                  │
│  · 11 route modules under /api/v1                                        │
│  · JWT auth (cookie cf_token) · role guards · Zod validation             │
│  · services/eligibility.ts  ← single source of truth for eligibility     │
│  · services/aiClient.ts     ← typed client for the FastAPI service       │
└──────┬──────────────────────────────────┬────────────────────────────────┘
       │ Prisma (pg driver)               │ REST (127.0.0.1:8000)
┌──────▼──────────────┐         ┌─────────▼────────────────────────────────┐
│  PostgreSQL 16      │         │  apps/ai · FastAPI  (:8000)              │
│  15 models          │         │  embeddings · FAISS · matching ·         │
│  · students, courses│         │  resume · interview · llm (Gemini)       │
│  · jobs, applicat…  │         │  deterministic fallbacks when key absent │
└─────────────────────┘         └──────────────────────────────────────────┘
```

---

## 1. Frontend — `apps/web`

**Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS, zero UI
dependencies.** Every icon, chart and table is hand-built inline SVG/CSS, so the
bundle ships no third-party UI runtime and the app renders identically inside a
sandboxed iframe.

### Request path

`src/lib/api.ts` is the only place that knows how to fetch. It always calls
`/api/backend/v1/...` — a same-origin route that `next.config.ts` rewrites to the
Express API server-side. Consequences:

- no CORS configuration is needed on the API for browser traffic;
- the API host is never baked into the client bundle, so the same build works in
  local dev, Docker Compose and Vercel;
- the session token never crosses an origin boundary.

### State

| Concern      | Implementation                                            |
| ------------ | --------------------------------------------------------- |
| Session      | `AuthProvider` context in `src/lib/auth.tsx`; token in `tokenStore` |
| Data loading | `useAsync` in `src/lib/hooks.ts` (loading / error / retry) |
| Filters      | `useDebounced` for search inputs, local state elsewhere    |
| Persistence  | `tokenStore` — `localStorage` with an in-memory Map fallback |

> **Why the memory fallback matters:** `localStorage` throws a `SecurityError`
> inside a `sandbox="allow-scripts"` iframe. The token store catches that and
> degrades to a per-tab Map so the preview never white-screens.

### Routing

```
/login                     public
/(app)/dashboard           role-aware: StudentDashboard | StaffDashboard
/(app)/students            directory + 360° profile at /students/[id]
/(app)/placements          drive list + CreateJobModal (staff)
/(app)/placements/[id]     job detail, candidates, AI shortlist
/(app)/applications        student vs staff column sets + detail modal
/(app)/pipeline            kanban, click-to-move across 7 stages
/(app)/attendance          student view vs staff view
/(app)/courses             course grid + inline roster
/(app)/companies           recruiter grid + AddCompanyModal
/(app)/analytics           KPIs, charts, client-side CSV export
/(app)/ai-studio           recommendations · matching · résumé · interviews
/(app)/profile             account, readiness, résumé parsing, password
```

`AppShell` filters the nav by role, so a student never sees an analytics link
they would be forbidden from opening.

---

## 2. Backend — `apps/api`

Express 4 with a modular structure; every module exports a `Router` mounted under
`/api/v1` by `src/routes/index.ts`.

### Middleware chain (order matters)

1. `helmet`, `cors`, `compression`, `morgan`
2. `cookieParser` — reads the `cf_token` cookie
3. **`authenticate`** — *non-blocking*: attaches `req.user` when a valid token is
   present but never rejects. Public routes (`/health`, `/ai/health`) work untouched.
4. `/api/v1` router
5. rate limiter, then `notFoundHandler`, then `errorHandler`

Authorisation is opt-in per route via `requireAuth`, `requireRole(...)` or
`assertStudentScope(req, studentId)`.

### Error envelope

Every failure — validation, auth, Prisma, unexpected — returns the same shape:

```json
{ "error": { "code": "CONFLICT", "message": "You have already applied to this role." } }
```

`code` is a stable machine string (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `UPSTREAM_UNAVAILABLE`, …); `apps/web/src/lib/api.ts`
turns it into a typed `ApiError`.

### Eligibility — one rule, one place

`src/services/eligibility.ts` owns every constraint a posting can impose:

- minimum CGPA / maximum backlogs
- allowed departments and batches
- an open, unexpired deadline

`checkEligibility()` is used by the apply endpoint, the job-detail funnel, the
candidate matcher and the AI service payload builder, so the UI can never tell a
student they are eligible for something the API will reject. The AI service
receives *pre-computed* eligibility flags and only scores; it never re-derives the
rules.

### Notifications

Written inside the same transaction as the state change that caused them:

| Trigger                    | Recipients                        |
| -------------------------- | --------------------------------- |
| New posting created        | every currently eligible student  |
| Application status changes | the applicant                     |
| New application            | placement officers                |
| Offer released             | the candidate                     |

### Data model (`prisma/schema.prisma`)

11 enums, 15 models, `snake_case` table names via `@@map`.

```
User ──1:1── Student ──┬── Enrollment ── Course ── Faculty ── Department
  │                    ├── AttendanceRecord ── AttendanceSession
  │                    ├── Application ──┬── Interview
  │                    │                 └── Offer
  │                    └── AIInteraction
  └── Notification
Company ──1:N── JobPosting ──1:N── Application
```

Key design choices:

- **`Student` is a profile, not an identity.** Credentials live on `User`
  (`email`, `passwordHash`, `role`), so staff, students and admins share one
  auth path and one audit trail.
- **Applications are append-only in spirit.** Status transitions are recorded
  with a `statusUpdatedAt` + note rather than deleted, which is what the kanban
  and funnel read from.
- **`AIInteraction` logs every model call** (kind, provider, latency, tokens) so
  the AI Studio telemetry panel reads from the database, not from logs.

### Seed data

`prisma/seed.ts` is deterministic (Mulberry32 PRNG, fixed seed) so a fresh clone
always produces the same demo: 6 departments, 12 faculty, 12 courses, 60 students,
10 recruiters, 14 postings, ~184 applications across all stages, interviews,
offers, notifications — plus a deliberate spread of CGPA cohorts so eligibility
filters, AI ranking and "at risk" attendance states all have something to show.

---

## 3. AI service — `apps/ai`

FastAPI on port 8000. Stateless except for the in-memory FAISS index.

### Matching pipeline

```
POST /ai/match/students-for-job
  ├─ candidate profiles ──► embeddings.embed_texts()
  │                           ├─ Gemini text-embedding-004 (if key present)
  │                           └─ hashed TF-IDF/char-trigram, 512-dim (fallback)
  ├─ FAISS IndexFlatIP search ──► raw cosine similarity
  ├─ calibrate_similarity()  ──► maps the provider's practical band onto [0,1]
  │                             local  (0.15 … 0.65)
  │                             gemini (0.55 … 0.92)
  └─ matching.score_pair()
       0.35 × semantic + 0.50 × skill overlap + 0.15 × fit
       ineligible candidates clamped to ≤ 45, always ranked below eligible ones
```

**Why calibration exists.** Raw cosine similarity for hashed TF-IDF lives in a
narrow band — a perfectly good match might score 0.42 while unrelated text scores
0.05. Feeding that straight into a 100-point scale makes every candidate look
weak. `calibrate_similarity()` stretches the provider's *useful* range across
[0,1] and clamps beyond it, so a 0.42 local score reads as a strong ~74 rather
than a misleading 42. Gemini embeddings sit in a different band, hence the
per-provider table.

**Why skill overlap carries the most weight.** Semantic similarity alone happily
ranks a frontend engineer for a kernel role if the prose sounds similar. Explicit
skill matching against the job's required technologies is the strongest honest
signal, so it takes 50 %.

### Other capabilities

| Endpoint                     | Notes                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| `POST /ai/resume/ats-score`  | 55 % JD keyword coverage + 25 % section presence + 20 % quality |
| `POST /ai/resume/parse`      | Heuristic extraction (skills, education, experience) + Gemini gap-fill |
| `POST /ai/interview/questions` | Skill-bank driven; company/role specific questions          |
| `POST /ai/shortlist`         | Ranks a pool and writes a recruiter-facing briefing          |
| `POST /ai/chat`              | Grounded assistant — see below                               |

Keyword extraction uses **word-boundary regex matching**, not substring search
(an early version matched "ship" inside "leadership" and inflated ATS scores).

### Grounded chat

The API builds a compact context block from live PostgreSQL rows — the student's
CGPA, backlogs, skills and the eligible openings; or, for staff, the current
placement rate, open drives and top recruiters — and passes it to the model.
Without a Gemini key, `fallback_chat()` composes an answer *from those same rows*
rather than apologising, so the Copilot still names real recruiters with real
package values in a keyless demo.

### Degradation policy

| Failure                       | Behaviour                                            |
| ----------------------------- | ---------------------------------------------------- |
| `GEMINI_API_KEY` unset        | local hashing embeddings + template prose            |
| Gemini 429/timeout            | retried once, then falls back for that request       |
| AI service entirely down      | API returns `502 UPSTREAM_UNAVAILABLE`; **applying still works** — scoring is best-effort and never blocks a write |

---

## 4. Cross-cutting decisions

| Decision                          | Rationale                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- |
| Same-origin API proxy             | No CORS, no exposed backend host, one build for every environment         |
| Eligibility computed server-side  | One authority; UI and AI both consume it, so they cannot disagree         |
| AI is advisory, never authoritative | A dead model must not stop a student from applying                       |
| Deterministic fallbacks everywhere | CI, offline demos and screenshots need no API key                         |
| Zero UI dependencies              | No icon/chart library to audit; renders inside sandboxed iframes          |
| Deterministic seed                | Every developer sees the same numbers, so screenshots and tests are stable |
| Click-to-move kanban              | HTML5 drag-and-drop is unusable on touch devices and inside iframes       |

---

## 5. Testing strategy

| Layer    | Tool                     | Scope                                                          |
| -------- | ------------------------ | -------------------------------------------------------------- |
| API      | vitest + supertest       | 15 cases: health, auth 401/422, directory filters, pipeline     |
| Web      | vitest + Testing Library | 20 cases: formatters, token fallback, client error mapping      |
| AI       | pytest                   | 14 cases: embeddings, FAISS, matching order, ATS, interview, chat |
| End-to-end | `scripts/smoke_test.py` | 43 checks across all four layers against running services       |

The smoke test is the acceptance gate: it logs in as all four roles, asserts the
401/403 boundaries, walks a real application from `APPLIED` to `SHORTLISTED`,
checks the recipient actually received a notification, and confirms the AI returns
ordered, explained, eligibility-aware matches.
