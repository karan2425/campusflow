/** Shared API contract types, mirrored from the Express + Prisma layer. */

export type Role = 'ADMIN' | 'PLACEMENT_OFFICER' | 'FACULTY' | 'STUDENT';

export type PlacementStatus = 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'IN_PROCESS' | 'PLACED' | 'OPTED_OUT';

export type ApplicationStatus =
  | 'APPLIED'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEWED'
  | 'OFFERED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  unreadNotifications?: number;
  student?: {
    id: string;
    rollNo: string;
    batch: number;
    cgpa: number;
    backlogs: number;
    skills: string[];
    placementStatus: PlacementStatus;
    department: string;
    departmentCode: string;
  } | null;
  faculty?: { id: string; designation: string; department: string } | null;
}

export interface StudentListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  rollNo: string;
  department: string;
  departmentName: string;
  batch: number;
  currentSemester: number;
  cgpa: number;
  backlogs: number;
  skills: string[];
  placementStatus: PlacementStatus;
  verified: boolean;
  codingScore: number | null;
  githubScore: number | null;
  applications: number;
  city: string | null;
}

/**
 * Note: intentionally *not* an extension of StudentListItem — the directory
 * returns an `applications` count, whereas the 360° profile returns the full
 * application records. Sharing a base type would be a lie.
 */
export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl?: string | null;
  rollNo: string;
  department: string;
  departmentCode: string;
  batch: number;
  currentSemester: number;
  cgpa: number;
  backlogs: number;
  skills: string[];
  placementStatus: PlacementStatus;
  verified: boolean;
  codingScore: number | null;
  githubScore: number | null;
  applications: StudentProfileApplication[];
  city: string | null;
  about: string | null;
  resumeUrl: string | null;
  hasResumeText: boolean;
  githubUrl: string | null;
  linkedinUrl: string | null;
  attendance: {
    totalSessions: number;
    present: number;
    late: number;
    percentage: number;
    breakdown: { status: string; count: number }[];
  };
  courses: {
    id: string;
    code: string;
    title: string;
    credits: number;
    semester: number;
    status: string;
    grade: string | null;
    marks: number | null;
    faculty: string | null;
  }[];
}

export interface StudentProfileApplication {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  matchScore: number | null;
  atsScore: number | null;
  aiSummary?: string | null;
  job: { id: string; title: string; company: string; ctcMax: number; type: string };
  interviews: {
    id: string;
    round: number;
    name: string;
    scheduledAt: string;
    result: string;
    mode: string;
  }[];
  offer: { ctc: number; accepted: boolean; location: string | null } | null;
}

export interface JobListItem {
  id: string;
  title: string;
  company: string;
  companyId: string;
  industry: string | null;
  tier: string | null;
  type: 'FULL_TIME' | 'INTERNSHIP' | 'INTERNSHIP_PPO' | 'PART_TIME';
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  location: string;
  workMode: string | null;
  ctcMin: number;
  ctcMax: number;
  stipendPerMonth: number | null;
  minCgpa: number;
  maxBacklogs: number;
  allowedDepartments: string[];
  batches: number[];
  skills: string[];
  openings: number;
  bondMonths: number | null;
  deadline: string;
  postedAt: string;
  applicants: number;
  shortlisted: number;
  offered: number;
  daysToDeadline: number;
}

/** Full posting view — `company` is the expanded record, not a name string. */
export interface JobDetail {
  id: string;
  title: string;
  type: JobListItem['type'];
  status: JobListItem['status'];
  location: string;
  workMode: string | null;
  ctcMin: number;
  ctcMax: number;
  stipendPerMonth: number | null;
  minCgpa: number;
  maxBacklogs: number;
  allowedDepartments: string[];
  batches: number[];
  skills: string[];
  openings: number;
  bondMonths: number | null;
  deadline: string;
  postedAt: string;
  tier?: string | null;
  industry?: string | null;
  applicants: number;
  description: string;
  eligibleCount: number;
  funnel: { status: ApplicationStatus; count: number }[];
  company: { id: string; name: string; industry: string | null; tier: string | null; website: string | null; description: string | null; hrName: string | null; hrEmail: string | null; hqCity: string | null };
  topCandidates: {
    applicationId: string;
    studentId: string;
    name: string;
    rollNo: string;
    department: string;
    cgpa: number;
    matchScore: number | null;
    atsScore: number | null;
    status: ApplicationStatus;
    aiSummary: string | null;
    matchedSkills: string[];
    missingSkills: string[];
  }[];
}

export interface Application {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  source: string;
  matchScore: number | null;
  atsScore: number | null;
  aiSummary: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  coverNote: string | null;
  student: {
    id: string;
    name: string;
    email: string;
    rollNo: string;
    department: string;
    cgpa: number;
    skills: string[];
  };
  job: {
    id: string;
    title: string;
    company: string;
    tier: string | null;
    type: string;
    ctcMax: number;
    location: string;
  };
  interviews: {
    id: string;
    round: number;
    name: string;
    scheduledAt: string;
    durationMins: number;
    mode: string;
    meetingLink: string | null;
    interviewer: string | null;
    result: string;
    feedback: string | null;
    score: number | null;
  }[];
  offer: {
    id: string;
    companyName: string;
    role: string;
    ctc: number;
    location: string | null;
    accepted: boolean;
    offerDate: string;
  } | null;
}

