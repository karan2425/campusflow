import { env } from '../env.js';
import { AppError } from '../lib/http.js';

/**
 * Thin typed client for the CampusFlow AI microservice (FastAPI + Gemini + FAISS).
 * Every call degrades gracefully: if the AI service is down the API surfaces a
 * 502 with a clear code, and route handlers decide whether to fall back.
 */

interface AiResponse<T> {
  data: T;
  latencyMs: number;
}

async function call<T>(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<AiResponse<T>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_SERVICE_TIMEOUT_MS);

  try {
    const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.upstream(`AI service responded ${res.status}`, text.slice(0, 500));
    }
    return { data: (await res.json()) as T, latencyMs: Date.now() - startedAt };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw AppError.upstream('AI service timed out');
    }
    throw AppError.upstream('AI service is unreachable', String((err as Error).message));
  } finally {
    clearTimeout(timeout);
  }
}

// ---- DTOs shared with apps/ai/app/schemas.py -------------------------------

export interface StudentProfile {
  studentId: string;
  name: string;
  rollNo: string;
  department: string;
  batch: number;
  cgpa: number;
  backlogs: number;
  skills: string[];
  resumeText?: string | null;
  about?: string | null;
  placementStatus: string;
  codingScore?: number | null;
  githubScore?: number | null;
}

export interface JobProfile {
  jobId: string;
  companyName: string;
  title: string;
  description: string;
  skills: string[];
  minCgpa: number;
  maxBacklogs: number;
  allowedDepartments: string[];
  batches: number[];
  location: string;
  ctcMax: number;
}

export interface MatchResult {
  id: string;
  name?: string;
  score: number;
  semanticScore: number;
  skillScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  rationale: string;
  eligible: boolean;
  blockers: string[];
}

export interface ChatResult {
  answer: string;
  provider: string;
  suggestedActions: string[];
  latencyMs: number;
}

export interface AtsResult {
  score: number;
  verdict: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  sectionChecks: { section: string; present: boolean; note: string }[];
  suggestions: string[];
}

export const aiClient = {
  health: () => call<{ status: string; provider: string; indexSize: number }>('/ai/health', undefined, 'GET'),

  indexStudents: (students: StudentProfile[]) =>
    call<{ indexed: number; dimension: number; provider: string }>('/ai/index/students', { students }),

  matchStudentsForJob: (job: JobProfile, students: StudentProfile[], topK = 10) =>
    call<{ matches: MatchResult[]; provider: string; indexSize: number }>('/ai/match/students-for-job', {
      job,
      students,
      top_k: topK,
    }),

  matchJobsForStudent: (student: StudentProfile, jobs: JobProfile[], topK = 10) =>
    call<{ matches: MatchResult[]; provider: string }>('/ai/match/jobs-for-student', {
      student,
      jobs,
      top_k: topK,
    }),

  chat: (message: string, context?: Record<string, unknown>, history?: { role: string; content: string }[]) =>
    call<ChatResult>('/ai/chat', { message, context: context ?? {}, history: history ?? [] }),

  atsScore: (resumeText: string, job: JobProfile) =>
    call<AtsResult>('/ai/resume/ats-score', { resume_text: resumeText, job }),

  parseResume: (resumeText: string) =>
    call<{ skills: string[]; education: string[]; projects: string[]; experience: string[]; summary: string }>(
      '/ai/resume/parse',
      { resume_text: resumeText },
    ),

  interviewQuestions: (student: StudentProfile, job: JobProfile, count = 8) =>
    call<{ questions: { question: string; category: string; difficulty: string; idealAnswer?: string }[] }>(
      '/ai/interview/questions',
      { student, job, count },
    ),

  shortlist: (job: JobProfile, students: StudentProfile[], topK = 10) =>
    call<{ shortlist: MatchResult[]; summary: string; provider: string }>('/ai/shortlist', {
      job,
      students,
      top_k: topK,
    }),
};
