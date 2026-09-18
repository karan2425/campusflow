# PostgreSQL for CampusFlow

Everything the API needs lives in `apps/api/prisma/schema.prisma` — this folder is
only about running the database itself.

---

## Run it

**Docker Compose (recommended):**

```bash
docker compose up -d postgres
```

Connection string used by the whole local stack:

```
postgresql://campusflow:campusflow@localhost:5432/campusflow?schema=public
```

**Native PostgreSQL 16+:**

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres psql <<'SQL'
CREATE ROLE campusflow LOGIN PASSWORD 'campusflow';
CREATE DATABASE campusflow OWNER campusflow;
GRANT ALL PRIVILEGES ON DATABASE campusflow TO campusflow;
SQL
```

---

## Apply the schema

```bash
npm run db:generate     # Prisma client → node_modules/.prisma
npm run db:push         # sync schema (no migration files; ideal for dev)
npm run db:seed         # deterministic demo dataset
npm run db:reset        # wipe + re-push + re-seed
```

Production uses versioned migrations instead:

```bash
npx prisma migrate dev --name init --schema apps/api/prisma/schema.prisma   # author one
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma            # apply in CI/CD
```

---

## Seeded dataset

Deterministic — the same seed reproduces the same demo every time (Mulberry32 PRNG,
seed `20260918`).

| Entity                | Count |
| --------------------- | ----- |
| Departments           | 6     |
| Faculty               | 12    |
| Courses               | 12    |
| Students              | 60    |
| Enrolments            | ~240  |
| Companies             | 10    |
| Job postings          | 14 (12 open) |
| Applications          | ~184  |
| Interviews & offers   | across all pipeline stages |
| Notifications         | per student/staff |
| AI interaction logs   | 40    |

Demo logins (password `Password@123`): `admin@` · `officer@` · `faculty@` ·
`demo.student@campusflow.dev` — all `@campusflow.dev`.

The seed deliberately spreads CGPA into cohorts (top performers, a mid band and an
at-risk tail) so eligibility filters, AI ranking and the attendance warnings all
have something meaningful to display.

---

## Handy queries

```bash
# interactive shell
docker compose exec postgres psql -U campusflow -d campusflow

# row counts per table
psql "$DATABASE_URL" -c "
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# placement rate by department
psql "$DATABASE_URL" -c "
  SELECT d.code,
         COUNT(s.id) AS students,
         COUNT(*) FILTER (WHERE s.placement_status = 'PLACED') AS placed,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.placement_status = 'PLACED') / COUNT(s.id), 1) AS pct
  FROM departments d
  JOIN students s ON s.department_id = d.id
  GROUP BY d.code ORDER BY pct DESC;"

# students below the 75% attendance requirement
psql "$DATABASE_URL" -c "
  SELECT u.name, ROUND(100.0 * COUNT(*) FILTER (WHERE ar.status IN ('PRESENT','LATE'))
        / COUNT(*), 1) AS pct
  FROM attendance_records ar
  JOIN students s ON s.id = ar.student_id
  JOIN users u ON u.id = s.user_id
  GROUP BY u.name HAVING 100.0 * COUNT(*) FILTER (WHERE ar.status IN ('PRESENT','LATE')) / COUNT(*) < 75
  ORDER BY pct;"
```

---

## Backup & restore

```bash
pg_dump "$DATABASE_URL" -Fc -f campusflow-$(date +%F).dump
pg_restore -d "$DATABASE_URL" --clean --if-exists campusflow-2026-09-18.dump
```

Schedule the dump for production and rehearse a restore before you need one.

---

## Troubleshooting

| Symptom                                    | Fix                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `P1001: Can't reach database server`       | Wrong host in `DATABASE_URL` — use `postgres`, not `localhost`, in Compose |
| `P1000: Authentication failed`             | Credentials do not match the `POSTGRES_*` values in Compose               |
| `role "campusflow" does not exist`         | Role was never created — run the `CREATE ROLE` block above                 |
| `database "campusflow" does not exist`     | `CREATE DATABASE campusflow OWNER campusflow;`                             |
| `Port 5432 is already in use`              | A local PostgreSQL is running — stop it or map `5433:5432`                 |
| Schema drift after pulling                   | `npm run db:push` (dev) or `npx prisma migrate deploy` (production)        |
| Seed fails on a non-empty database          | `npm run db:reset` — the seed truncates in FK-safe order first             |
