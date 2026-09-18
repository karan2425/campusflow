"""
AI service tests.

These run with no Gemini key on purpose — they verify the deterministic
fallback path, which is what a fresh clone experiences by default.
Run: pytest -q  (from apps/ai)
"""
from fastapi.testclient import TestClient

from app.main import app
from app.resume import ats_score_sync, parse_resume_sync
from app.matching import evaluate_eligibility, skill_overlap
from app.schemas import JobProfile, StudentProfile

client = TestClient(app)

STUDENT = {
    "studentId": "s1",
    "name": "Aarav Sharma",
    "rollNo": "2026CSE001",
    "department": "CSE",
    "batch": 2026,
    "cgpa": 8.74,
    "backlogs": 0,
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker", "Python"],
    "resumeText": (
        "Aarav Sharma. Email aarav@example.com, phone +91 9876543210. "
        "B.Tech CSE, CGPA 8.74. Skills: React, Node.js, TypeScript, PostgreSQL, Docker, Python. "
        "Projects: built a booking platform reducing query latency by 40%; handled 10k requests per minute. "
        "Experience: software engineering internship, wrote unit tests raising coverage to 85%. "
        "Achievements: solved 500+ DSA problems, hackathon finalist."
    ),
    "about": "Final-year CSE student focused on full-stack engineering.",
    "placementStatus": "ELIGIBLE",
    "codingScore": 720,
    "githubScore": 540,
}

JOB = {
    "jobId": "j1",
    "companyName": "Cognito Software",
    "title": "Full Stack Developer",
    "description": "Build React and Node.js features with PostgreSQL and Docker. REST APIs, testing and CI/CD.",
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"],
    "minCgpa": 7.0,
    "maxBacklogs": 0,
    "allowedDepartments": ["CSE", "IT"],
    "batches": [2026],
    "location": "Noida",
    "ctcMax": 13,
}


