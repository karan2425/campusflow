"""
Interview preparation.

Uses Gemini for tailored questions when configured; otherwise composes a
question set from a curated bank keyed on the role's skill profile plus the
student's own projects and gaps, so the output is always role-specific.
"""
from __future__ import annotations

from .llm import generate, parse_json_block
from .matching import canonical
from .schemas import InterviewQuestion, JobProfile, StudentProfile

# ---------------------------------------------------------------- question bank
FUNDAMENTALS = [
    ("Tell me about yourself and why this role interests you.", "HR", "Easy"),
    ("Walk me through your most challenging project and the trade-offs you made.", "Behavioural", "Medium"),
    ("Describe a time you disagreed with a teammate. How did it resolve?", "Behavioural", "Medium"),
    ("Where do you see yourself in three years?", "HR", "Easy"),
]

SKILL_BANK: dict[str, list[tuple[str, str]]] = {
    "python": [
        ("Explain the difference between a list and a generator in Python, and when you'd choose each.", "Technical"),
        ("How does Python's GIL affect multithreaded CPU-bound workloads, and what are your alternatives?", "Advanced"),
        ("What are decorators and how would you implement one that retries a failing call?", "Technical"),
    ],
    "java": [
        ("Explain the JVM memory model and how garbage collection differs between G1 and ZGC.", "Advanced"),
        ("What is the difference between an interface and an abstract class? When do you use each?", "Technical"),
        ("How does HashMap handle collisions, and why is String a good key?", "Technical"),
    ],
    "javascript": [
        ("Explain the event loop, microtasks and macrotasks with an example.", "Advanced"),
        ("What is a closure? Give a practical use case in a component or module.", "Technical"),
        ("How does prototypal inheritance differ from classical inheritance?", "Technical"),
    ],
    "typescript": [
        ("When would you reach for a generic instead of `any`, and how do constraints help?", "Technical"),
        ("Explain discriminated unions and how they improve exhaustive checking.", "Advanced"),
    ],
    "react": [
        ("Explain the difference between useMemo, useCallback and React.memo — when does each actually help?", "Advanced"),
        ("How do you debug a component that re-renders too often?", "Technical"),
        ("What problems does the virtual DOM solve, and what does it not solve?", "Technical"),
    ],
    "node.js": [
        ("How would you handle a CPU-heavy task in Node without blocking the event loop?", "Advanced"),
        ("Explain streams and backpressure with a real example.", "Advanced"),
        ("How do you prevent an unhandled promise rejection from crashing production?", "Technical"),
    ],
    "sql": [
        ("Given a slow query on a 10M-row table, how do you diagnose and fix it?", "Advanced"),
        ("Explain the difference between INNER, LEFT and FULL OUTER joins with an example.", "Technical"),
        ("What is the difference between a clustered and a non-clustered index?", "Technical"),
    ],
    "postgresql": [
        ("Explain MVCC in PostgreSQL and how it affects long-running transactions.", "Advanced"),
        ("When would you use a partial index over a full index?", "Advanced"),
    ],
    "mongodb": [
        ("How do you model a one-to-many relationship in MongoDB, and when do you embed vs reference?", "Technical"),
        ("Explain the aggregation pipeline with an example stage sequence.", "Technical"),
    ],
    "docker": [
        ("What is the difference between an image layer and a container, and how do you keep images small?", "Technical"),
        ("How would you debug a container that exits immediately on start?", "Technical"),
    ],
    "kubernetes": [
        ("Explain the difference between a Deployment and a StatefulSet.", "Advanced"),
        ("How do readiness and liveness probes differ, and what breaks if you get them wrong?", "Advanced"),
    ],
    "aws": [
        ("Design the architecture for a resilient web app on AWS. Where would it fail first?", "Advanced"),
        ("Explain the difference between S3 storage classes and when to use each.", "Technical"),
    ],
    "data structures": [
        ("Given an array of integers, find the longest subarray with sum K. What's the optimal approach?", "Technical"),
        ("Explain how a hash map achieves amortised O(1) lookups and when it degrades.", "Technical"),
        ("Compare quicksort and mergesort: performance, memory and stability trade-offs.", "Technical"),
    ],
    "system design": [
        ("Design a URL shortener handling 10k writes/sec. Walk through storage and scaling.", "Advanced"),
        ("How would you design the notification system for this placement platform?", "Advanced"),
        ("Explain consistent hashing and why it matters for distributed caches.", "Advanced"),
    ],
    "machine learning": [
        ("Your model has 98% training accuracy and 62% validation accuracy. Diagnose and fix it.", "Advanced"),
        ("Explain precision vs recall and which matters for a fraud-detection system.", "Technical"),
        ("How do you detect and handle data leakage in a feature pipeline?", "Advanced"),
    ],
    "embedded c": [
        ("Explain the difference between volatile and const in embedded C.", "Technical"),
        ("How would you debug a hard fault on a Cortex-M microcontroller?", "Advanced"),
    ],
    "verilog": [
        ("Difference between blocking and non-blocking assignments? Show a race condition.", "Advanced"),
        ("How do you design a clock domain crossing safely?", "Advanced"),
    ],
    "solidworks": [
        ("Explain GD&T and how you apply tolerances to a mating assembly.", "Technical"),
        ("How would you optimise a design for injection moulding?", "Advanced"),
    ],
    "iot": [
        ("How would you secure a fleet of field-deployed IoT devices?", "Advanced"),
        ("Explain MQTT vs HTTP for constrained devices.", "Technical"),
    ],
    "communication": [
        ("How do you explain a technical trade-off to a non-technical stakeholder?", "Behavioural"),
    ],
    "leadership": [
        ("Tell me about leading a team under a deadline. What did you change afterwards?", "Behavioural"),
    ],
}

