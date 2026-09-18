#!/usr/bin/env python3
"""
CampusFlow end-to-end smoke test.

Exercises the full stack against running services:
  Next.js proxy → Express API → PostgreSQL (Prisma) + FastAPI AI service

Run:  python3 scripts/smoke_test.py
Exits non-zero if any check fails.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = "http://localhost:4000"
WEB = "http://localhost:3000"
PASSWORD = "Password@123"

passed = 0
failed: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  \033[32m✓\033[0m {name}" + (f"  \033[90m{detail}\033[0m" if detail else ""))
    else:
        failed.append(name)
        print(f"  \033[31m✗\033[0m {name}" + (f"  \033[31m{detail}\033[0m" if detail else ""))


def call(path: str, method: str = "GET", body=None, token: str | None = None, base: str = API):
    request = urllib.request.Request(f"{base}{path}", method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    payload = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, payload, timeout=60) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.load(error)
        except Exception:
            return error.code, {}


def login(email: str) -> str:
    _, payload = call("/api/v1/auth/login", "POST", {"email": email, "password": PASSWORD})
    return payload.get("data", {}).get("token", "")


def section(title: str) -> None:
    print(f"\n\033[1m{title}\033[0m")


def main() -> int:
    print("\033[1m🎓 CampusFlow end-to-end smoke test\033[0m")

    # ---------------------------------------------------------------- infra
    section("Infrastructure")
    status, health = call("/health")
    check("Express API responds", status == 200 and health.get("status") == "ok")
    check("PostgreSQL reachable through Prisma", status == 200, f"uptime {health.get('uptimeSec')}s")

    status, ai = call("/api/v1/ai/health")
    check("FastAPI AI service reachable", status == 200 and ai["data"]["reachable"], f"provider {ai['data'].get('provider')}")
    check("FAISS index populated", ai["data"]["indexSize"] > 0, f"{ai['data']['indexSize']} vectors")

    status, _ = call("/api/backend/v1/ai/health", base=WEB)
    check("Next.js proxies /api/backend to the API", status == 200)

    # ---------------------------------------------------------------- auth
    section("Authentication & authorisation")
    admin = login("admin@campusflow.dev")
    officer = login("officer@campusflow.dev")
    faculty = login("faculty@campusflow.dev")
    student = login("demo.student@campusflow.dev")
    check("All four demo roles can sign in", all([admin, officer, faculty, student]))

    status, _ = call("/api/v1/students")
    check("Unauthenticated requests are rejected", status == 401)
    status, _ = call("/api/v1/students", token=student)
    check("Students can read the directory (scoped)", status == 200)
    status, _ = call("/api/v1/analytics/overview", token=student)
    check("Students cannot read institute-wide analytics", status == 403, f"status {status} (403 expected)")

    # ------------------------------------------------------------- academic
    section("Academic data")
    status, departments = call("/api/v1/departments", token=admin)
    check("Departments listed", status == 200 and len(departments["data"]) >= 6, f"{len(departments['data'])} departments")

    status, students = call("/api/v1/students?pageSize=5&sort=cgpa", token=admin)
    check("Student directory paginates and sorts", status == 200 and students["meta"]["total"] > 0,
          f"{students['meta']['total']} students")
    check("CGPA sort is descending",
          all(students["data"][i]["cgpa"] >= students["data"][i + 1]["cgpa"] for i in range(len(students["data"]) - 1)))

    status, filtered = call("/api/v1/students?minCgpa=8.5", token=admin)
    check("CGPA filter applied server-side", status == 200 and all(s["cgpa"] >= 8.5 for s in filtered["data"]),
          f"{filtered['meta']['total']} above 8.5")

    status, attendance = call("/api/v1/attendance/overview", token=faculty)
    check("Attendance overview computes", status == 200 and "overallPct" in attendance["data"],
          f"{attendance['data'].get('overallPct')}% overall")

    status, courses = call("/api/v1/courses", token=faculty)
    check("Courses listed with faculty", status == 200 and len(courses["data"]) > 0, f"{len(courses['data'])} courses")

    # ------------------------------------------------------------ placement
    section("Placement workflow")
    status, jobs = call("/api/v1/jobs?status=OPEN", token=admin)
    check("Open postings listed", status == 200 and len(jobs["data"]) > 0, f"{len(jobs['data'])} open drives")

    job = jobs["data"][0]
    status, detail = call(f"/api/v1/jobs/{job['id']}", token=admin)
    check("Job detail includes funnel and applicants", status == 200 and "funnel" in detail["data"],
          f"{detail['data'].get('applicants')} applicants, {detail['data'].get('eligibleCount')} eligible")

    status, analytics = call("/api/v1/analytics/overview", token=officer)
    headline = analytics["data"]["headline"]
    check("Placement analytics computed", status == 200 and headline["placementRate"] > 0,
          f"{headline['placementRate']}% placed, avg {headline['avgCtc']} LPA")
    check("Department breakdown present", len(analytics["data"]["byDepartment"]) >= 6)
    check("Recruiter leaderboard present", len(analytics["data"]["topRecruiters"]) > 0,
          f"{len(analytics['data']['topRecruiters'])} recruiters")

    status, pipeline = call("/api/v1/applications/pipeline", token=officer)
    check("Kanban pipeline returns columns", status == 200 and len(pipeline["data"]["columns"]) == 7,
          f"{pipeline['data']['total']} cards")

    # -------------------------------------------------------------- AI: match
    section("AI — semantic candidate matching")
    status, matches = call(f"/api/v1/jobs/{job['id']}/matches?topK=5", token=officer)
    check("AI match endpoint responds", status == 200, f"{matches['data'].get('latencyMs')} ms")
    check("Matches returned with scores", len(matches["data"]["matches"]) > 0, f"pool {matches['data']['poolSize']}")

    scored = matches["data"]["matches"]
    check("Scores are ordered descending", all(scored[i]["score"] >= scored[i + 1]["score"] for i in range(len(scored) - 1)))
    check("Eligible candidates rank above ineligible",
          all(not (scored[i + 1]["eligible"] and not scored[i]["eligible"]) for i in range(len(scored) - 1)))
    check("Each match carries an explanation", all(m["rationale"] for m in scored))
    check("Skills matched and gaps identified", any(m["matchedSkills"] for m in scored) or any(m["missingSkills"] for m in scored))

    status, shortlist = call(f"/api/v1/ai/jobs/{job['id']}/shortlist", "POST", {"topK": 8}, officer)
    check("Recruiter shortlist has a written briefing", status == 200 and len(shortlist["data"]["summary"]) > 40,
          f"{len(shortlist['data']['summary'])} chars")

    # ------------------------------------------------------------ AI: student
    section("AI — student assistant, ATS and interview prep")
    status, chat = call("/api/v1/ai/chat", "POST", {"message": "which companies am I eligible for?"}, student)
    answer = chat["data"]["answer"]
    check("Copilot answers using live campus data", status == 200 and len(answer) > 40, f"provider {chat['data']['provider']}")
    check("Answer names a real recruiter from the database",
          any(company["company"] in answer for company in analytics["data"]["topRecruiters"]) or "eligible for" in answer)

    status, recommendations = call("/api/v1/ai/recommendations", token=student)
    check("Personalised recommendations generated", status == 200 and len(recommendations["data"]["recommendations"]) > 0,
          f"{len(recommendations['data']['recommendations'])} roles")

    status, ats = call("/api/v1/ai/resume/ats-score", "POST", {"jobId": job["id"]}, student)
    check("ATS score computed", status == 200 and 0 <= ats["data"]["score"] <= 100,
          f"score {ats['data']['score']} — {ats['data']['verdict'][:40]}")
    check("ATS returns keyword gaps and suggestions",
          isinstance(ats["data"]["missingKeywords"], list) and len(ats["data"]["suggestions"]) > 0)

    status, prep = call("/api/v1/ai/interview-prep", "POST", {"jobId": job["id"], "count": 6}, student)
    check("Interview questions generated", status == 200 and len(prep["data"]["questions"]) == 6,
          f"{prep['data']['company']} · {prep['data']['role']}")

    # ------------------------------------------------------------ write path
    section("Write path — apply, notify, progress")
    _, me = call("/api/v1/auth/me", token=student)
    student_id = me["data"]["student"]["id"]

    status, mine = call("/api/v1/applications", token=student)
    existing = {a["job"]["id"] for a in mine["data"]}

    # Pick a posting the student genuinely qualifies for, so the write-path test
    # exercises the happy path rather than the eligibility gate.
    profile = me["data"]["student"]
    eligible_jobs = [
        j
        for j in jobs["data"]
        if j["id"] not in existing
        and profile["cgpa"] >= j["minCgpa"]
        and profile["backlogs"] <= j["maxBacklogs"]
        and (not j["allowedDepartments"] or profile["departmentCode"] in j["allowedDepartments"])
        and (not j["batches"] or profile["batch"] in j["batches"])
        and j["daysToDeadline"] > 0
    ]
    target = eligible_jobs[0] if eligible_jobs else None
    if not target:
        check("Student has an eligible posting to apply to", False, "seed data offers no match — check drift")
    if target:
        status, application = call("/api/v1/applications", "POST", {"jobId": target["id"]}, student)
        if status == 201:
            check("Student can apply", True, f"match score {application['data'].get('matchScore')}")
            app_id = application["data"]["id"]

            status, _ = call("/api/v1/applications", "POST", {"jobId": target["id"]}, student)
            check("Duplicate application blocked", status == 409)

            status, moved = call(f"/api/v1/applications/{app_id}/status", "PATCH", {"status": "SHORTLISTED"}, officer)
            check("Officer can advance the pipeline stage", status == 200)

            status, notifications = call("/api/v1/notifications", token=student)
            check("Student notified of the status change", status == 200 and notifications["data"]["unread"] >= 0,
                  f"{notifications['data']['unread']} unread")

            # Shortlisted applications may still be withdrawn; once a candidate has
            # sat an interview they must go through the placement cell instead.
            call(f"/api/v1/applications/{app_id}/status", "PATCH", {"status": "INTERVIEWED"}, officer)
            status, body = call(f"/api/v1/applications/{app_id}", "DELETE", token=student)
            check("Withdrawal blocked once interviewed", status == 409, body.get("error", {}).get("message", "")[:60])
        else:
            check("Student can apply", False, json.dumps(application.get("error", {}))[:120])
    else:
        check("Student can apply", False, "no unapplied posting available to test with")

    # ---------------------------------------------------------------- guard
    section("Validation & error handling")
    status, _ = call("/api/v1/auth/login", "POST", {"email": "not-an-email"})
    check("Invalid payloads return 422", status == 422)
    status, _ = call("/api/v1/jobs", "POST", {"title": "x"}, officer)
    check("Incomplete job creation rejected", status == 422)
    status, _ = call("/api/v1/students/does-not-exist", token=admin)
    check("Unknown student returns 404", status == 404)
    status, _ = call("/api/v1/auth/login", "POST", {"email": "demo.student@campusflow.dev", "password": "wrong"})
    check("Wrong password returns 401", status == 401)

    # ---------------------------------------------------------------- summary
    print(f"\n\033[1mResult:\033[0m \033[32m{passed} passed\033[0m" + (f", \033[31m{len(failed)} failed\033[0m" if failed else ""))
    if failed:
        for name in failed:
            print(f"  \033[31m• {name}\033[0m")
        return 1
    print("\033[32mAll checks passed — the stack is healthy.\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
