"""
Resume intelligence: ATS scoring and structured parsing.

Scoring is deterministic (works with no LLM) and mirrors what real ATS
screens look for: keyword coverage against the JD, presence of standard
sections, quantified impact, contact details, and length/format hygiene.
Gemini only adds extra prose suggestions when a key is configured.
"""
from __future__ import annotations

import re
from collections import Counter

from .embeddings import tokenize
from .llm import generate, parse_json_block
from .matching import canonical, _similar  # reuse synonym-aware comparison
from .schemas import AtsResponse, JobProfile, ParseResponse, SectionCheck

SECTION_PATTERNS: dict[str, tuple[str, ...]] = {
    "Contact details": ("email", "phone", "mail", "contact", "+91", "@"),
    "Education": ("education", "b.tech", "btech", "bachelor", "degree", "university", "college", "cgpa", "gpa"),
    "Skills": ("skills", "technical skills", "technologies", "tech stack", "proficiencies"),
    "Projects": ("project", "projects", "portfolio", "built", "developed"),
    "Experience": ("experience", "internship", "intern ", "employment", "worked", "company"),
    "Achievements": ("achievement", "award", "certification", "hackathon", "rank", "scholarship", "publication"),
}

QUANTIFIED_RE = re.compile(r"\b(\d+(?:\.\d+)?)\s*(%|percent|x|k\b|users|ms|req|requests|students|members|hours)", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
PHONE_RE = re.compile(r"(\+?\d[\d\s-]{8,}\d)")

SKILL_VOCAB = [
    # software
    "python", "java", "javascript", "typescript", "c++", "csharp", "go", "rust", "kotlin", "swift",
    "react", "angular", "vue", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring boot",
    "postgresql", "mysql", "mongodb", "redis", "sql", "docker", "kubernetes", "aws", "azure", "gcp",
    "terraform", "jenkins", "git", "github actions", "linux", "rest apis", "graphql", "grpc",
    "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
    "nlp", "computer vision", "data structures", "system design", "microservices", "kafka", "spark",
    "airflow", "hadoop", "tableau", "power bi", "selenium", "pytest", "jest", "cypress",
    # hardware / core
    "embedded c", "rtos", "verilog", "vlsi", "matlab", "arduino", "raspberry pi", "pcb design", "iot",
    "signal processing", "solidworks", "autocad", "ansys", "catia", "gd&t", "cnc", "plc", "scada",
    "staad pro", "revit", "surveying", "power systems", "control systems",
    # soft
    "communication", "leadership", "teamwork", "problem solving", "time management", "presentation",
]


def _keywords_from_job(job: JobProfile | None) -> list[str]:
    if job is None:
        return ["data structures", "sql", "git", "problem solving", "communication"]

    keywords: list[str] = list(dict.fromkeys(job.skills))

    # Add vocabulary terms that appear in the JD body as whole words/phrases.
    # Word boundaries matter: a naive substring test matches "ship" inside
    # "leadership" and "design" inside "system design", which then pollutes
    # both the matched and missing keyword lists.
    lowered = job.description.lower()
    for vocab in SKILL_VOCAB:
        if re.search(rf"(?<![a-z0-9]){re.escape(vocab)}(?![a-z0-9])", lowered):
            if not any(_similar(vocab, existing) for existing in keywords):
                keywords.append(vocab)
    return keywords[:24]


def ats_score_sync(resume_text: str, job: JobProfile | None) -> AtsResponse:
    text = resume_text or ""
    lowered = text.lower()
    word_count = len(tokenize(text))

    # ---- keyword coverage (55%) -------------------------------------------
    keywords = _keywords_from_job(job)
    matched, missing = [], []
    for kw in keywords:
        (matched if _similar(kw, "") is False and kw.lower() in lowered or any(
            _similar(kw, found) for found in re.findall(r"[a-z0-9+#.]+(?:\s[a-z0-9+#.]+)?", lowered)
        ) else missing).append(kw)

    coverage = len(matched) / len(keywords) if keywords else 0.0
    keyword_points = coverage * 55

    # ---- section presence (25%) -------------------------------------------
    section_checks: list[SectionCheck] = []
    found_sections = 0
    for section, hints in SECTION_PATTERNS.items():
        present = any(h in lowered for h in hints)
        if present:
            found_sections += 1
        note = {
            "Contact details": "Recruiters need a reachable email and phone at the top.",
            "Education": "Include degree, institute, graduation year and CGPA.",
            "Skills": "A dedicated skills block improves ATS keyword parsing.",
            "Projects": "Projects are the strongest signal for campus hires.",
            "Experience": "Internships, freelance or open-source work all count.",
            "Achievements": "Awards and certifications differentiate you from peers.",
        }[section]
        section_checks.append(SectionCheck(section=section, present=present, note=note))
    section_points = (found_sections / len(SECTION_PATTERNS)) * 25

    # ---- quality signals (20%) --------------------------------------------
    quality = 0.0
    suggestions: list[str] = []

    quantified = len(QUANTIFIED_RE.findall(text))
    if quantified >= 3:
        quality += 8
    elif quantified >= 1:
        quality += 4
        suggestions.append("Quantify more results (e.g. “cut query latency by 40%”, “handled 10k requests/min”).")
    else:
        suggestions.append("Add measurable outcomes — numbers make impact credible to both ATS and humans.")

    action_verbs = len(re.findall(r"\b(built|designed|implemented|developed|led|optimised|optimized|automated|deployed|reduced|improved|migrated|architected)\b", lowered))
    if action_verbs >= 4:
        quality += 5
    elif action_verbs >= 1:
        quality += 2.5
        suggestions.append("Start bullet points with strong action verbs (Built, Designed, Optimised…).")

    if EMAIL_RE.search(text) and PHONE_RE.search(text):
        quality += 4
    else:
        suggestions.append("Put a professional email and phone number in the header — missing contact details are a common auto-reject.")

    if 250 <= word_count <= 900:
        quality += 3
    elif word_count < 250:
        suggestions.append(f"Your resume reads short ({word_count} words). Aim for 400–700 words of substance.")
    else:
        suggestions.append(f"Your resume is long ({word_count} words). Trim to the most relevant 1–2 pages.")

    quality_points = min(20.0, quality)

    raw = keyword_points + section_points + quality_points
    score = round(max(0.0, min(100.0, raw)), 1)

    if score >= 80:
        verdict = "Excellent — strong keyword alignment and structure"
    elif score >= 65:
        verdict = "Good — will clear most automated screens"
    elif score >= 50:
        verdict = "Average — likely to clear, but you're losing points on keywords"
    else:
        verdict = "Needs work — high risk of being filtered before a human sees it"

    if missing:
        suggestions.insert(
            0,
            f"Add these JD keywords if you genuinely have the skill: {', '.join(missing[:6])}.",
        )
    if coverage < 0.5 and job is not None:
        suggestions.insert(
            0,
            f"Only {len(matched)}/{len(keywords)} job keywords appear in your resume — tailor it per posting.",
        )

    return AtsResponse(
        score=score,
        verdict=verdict,
        matchedKeywords=matched,
        missingKeywords=missing,
        sectionChecks=section_checks,
        suggestions=suggestions[:8],
    )


async def ats_score(resume_text: str, job: JobProfile | None) -> AtsResponse:
    """Deterministic score, optionally enriched with Gemini suggestions."""
    result = ats_score_sync(resume_text, job)

    if job is not None:
        prompt = (
            "You are an ATS reviewer for a campus placement. Given the candidate resume and the job "
            "description, list at most 2 additional, specific, non-obvious improvements. "
            "Reply with a JSON array of strings only.\n\n"
            f"JOB: {job.title} at {job.companyName}\n{job.description[:1500]}\n\n"
            f"RESUME:\n{resume_text[:3000]}"
        )
        raw = await generate(prompt, system="You output only valid JSON. No prose.", temperature=0.3)
        extra = parse_json_block(raw or "")
        if isinstance(extra, list):
            cleaned = [str(x).strip() for x in extra if str(x).strip()][:2]
            result.suggestions = (result.suggestions + cleaned)[:8]

    return result


def parse_resume_sync(resume_text: str) -> ParseResponse:
    """Extracts skills, education, projects and experience with regex heuristics."""
    text = resume_text or ""
    lowered = text.lower()

    skills = sorted({s for s in SKILL_VOCAB if re.search(rf"(?<![a-z0-9]){re.escape(s)}(?![a-z0-9])", lowered)})

    def section(name_hints: tuple[str, ...], stop_hints: tuple[str, ...], limit: int = 6) -> list[str]:
        lines = [ln.strip(" •-–\t") for ln in text.splitlines()]
        collected: list[str] = []
        capturing = False
        for line in lines:
            low = line.lower()
            if not line:
                continue
            if any(h in low for h in name_hints) and len(line) < 60:
                capturing = True
                continue
            if capturing and any(h in low for h in stop_hints) and len(line) < 60:
                break
            if capturing and len(line) > 12:
                collected.append(line[:220])
            if len(collected) >= limit:
                break
        return collected

    education = section(("education", "academic"), ("skills", "projects", "experience", "achievements"))
    if not education:
        education = [ln.strip() for ln in text.splitlines() if re.search(r"(b\.?tech|cgpa|gpa|bachelor)", ln, re.I)][:3]

    projects = section(("projects", "project work"), ("experience", "achievements", "skills"), limit=5)
    experience = section(("experience", "internship", "work experience"), ("achievements", "skills", "projects"), limit=4)

    summary = (
        f"{len(skills)} recognised technical skills"
        + (f" led by {', '.join(skills[:5])}" if skills else "")
        + f"; {len(projects)} project(s) and {len(experience)} experience entr(ies) detected."
    )

    return ParseResponse(
        skills=skills,
        education=education,
        projects=projects,
        experience=experience,
        summary=summary,
    )


async def parse_resume(resume_text: str) -> ParseResponse:
    result = parse_resume_sync(resume_text)

    prompt = (
        "Extract a JSON object from this resume with exactly these keys: "
        '"skills" (array of strings), "education" (array), "projects" (array), '
        '"experience" (array), "summary" (one sentence). '
        "Only include what is explicitly present. No commentary.\n\n"
        f"RESUME:\n{resume_text[:4000]}"
    )
    raw = await generate(prompt, system="You output only valid JSON. No prose.", temperature=0.2)
    parsed = parse_json_block(raw or "")

    if isinstance(parsed, dict):
        # Heuristic extraction stays authoritative; the LLM only fills gaps.
        if parsed.get("skills") and isinstance(parsed["skills"], list):
            merged = {s.lower() for s in result.skills} | {str(s).strip().lower() for s in parsed["skills"] if str(s).strip()}
            result.skills = sorted(merged)[:40]
        for field in ("education", "projects", "experience"):
            value = parsed.get(field)
            if isinstance(value, list) and value and not getattr(result, field):
                setattr(result, field, [str(v)[:220] for v in value][:6])
        if isinstance(parsed.get("summary"), str) and parsed["summary"].strip():
            result.summary = parsed["summary"].strip()[:400]

    return result


def keyword_frequency(text: str, top: int = 12) -> list[tuple[str, int]]:
    """Debug helper — most frequent meaningful tokens."""
    return Counter(tokenize(text)).most_common(top)