GENERIC_TECHNICAL = [
    ("Pick a technology from your resume and explain a non-obvious limitation of it.", "Technical"),
    ("Describe a bug that took you more than a day to find. How did you finally solve it?", "Technical"),
    ("How do you ensure your code is testable before you start writing it?", "Technical"),
]


def _fallback_questions(student: StudentProfile, job: JobProfile, count: int) -> list[InterviewQuestion]:
    questions: list[InterviewQuestion] = []

    # 1. Role framing
    questions.append(
        InterviewQuestion(
            question=f"Why do you want to join {job.companyName} as a {job.title}, and what in your background maps to this role?",
            category="HR",
            difficulty="Easy",
            idealAnswer=(
                f"Reference {job.companyName}'s work in {job.location or 'their domain'}, then connect two or three of your "
                f"strongest skills ({', '.join(student.skills[:3]) or 'your core skills'}) to the role's requirements."
            ),
        )
    )

    # 2. Skill-driven technical questions, prioritising matched skills
    seen: set[str] = set()
    ordered = list(dict.fromkeys([canonical(s) for s in job.skills] + [canonical(s) for s in student.skills]))
    for skill in ordered:
        if skill in seen:
            continue
        bank = SKILL_BANK.get(skill)
        if not bank:
            continue
        seen.add(skill)
        for question, category in bank[:2]:
            questions.append(
                InterviewQuestion(
                    question=question,
                    category=category,
                    difficulty="Advanced" if category == "Advanced" else "Medium",
                    idealAnswer=f"Expect a concrete example referencing {skill} from the candidate's projects.",
                )
            )
            if len(questions) >= count:
                break
        if len(questions) >= count:
            break

    # 3. Projects and experience
    if student.resumeText:
        questions.append(
            InterviewQuestion(
                question="Walk me through the architecture of the project you're most proud of. What would you redesign today?",
                category="Project Deep-dive",
                difficulty="Medium",
                idealAnswer="Look for ownership, concrete trade-offs, and honest reflection on limitations.",
            )
        )

    # 4. Gaps — interviewers probe what is missing
    missing = [s for s in job.skills if canonical(s) not in {canonical(x) for x in student.skills}]
    if missing:
        questions.append(
            InterviewQuestion(
                question=f"This role needs {missing[0]}. You haven't used it on a project yet — how would you ramp up in the first month?",
                category="Gap Handling",
                difficulty="Medium",
                idealAnswer="A credible learning plan beats a bluff: name resources, a small project, and a feedback loop.",
            )
        )

    # 5. Fill the remainder
    pool = FUNDAMENTALS + [(q, c) for q, c in GENERIC_TECHNICAL] + FUNDAMENTALS[:1]
    index = 0
    while len(questions) < count and index < len(pool):
        question, category = pool[index]
        index += 1
        if any(q.question == question for q in questions):
            continue
        questions.append(InterviewQuestion(question=question, category=category, difficulty="Medium"))

    return questions[:count]