export interface PipelineColumn {
  status: ApplicationStatus;
  count: number;
  cards: {
    id: string;
    studentName: string;
    rollNo: string;
    department: string;
    jobTitle: string;
    company: string;
    ctc: number;
    matchScore: number | null;
    appliedAt: string;
    nextInterview: string | null;
  }[];
}

export interface AnalyticsOverview {
  batch: number | 'all';
  headline: {
    totalStudents: number;
    placed: number;
    placementRate: number;
    avgCtc: number;
    medianCtc: number;
    highestCtc: number;
    totalOffers: number;
    acceptedOffers: number;
    activeJobs: number;
    totalJobs: number;
    companies: number;
    applications: number;
    interviews: number;
    avgApplicationsPerStudent: number;
    avgMatchScore: number;
  };
  byStatus: { status: PlacementStatus; count: number }[];
  funnel: { status: ApplicationStatus; count: number }[];
  byDepartment: {
    code: string;
    name: string;
    students: number;
    placed: number;
    placementRate: number;
    avgCtc: number;
    highestCtc: number;
  }[];
  topRecruiters: { company: string; offers: number; accepted: number; avgCtc: number; highestCtc: number }[];
  trend: { label: string; offers: number; applications: number }[];
  ctcBands: { band: string; count: number }[];
}

export interface StudentAnalytics {
  studentId: string;
  name: string;
  rollNo: string;
  department: string;
  batch: number;
  cgpa: number;
  backlogs: number;
  placementStatus: PlacementStatus;
  attendancePct: number;
  readiness: number;
  profileChecks: { label: string; done: boolean }[];
  stats: {
    applications: number;
    activeApplications: number;
    interviews: number;
    shortlisted: number;
    offers: number;
    avgMatchScore: number;
    bestMatchScore: number;
  };
  timeline: { type: 'application' | 'interview'; label: string; date: string; status: string }[];
  offers: { id: string; company: string; role: string; ctc: number; accepted: boolean; offerDate: string }[];
}

export interface AttendanceOverview {
  overallPct: number;
  totalMarked: number;
  breakdown: { status: string; count: number }[];
  courses: {
    courseId: string;
    code: string;
    title: string;
    semester: number;
    department: string;
    sessions: number;
    enrolled: number;
    attendancePct: number | null;
  }[];
  defaulters: { studentId: string; name: string; rollNo: string; department: string; attendancePct: number }[];
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  tier: string | null;
  hqCity: string | null;
  hrName: string | null;
  hrEmail: string | null;
  description: string | null;
  openJobs: number;
  totalJobs: number;
  offersMade: number;
  avgCtc: number | null;
  jobs: { id: string; title: string; status: string; ctcMax: number; deadline: string; openings: number }[];
}

export interface Department {
  id: string;
  code: string;
  name: string;
  hodName: string | null;
  students: number;
  courses: number;
  faculty: number;
  placed: number;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  credits: number;
  semester: number;
  department: string;
  departmentName: string;
  faculty: string;
  enrolled: number;
  sessions: number;
  description: string | null;
}

export interface CourseDetail extends Course {
  facultyEmail: string | null;
  recentSessions: { id: string; date: string; topic: string | null; records: number }[];
  roster: {
    enrollmentId: string;
    studentId: string;
    name: string;
    email: string;
    rollNo: string;
    cgpa: number;
    grade: string | null;
    marks: number | null;
    status: string;
    attendancePct: number | null;
  }[];
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'INFO' | 'PLACEMENT' | 'ACADEMIC' | 'ALERT' | 'AI';
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface AiMatch {
  id: string;
  name?: string | null;
  score: number;
  semanticScore: number;
  skillScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  rationale: string;
  eligible: boolean;
  blockers: string[];
  // Optional enrichment for job recommendations
  jobId?: string;
  title?: string;
  company?: string;
  tier?: string | null;
  ctcMax?: number;
  location?: string;
  type?: string;
  deadline?: string;
  applyUrl?: string;
}

export interface AiHealth {
  reachable: boolean;
  status: string;
  provider: string;
  indexSize: number;
  geminiEnabled?: boolean;
  version?: string;
  roundTripMs?: number;
  reason?: string;
}

export interface ChatResponse {
  answer: string;
  suggestedActions: string[];
  provider: string;
  latencyMs: number;
}

export interface AtsResult {
  score: number;
  verdict: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  sectionChecks: { section: string; present: boolean; note: string }[];
  suggestions: string[];
  latencyMs?: number;
}

export interface InterviewQuestion {
  question: string;
  category: string;
  difficulty: string;
  idealAnswer?: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
