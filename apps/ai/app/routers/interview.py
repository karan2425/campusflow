from fastapi import APIRouter

from ..interview import generate_questions
from ..schemas import InterviewRequest, InterviewResponse

router = APIRouter(tags=["interview"])


@router.post("/interview/questions", response_model=InterviewResponse)
async def interview_questions(payload: InterviewRequest) -> InterviewResponse:
    """Role- and candidate-specific question bank for interview practice."""
    questions = await generate_questions(payload.student, payload.job, payload.count)
    return InterviewResponse(questions=questions)
