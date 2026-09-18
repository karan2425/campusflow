from fastapi import APIRouter, HTTPException

from ..resume import ats_score, parse_resume
from ..schemas import AtsRequest, AtsResponse, ParseRequest, ParseResponse

router = APIRouter(prefix="/resume", tags=["resume"])


@router.post("/ats-score", response_model=AtsResponse)
async def resume_ats_score(payload: AtsRequest) -> AtsResponse:
    """ATS-style scoring of a resume against a job description."""
    if not payload.resume_text or len(payload.resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Resume text is too short to score")
    return await ats_score(payload.resume_text, payload.job)


@router.post("/parse", response_model=ParseResponse)
async def resume_parse(payload: ParseRequest) -> ParseResponse:
    """Structured extraction of skills, education, projects and experience."""
    if not payload.resume_text or len(payload.resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Resume text is too short to parse")
    return await parse_resume(payload.resume_text)
