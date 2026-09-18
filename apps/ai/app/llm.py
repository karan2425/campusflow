"""
Gemini access layer.

Every function has a **deterministic, context-grounded fallback**. That means
the microservice is fully functional with no API key — the assistant answers
questions about *this* campus by computing against the context the API sends,
rather than emitting generic filler. When a key is present, Gemini upgrades
the prose quality on top of the same facts.
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import settings

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_PROMPT = """You are CampusFlow Copilot, the assistant inside a college's placement and academic management platform.

Rules:
- Answer using ONLY the CAMPUS CONTEXT provided. It is live data from the institute's database.
- Never invent company names, CGPA cut-offs, dates, deadlines or statistics that are not in the context.
- If the context does not contain the answer, say so plainly and tell the user exactly which page of the platform will have it.
- Be concise and practical: 2-5 short sentences or a tight bullet list. No preamble.
- Address the user by name when you know it.
- When you reference a specific opening, include the company, role and CTC if present.
"""


def _format_context(context: dict[str, Any]) -> str:
    if not context:
        return "(no context supplied)"
    return json.dumps(context, indent=2, default=str)[:12000]


async def generate(prompt: str, system: str = SYSTEM_PROMPT, temperature: float = 0.4) -> str | None:
    """Calls Gemini. Returns None when disabled or on any failure."""
    if not settings.gemini_enabled:
        return None

    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 1024,
            "topP": 0.95,
        },
    }

    url = GEMINI_ENDPOINT.format(model=settings.gemini_model)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                url,
                params={"key": settings.gemini_api_key},
                json=payload,
                headers={"content-type": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts).strip()
            return text or None
    except Exception as exc:  # noqa: BLE001 — degrade to deterministic answers
        print(f"[llm] Gemini call failed ({exc}); using grounded fallback")
        return None


def _fmt_date(value: Any) -> str:
    return str(value)[:10] if value else ""


def fallback_chat(message: str, context: dict[str, Any]) -> tuple[str, list[str]]:
    """
    Context-grounded rule engine. Handles the questions students and placement
    officers actually ask, using only data the API supplied.
    """
    text = (message or "").lower()
    role = context.get("role", "STUDENT")
    name = context.get("userName", "there")
    student = context.get("student") or {}
    cell = context.get("placementCell") or {}
    actions: list[str] = []

    def has(*words: str) -> bool:
        return any(w in text for w in words)

    # ---------------------------------------------------------------- student
    if role == "STUDENT" and student:
        openings = student.get("eligibleOpenings", []) or []
        apps = student.get("applications", []) or []
        offers = student.get("offers", []) or []
        skills = student.get("skills", []) or []

        if has("eligib", "can i apply", "which compan", "openings", "jobs"):
            if not openings:
                return (
                    f"{name}, there are no open roles matching your current profile "
                    f"(CGPA {student.get('cgpa')}, {student.get('backlogs', 0)} backlogs). "
                    "New drives are posted throughout the season — check the Placements page daily.",
                    ["Open Placements", "Improve profile"],
                )
            lines = [
                f"• {o['company']} — {o['title']} (up to ₹{o['ctcMax']} LPA, closes {_fmt_date(o.get('deadline'))})"
                for o in openings[:5]
            ]
            return (
                f"{name}, based on your profile you're currently eligible for {len(openings)} open role(s):\n"
                + "\n".join(lines)
                + "\nEligibility is checked against CGPA, backlogs, branch and batch for each posting.",
                ["Open Placements", "Check AI match scores"],
            )

        if has("interview", "scheduled", "next round"):
            upcoming = [a for a in apps if a.get("nextInterview")]
            if not upcoming:
                return (
                    f"{name}, you have no interviews on the calendar right now. Once the placement cell "
                    "schedules a round it will appear here and in your notifications.",
                    ["Open Applications"],
                )
            lines = [f"• {a['company']} — {a['role']} on {_fmt_date(a['nextInterview'])}" for a in upcoming]
            return (f"{name}, your upcoming interviews:\n" + "\n".join(lines), ["Open Applications"])

        if has("status", "my application", "progress", "how many app"):
            if not apps:
                return (
                    f"{name}, you haven't applied to any postings yet. Start from the Placements page — "
                    "the AI recommends roles ranked by your skill overlap.",
                    ["Open Placements"],
                )
            by_status: dict[str, int] = {}
            for a in apps:
                by_status[a["status"]] = by_status.get(a["status"], 0) + 1
            breakdown = ", ".join(f"{k.replace('_', ' ').lower()}: {v}" for k, v in by_status.items())
            return (
                f"{name}, you have {len(apps)} application(s) — {breakdown}.",
                ["Open Applications", "View pipeline"],
            )

        if has("offer", "ctc", "package", "placed"):
            if not offers:
                return (
                    f"{name}, no offers on record yet. Your placement status is "
                    f"{student.get('placementStatus', 'ELIGIBLE').replace('_', ' ').lower()}.",
                    ["Open Applications"],
                )
            lines = [
                f"• {o['company']} — ₹{o['ctc']} LPA ({'accepted' if o.get('accepted') else 'awaiting your response'})"
                for o in offers
            ]
            return (f"{name}, here's your offer status:\n" + "\n".join(lines), ["Respond to offer"])

        if has("resume", "cv", "ats"):
            if not student.get("hasResume"):
                return (
                    f"{name}, you haven't uploaded a resume yet — that's the single biggest blocker in your "
                    "profile. Add it from your profile page and the AI will score it against any posting.",
                    ["Upload resume"],
                )
            return (
                f"{name}, your resume is on file. Run the ATS check against a specific posting to see keyword "
                "coverage, missing skills and formatting suggestions.",
                ["Run ATS check", "AI recommendations"],
            )

        if has("attendance", "present", "absent"):
            pct = student.get("attendancePct")
            if pct is None:
                return (f"{name}, no attendance has been marked for you yet this semester.", [])
            verdict = "above" if pct >= 75 else "below"
            return (
                f"{name}, your overall attendance is {pct}%, which is {verdict} the 75% requirement. "
                "Check the Attendance page for the course-wise split.",
                ["Open Attendance"],
            )

        if has("improve", "prepare", "how do i", "advice", "suggest", "skill gap"):
            gaps = [o for o in openings[:3]]
            focus = ", ".join(sorted({s for o in gaps for s in o.get("skills", [])} - set(skills))[:5])
            return (
                f"{name}, your profile shows {len(skills)} skills: {', '.join(skills[:6]) or 'none listed'}. "
                + (f"The most in-demand skills in your eligible openings that you're missing: {focus}. " if focus else "")
                + f"Your CGPA is {student.get('cgpa')} and you have {student.get('backlogs', 0)} backlog(s) — "
                "clearing backlogs has the highest immediate impact on eligibility.",
                ["View skill-gap report", "Generate interview questions"],
            )

        return (
            f"{name}, I can help with eligibility, applications, interviews, offers, attendance, resume quality "
            "and interview preparation. Ask me something like \"which companies can I apply to?\" or "
            "\"how do I improve my match score?\".",
            ["Eligible openings", "My applications", "Interview prep"],
        )

    # ------------------------------------------------------------ placement cell
    if cell:
        if has("placed", "placement rate", "how many placed", "statistic", "number"):
            return (
                f"{cell.get('placed')} of {cell.get('totalStudents')} students are placed — "
                f"a rate of {cell.get('placementRate')}%. Average CTC is ₹{cell.get('avgCtc')} LPA "
                f"and the highest offer is ₹{cell.get('highestCtc')} LPA.",
                ["Open Analytics"],
            )
        if has("interview", "schedul", "upcoming", "today"):
            interviews = cell.get("upcomingInterviews", []) or []
            if not interviews:
                return ("No interviews are scheduled in the upcoming window.", ["Open Analytics"])
            lines = [
                f"• {i['company']} — {i['student']} ({i['department']}), {i['round']} on {_fmt_date(i['at'])}"
                for i in interviews[:6]
            ]
            return (f"{len(interviews)} upcoming interview(s):\n" + "\n".join(lines), ["Open Applications"])
        if has("recruiter", "top compan", "hiring", "who is hiring"):
            recruiters = cell.get("topRecruiters", []) or []
            if not recruiters:
                return ("No offers have been recorded yet this season.", ["Open Companies"])
            lines = [f"• {r['company']} — {r['offers']} offer(s)" for r in recruiters]
            return (f"Top recruiters this season:\n" + "\n".join(lines), ["Open Companies"])
        if has("opening", "active drive", "job"):
            return (
                f"There are currently {cell.get('activeOpenings')} active opening(s) accepting applications. "
                "Browse them on the Placements page — the AI can shortlist candidates per posting.",
                ["Open Placements", "Run AI shortlist"],
            )
        return (
            f"Campus snapshot: {cell.get('placed')}/{cell.get('totalStudents')} placed "
            f"({cell.get('placementRate')}%), {cell.get('activeOpenings')} active openings, "
            f"average CTC ₹{cell.get('avgCtc')} LPA. Ask me about upcoming interviews, top recruiters, "
            "or run an AI shortlist from any job posting.",
            ["Open Analytics", "Open Placements"],
        )

    return (
        "I'm connected to the CampusFlow database and can help with placements, eligibility, applications, "
        "attendance and analytics. Ask a specific question and I'll pull the live numbers.",
        [],
    )


def parse_json_block(text: str) -> Any | None:
    """Extracts the first JSON object/array from an LLM response."""
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    candidate = fenced.group(1) if fenced else text
    match = re.search(r"[\[{].*[\]}]", candidate, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
