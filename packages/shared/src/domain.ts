/**
 * Domain rules that must stay identical everywhere in CampusFlow.
 *
 * The same numbers are enforced server-side (apps/api/src/services/eligibility.ts
 * and apps/api/src/modules/attendance) — this module is the single place the UI
 * reads them from, so a threshold never drifts between screens.
 */

// ---------------------------------------------------------------- attendance

/** Minimum attendance percentage required to sit for placement drives. */
export const ATTENDANCE_THRESHOLD = 75;

/** Below this the student is formally a defaulter and is flagged to staff. */
export const ATTENDANCE_BORDERLINE = 65;

export type AttendanceBand = 'safe' | 'borderline' | 'at-risk';

export function attendanceBand(pct: number): AttendanceBand {
  if (pct >= ATTENDANCE_THRESHOLD) return 'safe';
  if (pct >= ATTENDANCE_BORDERLINE) return 'borderline';
  return 'at-risk';
}

export const ATTENDANCE_BAND_LABEL: Record<AttendanceBand, string> = {
  safe: 'safe',
  borderline: 'borderline',
  'at-risk': 'at risk',
};

export const ATTENDANCE_BAND_TONE: Record<AttendanceBand, 'success' | 'warning' | 'danger'> = {
  safe: 'success',
  borderline: 'warning',
  'at-risk': 'danger',
};

/** Tailwind background classes for attendance progress bars. */
export const ATTENDANCE_BAND_BAR: Record<AttendanceBand, string> = {
  safe: 'bg-emerald-500',
  borderline: 'bg-amber-500',
  'at-risk': 'bg-rose-500',
};

// ------------------------------------------------------------------ matching

/**
 * Hybrid match score weights — mirrored in apps/ai/app/matching.py.
 * 35% calibrated semantic similarity, 50% skill overlap, 15% package/fit.
 */
export const MATCH_WEIGHTS = {
  semantic: 0.35,
  skill: 0.5,
  fit: 0.15,
} as const;

/** Ineligible candidates are clamped to this ceiling so they never outrank a fit. */
export const INELIGIBLE_SCORE_CAP = 45;

export type ScoreTone = 'strong' | 'good' | 'fair' | 'weak';

export function scoreTone(score: number): ScoreTone {
  if (score >= 75) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 45) return 'fair';
  return 'weak';
}

// ------------------------------------------------------- placement readiness

/** Readiness checklist used on the student dashboard and profile page. */
export const READINESS_CHECKLIST = [
  { key: 'resume', label: 'Resume uploaded', weight: 25 },
  { key: 'skills', label: 'At least 4 skills listed', weight: 20 },
  { key: 'projects', label: 'A project on the profile', weight: 20 },
  { key: 'attendance', label: `Attendance ≥ ${ATTENDANCE_THRESHOLD}%`, weight: 20 },
  { key: 'github', label: 'GitHub or portfolio link', weight: 15 },
] as const;

export type ReadinessKey = (typeof READINESS_CHECKLIST)[number]['key'];

// ------------------------------------------------------------------ defaults

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Upload/parse limits shared by the resume tooling. */
export const MIN_RESUME_CHARS = 50;
export const MAX_RESUME_CHARS = 20_000;
