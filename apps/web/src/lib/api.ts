/**
 * Browser API client.
 *
 * Everything goes through the same-origin `/api/backend` prefix, which the
 * Next.js server rewrites to the Express API. That keeps CORS out of the
 * picture entirely and means the API base URL is never hard-coded into the
 * client bundle.
 */
import type {
  AnalyticsOverview,
  Application,
  AtsResult,
  AttendanceOverview,
  ChatResponse,
  Company,
  Course,
  CourseDetail,
  Department,
  AiHealth,
  AiMatch,
  InterviewQuestion,
  JobDetail,
  JobListItem,
  Notification,
  Paginated,
  PipelineColumn,
  SessionUser,
  StudentAnalytics,
  StudentListItem,
  StudentProfile,
} from './types';

const BASE = '/api/backend/v1';

/**
 * Token storage that survives opaque-origin sandboxes: localStorage can throw
 * a SecurityError inside a `sandbox="allow-scripts"` iframe, so we fall back to
 * an in-memory store rather than crashing the app.
 */
const memoryStore = new Map<string, string>();

export const tokenStore = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memoryStore.set(key, value);
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      memoryStore.delete(key);
    }
  },
};

export const TOKEN_KEY = 'campusflow.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...((headers as Record<string, string>) ?? {}),
  };

  if (auth) {
    const token = tokenStore.get(TOKEN_KEY);
    if (token) finalHeaders.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the CampusFlow API. Is the server running?', String(err));
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  return (payload as { data: T }).data;
}

