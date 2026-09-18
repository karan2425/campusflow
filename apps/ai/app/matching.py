"""
Hybrid candidate↔role scoring.

Final score = weighted blend of
  • semantic similarity   (FAISS cosine, calibrated)        — 35%
  • skill overlap         (normalised, synonym-aware)       — 50%
  • academic/activity fit (CGPA, backlogs, coding signals)  — 15%

Skill overlap carries the most weight because it is the most directly
verifiable signal: either the candidate has listed the technology the JD asks
for, or they have not. Semantic similarity catches the things a skill list
misses (project descriptions, domain language).

Eligibility is evaluated separately and *hard-gates* a candidate: an
ineligible student is always ranked below an eligible one, no matter how
strong the textual similarity. This mirrors how a placement cell actually
works and keeps the AI explainable.
"""
from __future__ import annotations

import re

from .embeddings import calibrate_similarity
from .schemas import JobProfile, MatchResult, StudentProfile

# Canonical names for skills that appear in many spellings on resumes.
SYNONYMS: dict[str, str] = {
    "node": "node.js", "nodejs": "node.js", "node js": "node.js",
    "reactjs": "react", "react.js": "react",
    "nextjs": "next.js", "nextjs13": "next.js",
    "js": "javascript", "ts": "typescript",
    "postgres": "postgresql", "psql": "postgresql", "postgressql": "postgresql",
    "mongo": "mongodb", "mongo db": "mongodb",
    "dsa": "data structures", "data structures and algorithms": "data structures",
    "algorithms": "data structures", "problem solving": "data structures",
    "ml": "machine learning", "dl": "deep learning",
    "cv": "computer vision", "nlp": "natural language processing",
    "aws": "aws", "amazon web services": "aws",
    "gcp": "google cloud", "k8s": "kubernetes",
    "rest": "rest apis", "restapi": "rest apis", "restful": "rest apis",
    "api": "rest apis", "apis": "rest apis",
    "cpp": "c++", "c plus plus": "c++",
    "c#": "csharp", "c sharp": "csharp",
    "sklearn": "scikit-learn", "scikit learn": "scikit-learn",
    "pytorch": "pytorch", "torch": "pytorch",
    "tf": "tensorflow",
    "html5": "html", "css3": "css",
    "sql": "sql", "mysql": "sql", "sqlite": "sql", "plsql": "sql",
    "solid works": "solidworks",
    "autocad": "autocad", "auto cad": "autocad",
    "embedded c": "embedded c", "embedded systems": "embedded c",
    "rtos": "rtos", "freertos": "rtos",
    "vlsi": "vlsi", "verilog": "verilog",
    "communication": "communication", "leadership": "leadership",
    "git": "git", "github": "git", "version control": "git",
}

FUZZY_THRESHOLD = 0.84


def canonical(skill: str) -> str:
    s = re.sub(r"\s+", " ", (skill or "").strip().lower())
    return SYNONYMS.get(s, s)


def _tokens(skill: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]+", canonical(skill)))


def _similar(a: str, b: str) -> bool:
    """Exact canonical match, containment, or high character-level overlap."""
    ca, cb = canonical(a), canonical(b)
    if not ca or not cb:
        return False
    if ca == cb:
        return True

    ta, tb = _tokens(ca), _tokens(cb)
    if ta and tb and (ta <= tb or tb <= ta):
        return True

    # Dice coefficient over character bigrams — catches typos and word-order noise.
    def bigrams(s: str) -> set[str]:
        return {s[i:i + 2] for i in range(len(s) - 1)} or {s}

    ba, bb = bigrams(ca), bigrams(cb)
    overlap = len(ba & bb)
    dice = (2 * overlap) / (len(ba) + len(bb)) if (ba or bb) else 0.0
    return dice >= FUZZY_THRESHOLD


def skill_overlap(job_skills: list[str], student_skills: list[str]) -> tuple[float, list[str], list[str]]:
    """Returns (score in [0,1], matched job skills, missing job skills)."""
    if not job_skills:
        return 0.65, [], []  # no stated requirements → neutral-positive prior

    matched, missing = [], []
    for required in job_skills:
        (matched if any(_similar(required, owned) for owned in student_skills) else missing).append(required)

    coverage = len(matched) / len(job_skills)
    # Bonus for breadth beyond the JD (a student who also knows adjacent tech).
    extra = len(student_skills) - len(matched)
    breadth = min(0.15, max(0.0, extra) * 0.01)
    return min(1.0, coverage + breadth), matched, missing


