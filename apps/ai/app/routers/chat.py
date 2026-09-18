import time

from fastapi import APIRouter

from ..llm import SYSTEM_PROMPT, _format_context, fallback_chat, generate
from ..schemas import ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    """
    Role-aware campus copilot.

    The Node API sends live database context (the student's own record, or the
    placement cell's aggregates). Gemini answers against that context; without a
    key a grounded rule engine answers from the same facts.
    """
    started = time.perf_counter()

    history_text = "\n".join(
        f"{'User' if m.get('role') == 'user' else 'Assistant'}: {str(m.get('content'))[:500]}"
        for m in (payload.history or [])[-6:]
    )

    prompt = (
        f"CAMPUS CONTEXT:\n{_format_context(payload.context)}\n\n"
        + (f"CONVERSATION SO FAR:\n{history_text}\n\n" if history_text else "")
        + f"QUESTION: {payload.message}"
    )

    answer = await generate(prompt, system=SYSTEM_PROMPT, temperature=0.4)
    provider = "gemini"

    if not answer:
        answer, actions = fallback_chat(payload.message, payload.context)
        provider = "grounded-fallback"
    else:
        actions = _suggest_actions(payload)

    return ChatResponse(
        answer=answer,
        provider=provider,
        suggestedActions=actions,
        latencyMs=int((time.perf_counter() - started) * 1000),
    )


def _suggest_actions(payload: ChatRequest) -> list[str]:
    """Context-derived quick actions — never generic filler."""
    role = payload.context.get("role", "STUDENT")
    if role == "STUDENT":
        return ["Eligible openings", "My applications", "Improve my profile", "Interview prep"]
    return ["Open Analytics", "Open Placements", "Upcoming interviews", "Top recruiters"]