function withMeta<T>(path: string, options?: RequestOptions): Promise<Paginated<T>> {
  const { body, auth = true, headers, ...rest } = options ?? {};
  const finalHeaders: Record<string, string> = { 'content-type': 'application/json', ...((headers as Record<string, string>) ?? {}) };
  if (auth) {
    const token = tokenStore.get(TOKEN_KEY);
    if (token) finalHeaders.authorization = `Bearer ${token}`;
  }
  return fetch(`${BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = (payload as { error?: { code?: string; message?: string } })?.error;
        throw new ApiError(response.status, error?.code ?? 'UNKNOWN', error?.message ?? 'Request failed');
      }
      const meta = (payload as { meta: { total: number; page: number; pageSize: number; totalPages: number } }).meta;
      return {
        items: (payload as { data: T[] }).data,
        total: meta?.total ?? 0,
        page: meta?.page ?? 1,
        pageSize: meta?.pageSize ?? 25,
        totalPages: meta?.totalPages ?? 1,
      };
    })
    .catch((err) => {
      if (err instanceof ApiError) throw err;
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the CampusFlow API.', String(err));
    });
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  // ------------------------------------------------------------------ auth
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),

  register: (payload: {
    email: string;
    password: string;
    name: string;
    rollNo: string;
    departmentCode: string;
    batch: number;
    phone?: string;
  }) => request<{ token: string; user: SessionUser }>('/auth/register', { method: 'POST', body: payload, auth: false }),

  me: () => request<SessionUser>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ updated: boolean }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  // -------------------------------------------------------------- students
  students: (params: {
    q?: string;
    department?: string;
    batch?: number;
    placementStatus?: string;
    minCgpa?: number;
    skill?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }) => withMeta<StudentListItem>(`/students${qs(params)}`),

  student: (id: string) => request<StudentProfile>(`/students/${id}`),

  updateStudent: (id: string, payload: Record<string, unknown>) =>
    request<{ id: string; updatedAt: string }>(`/students/${id}`, { method: 'PATCH', body: payload }),

  // ----------------------------------------------------------- departments
  departments: () => request<Department[]>('/departments'),

  // --------------------------------------------------------------- courses
  courses: (params: { department?: string; semester?: number; q?: string } = {}) =>
    withMeta<Course>(`/courses${qs(params)}`),

  course: (id: string) => request<CourseDetail>(`/courses/${id}`),

  // ------------------------------------------------------------ attendance
  attendanceOverview: () => request<AttendanceOverview>('/attendance/overview'),

  studentAttendance: (studentId: string) =>
    request<{ courseId: string; code: string; title: string; present: number; total: number; pct: number }[]>(
      `/attendance/student/${studentId}`,
    ),

  // ------------------------------------------------------------- companies
  companies: () => request<Company[]>('/companies'),

  createCompany: (payload: {
    name: string;
    website?: string;
    industry?: string;
    tier?: string;
    hqCity?: string;
    hrName?: string;
    hrEmail?: string;
    description?: string;
  }) => request<{ id: string }>('/companies', { method: 'POST', body: payload }),

  company: (id: string) => request<Company & { offersMade: number; highestCtc: number | null }>(`/companies/${id}`),

  // ------------------------------------------------------------------ jobs
  jobs: (params: {
    q?: string;
    status?: string;
    type?: string;
    company?: string;
    department?: string;
    minCtc?: number;
    page?: number;
    pageSize?: number;
  } = {}) => withMeta<JobListItem>(`/jobs${qs(params)}`),

  job: (id: string) => request<JobDetail>(`/jobs/${id}`),

  createJob: (payload: Record<string, unknown>) => request<JobListItem>('/jobs', { method: 'POST', body: payload }),

  updateJob: (id: string, payload: Record<string, unknown>) =>
    request<JobListItem>(`/jobs/${id}`, { method: 'PATCH', body: payload }),

  jobMatches: (id: string, topK = 15) => request<{ jobId: string; poolSize: number; provider: string; matches: AiMatch[] }>(`/jobs/${id}/matches${qs({ topK })}`),

  // ---------------------------------------------------------- applications
  applications: (params: { status?: string; jobId?: string; studentId?: string; page?: number; pageSize?: number } = {}) =>
    withMeta<Application>(`/applications${qs(params)}`),

  pipeline: (jobId?: string) => request<{ columns: PipelineColumn[]; total: number }>(`/applications/pipeline${qs({ jobId })}`),

  apply: (jobId: string, coverNote?: string) =>
    request<{ id: string; status: string; matchScore: number | null; atsScore: number | null; warnings: string[] }>(
      '/applications',
      { method: 'POST', body: { jobId, coverNote } },
    ),

  updateApplicationStatus: (id: string, status: string, note?: string) =>
    request<{ id: string; status: string }>(`/applications/${id}/status`, { method: 'PATCH', body: { status, note } }),

  scheduleInterview: (applicationId: string, payload: Record<string, unknown>) =>
    request<{ id: string }>(`/applications/${applicationId}/interviews`, { method: 'POST', body: payload }),

  recordInterview: (interviewId: string, payload: Record<string, unknown>) =>
    request<{ id: string }>(`/applications/interviews/${interviewId}`, { method: 'PATCH', body: payload }),

  makeOffer: (applicationId: string, payload: Record<string, unknown>) =>
    request<{ id: string }>(`/applications/${applicationId}/offer`, { method: 'POST', body: payload }),

  respondToOffer: (offerId: string, accepted: boolean, declinedReason?: string) =>
    request<{ id: string }>(`/applications/offers/${offerId}`, { method: 'PATCH', body: { accepted, declinedReason } }),

  withdrawApplication: (id: string) => request<{ withdrawn: boolean }>(`/applications/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------------------- analytics
  analytics: (batch?: number) => request<AnalyticsOverview>(`/analytics/overview${qs({ batch })}`),

  studentAnalytics: (studentId: string) => request<StudentAnalytics>(`/analytics/student/${studentId}`),

  // --------------------------------------------------------------- ai
  aiHealth: () => request<AiHealth>('/ai/health', { auth: false }),

  aiSyncIndex: () => request<{ indexed: number; dimension: number; provider: string; latencyMs: number }>('/ai/sync-index', { method: 'POST' }),

  aiChat: (message: string, history: { role: 'user' | 'assistant'; content: string }[] = []) =>
    request<ChatResponse>('/ai/chat', { method: 'POST', body: { message, history } }),

  aiAtsScore: (jobId?: string, resumeText?: string) =>
    request<AtsResult>('/ai/resume/ats-score', { method: 'POST', body: { jobId, resumeText } }),

  aiParseResume: (resumeText: string, persist = false) =>
    request<{ skills: string[]; education: string[]; projects: string[]; experience: string[]; summary: string }>(
      '/ai/resume/parse',
      { method: 'POST', body: { resumeText, persist } },
    ),

  aiRecommendations: (studentId?: string) =>
    request<{ recommendations: AiMatch[]; provider: string; latencyMs: number }>(`/ai/recommendations${qs({ studentId })}`),

  aiInterviewPrep: (jobId?: string, count = 8) =>
    request<{ role: string; company: string; questions: InterviewQuestion[]; latencyMs: number }>('/ai/interview-prep', {
      method: 'POST',
      body: { jobId, count },
    }),

  aiShortlist: (jobId: string, topK = 10) =>
    request<{
      jobId: string;
      company: string;
      title: string;
      summary: string;
      shortlist: AiMatch[];
      poolSize: number;
      latencyMs: number;
    }>(`/ai/jobs/${jobId}/shortlist`, { method: 'POST', body: { topK } }),

  aiInsights: () =>
    request<{
      totals: { interactions: number; avgLatencyMs: number };
      byKind: { kind: string; count: number; avgLatencyMs: number }[];
      recent: {
        id: string;
        kind: string;
        prompt: string;
        user: string;
        role: string | null;
        provider: string;
        latencyMs: number | null;
        createdAt: string;
      }[];
    }>('/ai/insights'),

  // --------------------------------------------------------- notifications
  notifications: (unreadOnly = false) =>
    request<{ notifications: Notification[]; unread: number }>(`/notifications${qs({ unread: unreadOnly })}`),

  markNotificationsRead: (ids?: string[], all = false) =>
    request<{ updated: number }>('/notifications/read', { method: 'PATCH', body: { ids, all } }),
};
