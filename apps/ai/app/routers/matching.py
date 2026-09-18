from fastapi import APIRouter, HTTPException

from ..embeddings import embed_texts
from ..interview import shortlist_summary
from ..matching import rank_jobs_for_student, rank_students_for_job
from ..schemas import (
    IndexRequest,
    IndexResponse,
    MatchJobsRequest,
    MatchJobsResponse,
    MatchStudentsRequest,
    MatchStudentsResponse,
    ShortlistRequest,
    ShortlistResponse,
)
from ..vector_store import store

router = APIRouter(tags=["matching"])


@router.post("/index/students", response_model=IndexResponse)
async def index_students(payload: IndexRequest) -> IndexResponse:
    """Rebuilds the FAISS index from the full candidate pool (idempotent)."""
    indexed, dim, provider = store.build(payload.students)
    return IndexResponse(indexed=indexed, dimension=dim, provider=provider)


@router.delete("/index/students")
async def clear_index() -> dict:
    store.clear()
    return {"cleared": True, "indexSize": store.size}


@router.post("/match/students-for-job", response_model=MatchStudentsResponse)
async def match_students_for_job(payload: MatchStudentsRequest) -> MatchStudentsResponse:
    """
    Ranks candidates for a role.

    Uses the FAISS index when the candidate is present in it (fast path for a
    synced pool), otherwise embeds on the fly so the endpoint is still correct
    when called with a fresh, unindexed list.
    """
    job, students = payload.job, payload.students
    if not students:
        return MatchStudentsResponse(matches=[], provider=store.provider, indexSize=store.size)

    similarities: dict[str, float] = {}

    indexed_ids = {s.studentId for s in store.students}
    request_ids = {s.studentId for s in students}
    use_index = bool(store.size) and request_ids.issubset(indexed_ids)

    if use_index:
        hits = store.search(job.profile_text(), top_k=store.size)
        similarities = {student.studentId: score for student, score in hits}
    else:
        matrix, _provider = embed_texts([s.profile_text() for s in students] + [job.profile_text()])
        job_vec = matrix[-1]
        for i, student in enumerate(students):
            denom = float((matrix[i] @ matrix[i]) ** 0.5) * float((job_vec @ job_vec) ** 0.5)
            similarities[student.studentId] = float(matrix[i] @ job_vec / denom) if denom else 0.0

    matches = rank_students_for_job(job, students, similarities, payload.top_k)
    return MatchStudentsResponse(matches=matches, provider=store.provider, indexSize=store.size)


@router.post("/match/jobs-for-student", response_model=MatchJobsResponse)
async def match_jobs_for_student(payload: MatchJobsRequest) -> MatchJobsResponse:
    """Ranks open roles for one student — powers the recommendation feed."""
    student, jobs = payload.student, payload.jobs
    if not jobs:
        return MatchJobsResponse(matches=[], provider=store.provider)

    matrix, _provider = embed_texts([j.profile_text() for j in jobs] + [student.profile_text()])
    student_vec = matrix[-1]

    similarities: dict[str, float] = {}
    for i, job in enumerate(jobs):
        denom = float((matrix[i] @ matrix[i]) ** 0.5) * float((student_vec @ student_vec) ** 0.5)
        similarities[job.jobId] = float(matrix[i] @ student_vec / denom) if denom else 0.0

    matches = rank_jobs_for_student(student, jobs, similarities, payload.top_k)
    return MatchJobsResponse(matches=matches, provider=store.provider)


@router.post("/shortlist", response_model=ShortlistResponse)
async def shortlist(payload: ShortlistRequest) -> ShortlistResponse:
    """Full recruiter pack: ranked shortlist plus a written summary."""
    job, students = payload.job, payload.students
    if not students:
        raise HTTPException(status_code=400, detail="Candidate pool is empty")

    matrix, provider = embed_texts([s.profile_text() for s in students] + [job.profile_text()])
    job_vec = matrix[-1]

    similarities: dict[str, float] = {}
    for i, student in enumerate(students):
        denom = float((matrix[i] @ matrix[i]) ** 0.5) * float((job_vec @ job_vec) ** 0.5)
        similarities[student.studentId] = float(matrix[i] @ job_vec / denom) if denom else 0.0

    results = rank_students_for_job(job, students, similarities, payload.top_k)

    # Prefer a Gemini narrative; always fall back to the deterministic summary.
    summary = shortlist_summary(job, results, len(students))
    from ..llm import generate  # local import keeps module import order simple

    prompt = (
        f"Write a 3-sentence recruiter briefing for this shortlist. Use only these facts.\n\n"
        f"ROLE: {job.title} at {job.companyName}\nPool size: {len(students)}\n"
        + "\n".join(
            f"{i + 1}. {m.name} — score {m.score}/100, matched: {', '.join(m.matchedSkills[:4]) or 'n/a'}, "
            f"gaps: {', '.join(m.missingSkills[:3]) or 'none'}"
            for i, m in enumerate(results[:8])
        )
        + f"\n\nStatistical summary to stay consistent with: {summary}"
    )
    generated = await generate(prompt, temperature=0.4)
    if generated:
        summary = generated

    return ShortlistResponse(shortlist=results, summary=summary, provider=provider)