def test_health():
    response = client.get("/ai/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["geminiEnabled"] is False


def test_root_and_info():
    assert client.get("/").status_code == 200
    info = client.get("/ai/info").json()
    assert "semantic-candidate-matching" in info["capabilities"]


def test_index_and_match_students():
    students = [STUDENT] + [
        {
            **STUDENT,
            "studentId": f"s{i}",
            "name": f"Student {i}",
            "cgpa": 6.0 + i * 0.3,
            "department": "ME" if i % 3 == 0 else "CSE",
            "skills": ["SolidWorks", "ANSYS"] if i % 3 == 0 else ["Java", "SQL"],
        }
        for i in range(2, 14)
    ]

    indexed = client.post("/ai/index/students", json={"students": students}).json()
    assert indexed["indexed"] == len(students)
    assert indexed["provider"] in {"gemini", "local-hashing"}

    response = client.post(
        "/ai/match/students-for-job",
        json={"job": JOB, "students": students, "top_k": 5},
    )
    assert response.status_code == 200
    matches = response.json()["matches"]
    assert len(matches) == 5
    # The strong full-stack candidate must come out on top.
    assert matches[0]["id"] == "s1"
    assert 0 <= matches[0]["score"] <= 100
    # Eligibility gating: ineligible candidates rank below eligible ones.
    assert matches[0]["eligible"] is True
    scores = [m["score"] for m in matches]
    assert scores == sorted(scores, reverse=True)


def test_match_jobs_for_student():
    jobs = [JOB, {**JOB, "jobId": "j2", "title": "Design Engineer", "skills": ["SolidWorks", "ANSYS"],
                  "allowedDepartments": ["ME"], "description": "Mechanical design role using SolidWorks."}]
    response = client.post("/ai/match/jobs-for-student", json={"student": STUDENT, "jobs": jobs, "top_k": 5})
    assert response.status_code == 200
    matches = response.json()["matches"]
    assert matches[0]["id"] == "j1"  # software role beats mechanical for a software student


def test_shortlist_returns_summary():
    response = client.post("/ai/shortlist", json={"job": JOB, "students": [STUDENT], "top_k": 3})
    body = response.json()
    assert body["shortlist"]
    assert "Aarav" in body["summary"]


def test_ats_scoring_rewards_alignment():
    good = client.post("/ai/resume/ats-score", json={"resume_text": STUDENT["resumeText"], "job": JOB}).json()
    weak = client.post(
        "/ai/resume/ats-score",
        json={"resume_text": "I am a student. " * 30, "job": JOB},
    ).json()

    assert 0 <= weak["score"] < good["score"] <= 100
    assert "React" in good["matchedKeywords"] or "react" in [k.lower() for k in good["matchedKeywords"]]
    assert good["sectionChecks"]
    assert good["verdict"]


def test_resume_parse_extracts_skills():
    parsed = parse_resume_sync(STUDENT["resumeText"])
    lowered = [s.lower() for s in parsed.skills]
    assert "react" in lowered and "docker" in lowered
    assert parsed.summary


def test_interview_questions_are_role_specific():
    response = client.post("/ai/interview/questions", json={"student": STUDENT, "job": JOB, "count": 6})
    assert response.status_code == 200
    questions = response.json()["questions"]
    assert len(questions) == 6
    assert all(q["question"] for q in questions)
    assert any("Cognito" in q["question"] for q in questions)


def test_chat_grounded_fallback_uses_context():
    context = {
        "role": "STUDENT",
        "userName": "Aarav",
        "student": {
            "name": "Aarav",
            "cgpa": 8.74,
            "backlogs": 0,
            "skills": ["React", "Node.js"],
            "placementStatus": "ELIGIBLE",
            "attendancePct": 88.5,
            "hasResume": True,
            "eligibleOpenings": [
                {"company": "Cognito Software", "title": "Full Stack Developer", "ctcMax": 13, "deadline": "2026-10-01", "skills": ["React"]}
            ],
            "applications": [{"company": "Cognito Software", "role": "Full Stack Developer", "status": "SHORTLISTED", "nextInterview": None}],
            "offers": [],
        },
    }
    response = client.post("/ai/chat", json={"message": "which companies am I eligible for?", "context": context})
    body = response.json()

    assert body["provider"] == "grounded-fallback"
    assert "Cognito Software" in body["answer"]  # real context, not generic filler
    assert body["suggestedActions"]


def test_chat_handles_officer_context():
    context = {
        "role": "PLACEMENT_OFFICER",
        "userName": "Sanjay",
        "placementCell": {
            "totalStudents": 60,
            "placed": 37,
            "placementRate": 61.7,
            "activeOpenings": 12,
            "avgCtc": 10.8,
            "highestCtc": 24.5,
            "topRecruiters": [{"company": "Brightwave Technologies", "offers": 9}],
            "upcomingInterviews": [],
        },
    }
    response = client.post("/ai/chat", json={"message": "how many students are placed?", "context": context})
    assert "61.7" in response.json()["answer"]


def test_eligibility_gate_blocks_low_cgpa():
    student = StudentProfile(**{**STUDENT, "cgpa": 5.5})
    job = JobProfile(**JOB)
    eligible, blockers = evaluate_eligibility(student, job)
    assert eligible is False
    assert any("CGPA" in b for b in blockers)


def test_skill_overlap_is_synonym_aware():
    score, matched, missing = skill_overlap(["Node.js", "PostgreSQL", "DSA"], ["nodejs", "postgres", "Data Structures"])
    assert score > 0.95
    assert len(missing) == 0


def test_validation_errors_are_clear():
    assert client.post("/ai/resume/parse", json={"resume_text": "too short"}).status_code == 400
    assert client.post("/ai/resume/ats-score", json={"resume_text": "too short"}).status_code == 400


def test_index_clear():
    assert client.delete("/ai/index/students").json()["cleared"] is True
