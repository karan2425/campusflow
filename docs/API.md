# CampusFlow — REST API reference

Base URL: **`http://localhost:4000/api/v1`** (the web app reaches it through the
same-origin proxy at `/api/backend/v1`).

All requests and responses are JSON. Authenticated endpoints expect:

```
Authorization: Bearer <jwt>
```

The JWT is also set as an httpOnly cookie (`cf_token`) on login, so browser
clients can rely on the cookie alone.

---

## Envelopes

**Success** — always wrapped, `data` is the payload, `meta` appears on paginated lists:

```json
{ "success": true, "data": { "id": "cmu7…", "title": "SDE Intern" } }
```

**Failure** — one shape for every error source (validation, auth, Prisma, unexpected):

```json
{ "success": false, "error": { "code": "CONFLICT", "message": "You have already applied to this role." } }
```

Validation errors add a per-field `details` array:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request payload failed validation",
    "details": [{ "path": "email", "message": "Invalid email" }]
  }
}
```

| Code                   | HTTP | Meaning                                          |
| ---------------------- | ---- | ------------------------------------------------ |
| `VALIDATION_ERROR`     | 422  | Zod rejected the body/query                      |
| `UNAUTHORIZED`         | 401  | Missing, malformed or expired token              |
| `FORBIDDEN`            | 403  | Authenticated but the role may not do this       |
| `NOT_FOUND`            | 404  | No such record                                   |
| `CONFLICT`             | 409  | Duplicate application, already-withdrawn, …      |
| `BAD_REQUEST`          | 400  | Business-rule rejection (e.g. not eligible)      |
| `RATE_LIMITED`         | 429  | Too many requests                                |
| `UPSTREAM_UNAVAILABLE` | 502  | AI service unreachable                           |
| `INTERNAL_ERROR`       | 500  | Unhandled server fault                           |

**Pagination** — `?page=1&pageSize=20` (max 100). Lists return:

```json
{ "success": true, "data": [ … ], "meta": { "page": 1, "pageSize": 20, "total": 60, "totalPages": 3 } }
```

---

## System

### `GET /health` (no auth)
Liveness for the API process itself.

```json
{ "status": "ok", "service": "campusflow-api", "version": "1.0.0", "env": "development", "uptimeSec": 412 }
```

### `GET /` (no auth)
Machine-readable route index — useful for discovery and smoke tests.

---

## Auth — `/auth`

| Method | Path               | Auth        | Description                                  |
| ------ | ------------------ | ----------- | -------------------------------------------- |
| POST   | `/auth/login`      | public      | Email + password → JWT, sets `cf_token` cookie |
| POST   | `/auth/register`   | public      | Self-registration — **students only**        |
| GET    | `/auth/me`         | any         | Current user, profile, unread notification count |
| POST   | `/auth/change-password` | any    | Current + new password                       |
| POST   | `/auth/logout`     | any         | Clears the auth cookie                       |

**`POST /auth/login`**

```bash
curl -X POST localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"officer@campusflow.dev","password":"Password@123"}'
```

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi…",
    "user": {
      "id": "cmu7acgcy0007nzlehxkbrtkv",
      "email": "officer@campusflow.dev",
      "name": "Sanjay Deshpande",
      "role": "PLACEMENT_OFFICER",
      "unreadNotifications": 3,
      "student": null,
      "faculty": null
    }
  }
}
```

Errors: `401 UNAUTHORIZED` for bad credentials, `422 VALIDATION_ERROR` for a
malformed body. Staff accounts cannot self-register — an admin creates them.

---

## Students — `/students`

| Method | Path            | Roles                    | Description                                   |
| ------ | --------------- | ------------------------ | --------------------------------------------- |
| GET    | `/students`     | staff (students: own row) | Directory with filters + pagination          |
| GET    | `/students/:id` | staff, or the student    | 360° profile: academics, attendance, applications, offers |
| POST   | `/students`     | admin, officer           | Create a student + user in one transaction    |
| PATCH  | `/students/:id` | staff, or the student    | Update profile; students may edit a safe subset |

**Query parameters:** `q`, `department`, `batch`, `placementStatus`, `minCgpa`,
`maxCgpa`, `sort` (`cgpa` | `name` | `rollNo` | `createdAt`), `order` (`asc` | `desc`),
`page`, `pageSize`.