def academic_fit(student: StudentProfile, job: JobProfile) -> float:
    """0..1 signal from academics and verifiable activity."""
    cgpa_component = max(0.0, min(1.0, student.cgpa / 10))
    if job.minCgpa > 0:
        # Relative performance against the cut-off: clearing it comfortably matters.
        headroom = (student.cgpa - job.minCgpa) / max(1.0, 10 - job.minCgpa)
        cgpa_component = 0.5 * cgpa_component + 0.5 * max(0.0, min(1.0, 0.4 + headroom))

    penalty = 0.0
    if student.backlogs:
        allowance = max(1, job.maxBacklogs)
        penalty += min(0.35, 0.18 * (student.backlogs / allowance))

    activity = 0.0
    signals = 0
    if student.codingScore:
        activity += min(1.0, student.codingScore / 800)
        signals += 1
    if student.githubScore:
        activity += min(1.0, student.githubScore / 700)
        signals += 1
    if student.resumeText:
        activity += 0.7
        signals += 1
    activity = (activity / signals) if signals else 0.45

    return max(0.0, min(1.0, 0.62 * cgpa_component + 0.38 * activity - penalty))


def evaluate_eligibility(student: StudentProfile, job: JobProfile) -> tuple[bool, list[str]]:
    blockers: list[str] = []
    if student.cgpa < job.minCgpa:
        blockers.append(f"CGPA {student.cgpa:.2f} below cut-off {job.minCgpa:.2f}")
    if student.backlogs > job.maxBacklogs:
        blockers.append(f"{student.backlogs} backlog(s) exceeds limit of {job.maxBacklogs}")
    if job.allowedDepartments and student.department not in job.allowedDepartments:
        blockers.append(f"Role restricted to {', '.join(job.allowedDepartments)}")
    if job.batches and student.batch not in job.batches:
        blockers.append(f"Open to batch {', '.join(map(str, job.batches))}")
    if student.placementStatus in {"NOT_ELIGIBLE", "OPTED_OUT"}:
        blockers.append(f"Placement status is {student.placementStatus.replace('_', ' ').title()}")
    return (len(blockers) == 0), blockers


def _rationale(
    student: StudentProfile,
    job: JobProfile,
    score: float,
    semantic: float,
    matched: list[str],
    missing: list[str],
    eligible: bool,
    blockers: list[str],
) -> str:
    if not eligible:
        return f"Not eligible: {'; '.join(blockers)}."

    if score >= 85:
        headline = "Exceptional fit"
    elif score >= 72:
        headline = "Strong fit"
    elif score >= 58:
        headline = "Moderate fit"
    else:
        headline = "Weak fit"

    chunks = [f"{headline} ({score:.0f}/100)."]
    if matched:
        chunks.append(f"Matches {len(matched)}/{len(job.skills)} required skills incl. {', '.join(matched[:4])}.")
    if missing:
        chunks.append(f"Gaps: {', '.join(missing[:3])}.")
    chunks.append(
        f"CGPA {student.cgpa:.2f} vs cut-off {job.minCgpa:.2f}; "
        f"semantic profile similarity {semantic * 100:.0f}%."
    )
    if student.codingScore and student.codingScore > 600:
        chunks.append(f"Strong coding signal ({student.codingScore}).")
    if student.placementStatus == "PLACED":
        chunks.append("Already placed — releases only if institute policy allows a second offer.")
    return " ".join(chunks)


def score_pair(student: StudentProfile, job: JobProfile, semantic: float) -> MatchResult:
    skill_score, matched, missing = skill_overlap(job.skills, student.skills)
    fit = academic_fit(student, job)
    eligible, blockers = evaluate_eligibility(student, job)

    # Accept either a raw cosine or an already-calibrated value in [0, 1].
    semantic = calibrate_similarity(semantic) if semantic > 0 else semantic

    raw = 100 * (0.35 * semantic + 0.50 * skill_score + 0.15 * fit)
    if not eligible:
        raw = min(raw * 0.55, 45.0)  # ranked below every eligible candidate

    score = round(max(0.0, min(100.0, raw)), 1)
    return MatchResult(
        id=student.studentId,
        name=student.name,
        score=score,
        semanticScore=round(semantic * 100, 1),
        skillScore=round(skill_score * 100, 1),
        matchedSkills=matched,
        missingSkills=missing,
        rationale=_rationale(student, job, score, semantic, matched, missing, eligible, blockers),
        eligible=eligible,
        blockers=blockers,
    )


def rank_students_for_job(
    job: JobProfile,
    students: list[StudentProfile],
    similarities: dict[str, float],
    top_k: int = 10,
) -> list[MatchResult]:
    results = [score_pair(s, job, similarities.get(s.studentId, 0.0)) for s in students]
    results.sort(key=lambda r: (r.eligible, r.score), reverse=True)
    return results[:top_k]


def rank_jobs_for_student(
    student: StudentProfile,
    jobs: list[JobProfile],
    similarities: dict[str, float],
    top_k: int = 10,
) -> list[MatchResult]:
    results: list[MatchResult] = []
    for job in jobs:
        result = score_pair(student, job, similarities.get(job.jobId, 0.0))
        # Re-label with the job so the caller can map back.
        result.id = job.jobId
        result.name = f"{job.title} @ {job.companyName}"
        results.append(result)
    results.sort(key=lambda r: (r.eligible, r.score), reverse=True)
    return results[:top_k]