async def generate_questions(student: StudentProfile, job: JobProfile, count: int = 8) -> list[InterviewQuestion]:
    prompt = (
        f"Generate exactly {count} interview questions for a campus placement interview.\n\n"
        f"ROLE: {job.title} at {job.companyName}\n"
        f"REQUIRED SKILLS: {', '.join(job.skills)}\n"
        f"JOB DESCRIPTION (excerpt): {job.description[:1200]}\n\n"
        f"CANDIDATE: {student.name}, {student.department}, CGPA {student.cgpa}, "
        f"skills: {', '.join(student.skills)}\n"
        f"CANDIDATE RESUME (excerpt): {(student.resumeText or '')[:1200]}\n\n"
        "Mix technical depth, project deep-dives and behavioural questions. Increasing difficulty. "
        'Return JSON: {"questions":[{"question":str,"category":str,"difficulty":"Easy"|"Medium"|"Advanced",'
        '"idealAnswer":str}]}'
    )

    raw = await generate(prompt, system="You are an experienced campus interviewer. Output only valid JSON.", temperature=0.6)
    parsed = parse_json_block(raw or "")

    if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list) and parsed["questions"]:
        questions: list[InterviewQuestion] = []
        for item in parsed["questions"][:count]:
            if not isinstance(item, dict) or not item.get("question"):
                continue
            questions.append(
                InterviewQuestion(
                    question=str(item["question"])[:500],
                    category=str(item.get("category") or "Technical")[:40],
                    difficulty=str(item.get("difficulty") or "Medium")[:12],
                    idealAnswer=(str(item["idealAnswer"])[:600] if item.get("idealAnswer") else None),
                )
            )
        if questions:
            return questions

    return _fallback_questions(student, job, count)


def shortlist_summary(job: JobProfile, shortlist: list, pool_size: int) -> str:
    """Deterministic recruiter-facing narrative — factual, no invented claims."""
    if not shortlist:
        return (
            f"No candidates in the current pool of {pool_size} meet the requirements for {job.title} "
            f"(CGPA ≥ {job.minCgpa}, ≤ {job.maxBacklogs} backlog(s)). Consider relaxing the CGPA cut-off."
        )

    eligible = [m for m in shortlist if m.eligible]
    top = shortlist[0]
    avg = round(sum(m.score for m in shortlist[:5]) / min(5, len(shortlist)), 1)
    lines = [
        f"Reviewed {pool_size} candidates for {job.title} at {job.companyName}; "
        f"{len(eligible)} of the top {len(shortlist)} pass every eligibility gate.",
        f"Top recommendation: {top.name} ({top.score}/100) — {top.rationale}",
        f"Average score across the shortlist: {avg}/100.",
    ]

    recurring_gaps: dict[str, int] = {}
    for match in shortlist:
        for gap in match.missingSkills:
            recurring_gaps[gap] = recurring_gaps.get(gap, 0) + 1
    if recurring_gaps:
        worst = sorted(recurring_gaps.items(), key=lambda kv: kv[1], reverse=True)[:3]
        lines.append("Common gaps across this pool: " + ", ".join(f"{k} ({v})" for k, v in worst) + ".")

    blocked = [m for m in shortlist if not m.eligible]
    if blocked:
        lines.append(f"{len(blocked)} candidate(s) were gated out — mostly on {blocked[0].blockers[0].lower()}.")

    return " ".join(lines)
