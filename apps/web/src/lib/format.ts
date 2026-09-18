import type { ApplicationStatus, PlacementStatus, Role } from './types';

export const inr = (lpa: number) =>
  `₹${Number.isInteger(lpa) ? lpa : lpa.toFixed(1)} LPA`;

export const inrShort = (lpa: number) => `₹${lpa >= 100 ? Math.round(lpa) : lpa.toFixed(1)}L`;

export const percent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function relativeTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);

  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`;

  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days}d ago` : `in ${-days}d`;

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(input: string | Date, withTime = false): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const base = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return withTime ? `${base}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : base;
}

export function daysUntil(input: string | Date): number {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export const PLACEMENT_STATUS_META: Record<PlacementStatus, { label: string; tone: BadgeTone }> = {
  PLACED: { label: 'Placed', tone: 'success' },
  IN_PROCESS: { label: 'In process', tone: 'brand' },
  ELIGIBLE: { label: 'Eligible', tone: 'neutral' },
  NOT_ELIGIBLE: { label: 'Not eligible', tone: 'danger' },
  OPTED_OUT: { label: 'Opted out', tone: 'warning' },
};

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  APPLIED: { label: 'Applied', tone: 'neutral' },
  UNDER_REVIEW: { label: 'Under review', tone: 'info' },
  SHORTLISTED: { label: 'Shortlisted', tone: 'brand' },
  INTERVIEW_SCHEDULED: { label: 'Interview scheduled', tone: 'warning' },
  INTERVIEWED: { label: 'Interviewed', tone: 'info' },
  OFFERED: { label: 'Offered', tone: 'success' },
  REJECTED: { label: 'Not selected', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'muted' },
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'Full time',
  INTERNSHIP: 'Internship',
  INTERNSHIP_PPO: 'Internship + PPO',
  PART_TIME: 'Part time',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  PLACEMENT_OFFICER: 'Placement Officer',
  FACULTY: 'Faculty',
  STUDENT: 'Student',
};

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

/** Score → colour ramp used across match score, ATS score and readiness. */
export function scoreTone(score: number): { tone: BadgeTone; bar: string; text: string } {
  if (score >= 80) return { tone: 'success', bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (score >= 65) return { tone: 'brand', bar: 'bg-brand-500', text: 'text-brand-700' };
  if (score >= 50) return { tone: 'warning', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { tone: 'danger', bar: 'bg-rose-500', text: 'text-rose-700' };
}

export const formatNumber = (n: number) => new Intl.NumberFormat('en-IN').format(n);

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
