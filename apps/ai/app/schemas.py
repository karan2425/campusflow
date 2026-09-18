"""Request/response contracts. Field names mirror apps/api/src/services/aiClient.ts."""
from typing import Literal

from pydantic import BaseModel, Field

PlacementStatus = Literal["NOT_ELIGIBLE", "ELIGIBLE", "IN_PROCESS", "PLACED", "OPTED_OUT"]


class StudentProfile(BaseModel):
    studentId: str = Field(alias="studentId")
    name: str
    rollNo: str
    department: str
    batch: int
    cgpa: float
    backlogs: int = 0
    skills: list[str] = []
    resumeText: str | None = None
    about: str | None = None
    placementStatus: str = "ELIGIBLE"
    codingScore: int | None = None
    githubScore: int | None = None

    model_config = {"populate_by_name": True}

    def profile_text(self) -> str:
        """Flattened text used for semantic embedding."""
        parts = [
            f"{self.name} — {self.department} student, batch {self.batch}.",
            f"CGPA {self.cgpa}.",
            f"Skills: {', '.join(self.skills)}." if self.skills else "",
            self.about or "",
            (self.resumeText or "")[:3000],
        ]
        return " ".join(p for p in parts if p)


class JobProfile(BaseModel):
    jobId: str = Field(alias="jobId")
    companyName: str
    title: str
    description: str
    skills: list[str] = []
    minCgpa: float = 0
    maxBacklogs: int = 0
    allowedDepartments: list[str] = []
    batches: list[int] = []
    location: str = ""
    ctcMax: float = 0

    model_config = {"populate_by_name": True}

    def profile_text(self) -> str:
        return " ".join(
            p
            for p in [
                f"{self.title} at {self.companyName}.",
                f"Required skills: {', '.join(self.skills)}." if self.skills else "",
                f"Location: {self.location}." if self.location else "",
                self.description[:3000],
            ]
            if p
        )


class MatchResult(BaseModel):
    id: str
    name: str | None = None
    score: float
    semanticScore: float
    skillScore: float
    matchedSkills: list[str]
    missingSkills: list[str]
    rationale: str
    eligible: bool
    blockers: list[str] = []


class IndexRequest(BaseModel):
    students: list[StudentProfile]


class IndexResponse(BaseModel):
    indexed: int
    dimension: int
    provider: str


class MatchStudentsRequest(BaseModel):
    job: JobProfile
    students: list[StudentProfile]
    top_k: int = 10


class MatchStudentsResponse(BaseModel):
    matches: list[MatchResult]
    provider: str
    indexSize: int


class MatchJobsRequest(BaseModel):
    student: StudentProfile
    jobs: list[JobProfile]
    top_k: int = 10


class MatchJobsResponse(BaseModel):
    matches: list[MatchResult]
    provider: str


class ChatRequest(BaseModel):
    message: str
    context: dict = {}
    history: list[dict] = []


class ChatResponse(BaseModel):
    answer: str
    provider: str
    suggestedActions: list[str] = []
    latencyMs: int = 0


class AtsRequest(BaseModel):
    resume_text: str = Field(alias="resume_text")
    job: JobProfile | None = None

    model_config = {"populate_by_name": True}


class SectionCheck(BaseModel):
    section: str
    present: bool
    note: str


class AtsResponse(BaseModel):
    score: float
    verdict: str
    matchedKeywords: list[str]
    missingKeywords: list[str]
    sectionChecks: list[SectionCheck]
    suggestions: list[str]


class ParseRequest(BaseModel):
    resume_text: str = Field(alias="resume_text")

    model_config = {"populate_by_name": True}


class ParseResponse(BaseModel):
    skills: list[str]
    education: list[str]
    projects: list[str]
    experience: list[str]
    summary: str


class InterviewRequest(BaseModel):
    student: StudentProfile
    job: JobProfile
    count: int = 8


class InterviewQuestion(BaseModel):
    question: str
    category: str
    difficulty: str
    idealAnswer: str | None = None


class InterviewResponse(BaseModel):
    questions: list[InterviewQuestion]


class ShortlistRequest(BaseModel):
    job: JobProfile
    students: list[StudentProfile]
    top_k: int = 10


class ShortlistResponse(BaseModel):
    shortlist: list[MatchResult]
    summary: str
    provider: str


class HealthResponse(BaseModel):
    status: str
    provider: str
    indexSize: int
    geminiEnabled: bool
    version: str