```bash
curl "localhost:4000/api/v1/students?department=CSE&minCgpa=8&sort=cgpa&pageSize=5" \
  -H "authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": [{
    "id": "cmu7acgf1002ynzlevoq4lq37",
    "name": "Aadhya Iyer",
    "email": "aadhya.iyer@campusflow.dev",
    "rollNo": "2026IT013",
    "department": "IT",
    "departmentName": "Information Technology",
    "batch": 2026,
    "currentSemester": 7,
    "cgpa": 6.2,
    "backlogs": 1,
    "skills": ["Git", "SQL", "Java", "Python", "Docker"],
    "placementStatus": "ELIGIBLE",
    "codingScore": 277,
    "githubScore": 633,
    "applications": 0,
    "city": "Indore"
  }],
  "meta": { "page": 1, "pageSize": 5, "total": 60, "totalPages": 12 }
}
```

The filter is applied **server-side** — `?minCgpa=8.5` never returns a 6.2 CGPA row.

---

## Departments — `/departments`

| Method | Path                       | Roles        | Description                              |
| ------ | -------------------------- | ------------ | ---------------------------------------- |
| GET    | `/departments`             | any          | All departments + student/placed counts  |
| POST   | `/departments`             | admin        | Create                                   |
| GET    | `/departments/:code/faculty` | any        | Faculty members of a department          |

---

## Courses — `/courses`

| Method | Path                    | Roles              | Description                                  |
| ------ | ----------------------- | ------------------ | -------------------------------------------- |
| GET    | `/courses`              | any                | Filter by `department`, `semester`, `q`      |
| POST   | `/courses`              | admin, officer, faculty | Create a course                        |
| GET    | `/courses/:id`          | any                | Course + roster with attendance %            |
| POST   | `/courses/:id/enroll`   | admin, officer, faculty | Enrol students (idempotent)             |
| PATCH  | `/courses/:id/grades`   | faculty, admin     | Bulk grade entry                             |

---

## Attendance — `/attendance`

| Method | Path                      | Roles                    | Description                                      |
| ------ | ------------------------- | ------------------------ | ------------------------------------------------ |
| POST   | `/attendance/sessions`    | faculty, admin, officer  | Record a session + per-student statuses          |
| GET    | `/attendance/sessions`    | staff                    | Sessions for a course/date range                 |
| GET    | `/attendance/overview`    | any                      | Institute/course overview, defaulters list       |
| GET    | `/attendance/student/:id` | staff, or the student    | Per-course breakdown with sessions               |

`POST /attendance/sessions` accepts `{ courseId, date, topic?, records: [{ studentId, status }] }`
where `status` is `PRESENT | ABSENT | LATE | EXCUSED`. It returns the created session
and **notifies** every student marked absent or late.

Thresholds used across the API and UI: **≥75 % safe · 65–74 % borderline · <65 % at risk**.

---

## Companies — `/companies`

| Method | Path             | Roles                 | Description                                        |
| ------ | ---------------- | --------------------- | -------------------------------------------------- |
| GET    | `/companies`     | any                   | Recruiters with posting and offer counts           |
| POST   | `/companies`     | admin, officer        | Add a recruiter                                    |
| GET    | `/companies/:id` | any                   | Recruiter detail + offers made and highest CTC     |

---

## Jobs — `/jobs`

| Method | Path                          | Roles           | Description                                   |
| ------ | ----------------------------- | --------------- | --------------------------------------------- |
| GET    | `/jobs`                       | any             | Search + filter open drives                   |
| POST   | `/jobs`                       | admin, officer  | Create a posting (notifies eligible students) |
| GET    | `/jobs/:id`                   | any             | Detail + funnel + applicant count             |
| PATCH  | `/jobs/:id`                   | admin, officer  | Update or close a posting                     |
| GET    | `/jobs/:id/matches`           | staff           | AI-ranked candidates for the role             |
| POST   | `/jobs/:id/applications/bulk` | admin, officer  | Enrol several students into a drive at once   |

**Query parameters:** `q`, `type` (`FULL_TIME` | `INTERNSHIP` | `INTERNSHIP_PPO` |
`PART_TIME`), `department`, `minCtc`, `status`, `sort` (`deadline` | `ctc` | `posted`),
`page`, `pageSize`.

**`GET /jobs/:id`** — the richest read in the API:

```json
{
  "success": true,
  "data": {
    "id": "cmu7…", "title": "Quantitative Developer", "type": "FULL_TIME",
    "ctcMin": 28, "ctcMax": 42, "openings": 4, "minCgpa": 8.2, "maxBacklogs": 1,
    "allowedDepartments": ["CSE", "IT", "ECE"], "batches": [2026, 2027],
    "skills": ["Python", "C++", "Statistics", "SQL"],
    "company": { "id": "cmu7…", "name": "FinEdge Capital", "industry": "Fintech" },
    "applicants": 13,
    "eligibleCount": 14,
    "funnel": [
      { "status": "APPLIED", "count": 6 },
      { "status": "SHORTLISTED", "count": 4 }
    ],
    "topCandidates": [ { "id": "cmu7…", "name": "Gaurav Chauhan", "cgpa": 9.1, "matchScore": 51.3 } ]
  }
}
```

`applicants` excludes `WITHDRAWN` applications. `company` is the expanded record,
not a name string.

**`GET /jobs/:id/matches?topK=15`** — `{ jobId, poolSize, provider, matches[] }`.
Each match carries `score`, `semanticScore`, `skillScore`, `fitScore`, `eligible`,
`blockers[]`, `matchedSkills[]`, `missingSkills[]` and a written `rationale`.
Ordering is `(eligible desc, score desc)`.

---

## Applications — `/applications`

| Method | Path                            | Roles                  | Description                                    |
| ------ | ------------------------------- | ---------------------- | ---------------------------------------------- |
| GET    | `/applications`                 | any (scoped)           | Students see their own; staff see all          |
| GET    | `/applications/pipeline`        | staff                  | Kanban columns across the 7 stages             |
| POST   | `/applications`                 | student                | Apply to a posting                             |
| PATCH  | `/applications/:id/status`      | staff                  | Move stage (notifies the student)              |
| POST   | `/applications/:id/interviews`  | staff                  | Schedule an interview                          |
| PATCH  | `/applications/interviews/:id`  | staff                  | Record result / feedback                       |
| POST   | `/applications/:id/offer`       | staff                  | Release an offer                               |
| PATCH  | `/applications/offers/:id`      | student (holder)       | Accept or decline an offer                     |
| DELETE | `/applications/:id`             | student (holder)       | Withdraw while still allowed                   |

**`POST /applications`**

```json
{ "jobId": "cmu7…", "coverNote": "Optional note to the recruiter." }
```

Behaviour:

1. Re-checks eligibility server-side (CGPA, backlogs, branch, batch, deadline);
   ineligible → `400 BAD_REQUEST` with the specific blockers.
2. Computes a match score for the record (best-effort — an unreachable AI service
   does **not** block the application).
3. Notifies placement officers.
4. A second application to the same posting → `409 CONFLICT`.

**Stage transitions** run through `PATCH /applications/:id/status` with
`{ "status": "SHORTLISTED", "note": "Strong DSA round" }`. Valid statuses:
`APPLIED → UNDER_REVIEW → SHORTLISTED → INTERVIEW_SCHEDULED → INTERVIEWED →
OFFERED`, plus the terminal `REJECTED` and `WITHDRAWN`.

**Withdrawal** (`DELETE /applications/:id`) is permitted while the application is
early in the pipeline and refused with `409 CONFLICT` once the candidate has been
interviewed — the student is told to contact the placement cell.

Accepting an offer sets the student's `placementStatus` to `PLACED` and closes
their other active applications.

---

## Analytics — `/analytics`

| Method | Path                    | Roles         | Description                                          |
| ------ | ----------------------- | ------------- | ---------------------------------------------------- |
| GET    | `/analytics/overview`   | staff only    | Season dashboard (`?batch=2026`)                     |
| GET    | `/analytics/student/:id` | staff, or the student | Per-student placement analytics           |

`GET /analytics/overview` returns:

| Key              | Contents                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `batch`          | Batch the numbers describe                                        |
| `headline`       | `totalStudents`, `placed`, `placementRate`, `avgCtc`, `highestCtc`, `openPostings`, `activeApplications`, `offersReleased` |
| `byStatus`       | Student count per placement status                                |
| `funnel`         | Applications per stage (feeds the funnel chart)                   |
| `byDepartment`   | Per-branch students / placed / rate / avg CTC                     |
| `topRecruiters`  | Recruiter leaderboard by offers and highest package               |
| `trend`          | Monthly offers released                                           |
| `ctcBands`       | Distribution across CTC brackets                                  |

---

## AI — `/ai`

The API is the only client of the FastAPI service; these endpoints are the
contract the web app consumes.

