from fastapi import APIRouter

from .. import __version__
from ..config import settings
from ..schemas import HealthResponse
from ..vector_store import store

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        provider=store.provider,
        indexSize=store.size,
        geminiEnabled=settings.gemini_enabled,
        version=__version__,
    )


@router.get("/info")
async def info() -> dict:
    """Capability manifest — the API surfaces this in its AI status widget."""
    return {
        "version": __version__,
        "geminiEnabled": settings.gemini_enabled,
        "chatModel": settings.gemini_model if settings.gemini_enabled else "grounded-fallback",
        "embeddingProvider": store.provider,
        "indexSize": store.size,
        "embeddingDim": store.dim,
        "capabilities": [
            "semantic-candidate-matching",
            "hybrid-skill-scoring",
            "recruiter-shortlisting",
            "resume-ats-scoring",
            "resume-parsing",
            "interview-question-generation",
            "context-grounded-chat",
        ],
        "notes": (
            "Runs fully offline with deterministic fallbacks. Set GEMINI_API_KEY to enable "
            "Gemini-generated summaries, questions and chat prose."
        ),
    }