| Method | Path                          | Roles              | Description                                        |
| ------ | ----------------------------- | ------------------ | -------------------------------------------------- |
| GET    | `/ai/health`                  | public             | AI service reachability, provider, index size      |
| POST   | `/ai/sync-index`              | admin, officer     | Rebuild the FAISS index from PostgreSQL            |
| POST   | `/ai/chat`                    | any                | Grounded copilot Q&A with role-aware context       |
| POST   | `/ai/resume/ats-score`        | student            | ATS score for a JD (or the student's top match)    |
| POST   | `/ai/resume/parse`            | student            | Extract skills/education from résumé text          |
| GET    | `/ai/recommendations`         | student            | Personalised ranked openings                       |
| POST   | `/ai/interview-prep`          | student            | Generated interview questions for a role           |
| POST   | `/ai/jobs/:id/shortlist`      | staff              | Ranked shortlist + written briefing                |
| GET    | `/ai/insights`                | staff              | Institute-level AI insights and telemetry          |

**`POST /ai/sync-index`** → `{ "indexed": 60, "dimension": 512, "provider": "local-hashing", "latencyMs": 136 }`

Run it after a reseed; otherwise matching embeds the pool on the fly (same results,
slightly slower).

**`GET /ai/health`** → `{ "status": "ok", "provider": "local-hashing", "indexSize": 60, "geminiEnabled": false, "reachable": true, "roundTripMs": 68 }`

**`POST /ai/chat`** → `{ "reply": "…", "provider": "grounded-fallback", "latencyMs": 18, "suggestions": ["…"] }`

Every AI response reports the `provider` (`gemini` or a local fallback) so the UI
can show which engine answered, and no AI failure ever blocks a write.

---

## AI microservice (internal)

FastAPI on **:8000**, consumed by `apps/api` via `AI_SERVICE_URL`. Not exposed to
the browser.

| Method | Path                       | Description                                   |
| ------ | -------------------------- | --------------------------------------------- |
| GET    | `/ai/health`               | Status, provider, index size, embedding dim   |
| GET    | `/ai/info`                 | Capability manifest (models, weights, limits) |
| POST   | `/ai/index/students`       | Build the FAISS index                         |
| DELETE | `/ai/index/students`       | Drop the index                                |
| POST   | `/ai/match/students-for-job` | Score a candidate pool against one role     |
| POST   | `/ai/match/jobs-for-student` | Rank open roles for one student             |
| POST   | `/ai/shortlist`            | Ranked shortlist + recruiter briefing         |
| POST   | `/ai/chat`                 | Server-to-server chat completion              |
| POST   | `/ai/resume/ats-score`     | JD keyword coverage scoring                   |
| POST   | `/ai/resume/parse`         | Résumé section/skill extraction               |
| POST   | `/ai/interview/questions`  | Role-specific question generation             |

Interactive docs are served at `http://localhost:8000/docs`.

---

## Rate limits

| Environment | Limit            |
| ----------- | ---------------- |
| production  | 200 req/min/IP   |
| development | 2000 req/min/IP  |

`/health` and `/api/health` are exempt. Exceeding the limit returns
`429 RATE_LIMITED`.

---

## Complete route index

```
GET    /health                          GET    /jobs
GET    /                                POST   /jobs
POST   /auth/login                      GET    /jobs/:id
POST   /auth/register                   PATCH  /jobs/:id
GET    /auth/me                         GET    /jobs/:id/matches
POST   /auth/change-password            POST   /jobs/:id/applications/bulk
POST   /auth/logout                     GET    /applications
GET    /students                        GET    /applications/pipeline
GET    /students/:id                    POST   /applications
POST   /students                        PATCH  /applications/:id/status
PATCH  /students/:id                    POST   /applications/:id/interviews
GET    /departments                     PATCH  /applications/interviews/:id
POST   /departments                     POST   /applications/:id/offer
GET    /departments/:code/faculty       PATCH  /applications/offers/:id
GET    /courses                         DELETE /applications/:id
POST   /courses                         GET    /analytics/overview
GET    /courses/:id                     GET    /analytics/student/:id
POST   /courses/:id/enroll              GET    /ai/health
PATCH  /courses/:id/grades              POST   /ai/sync-index
POST   /attendance/sessions             POST   /ai/chat
GET    /attendance/sessions             POST   /ai/resume/ats-score
GET    /attendance/overview             POST   /ai/resume/parse
GET    /attendance/student/:id          GET    /ai/recommendations
GET    /companies                       POST   /ai/interview-prep
POST   /companies                       POST   /ai/jobs/:id/shortlist
GET    /companies/:id                   GET    /ai/insights
GET    /notifications                   PATCH  /notifications/read
```
