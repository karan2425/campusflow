import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUS_META,
  daysUntil,
  formatDate,
  formatNumber,
  inr,
  inrShort,
  initials,
  percent,
  relativeTime,
  scoreTone,
  titleCase,
} from './format';
import {
  ATTENDANCE_BAND_LABEL,
  ATTENDANCE_THRESHOLD,
  attendanceBand,
  isStaffRole,
} from '@campusflow/shared';

describe('currency & number formatting', () => {
  it('renders whole and fractional LPA packages', () => {
    expect(inr(12)).toBe('₹12 LPA');
    expect(inr(8.5)).toBe('₹8.5 LPA');
  });

  it('abbreviates six-figure packages', () => {
    expect(inrShort(12.5)).toBe('₹12.5L');
    expect(inrShort(120)).toBe('₹120L');
  });

  it('groups large numbers in the Indian system', () => {
    expect(formatNumber(1500000)).toBe('15,00,000');
  });

  it('formats percentages to one decimal by default', () => {
    expect(percent(89.345)).toBe('89.3%');
    expect(percent(75, 0)).toBe('75%');
  });
});

describe('initials', () => {
  it('takes the first two name parts', () => {
    expect(initials('Aarav Sharma')).toBe('AS');
    expect(initials('Meera Raghunathan Iyer')).toBe('MR');
  });

  it('survives single names and extra whitespace', () => {
    expect(initials('  Priya  ')).toBe('P');
  });
});

describe('relativeTime', () => {
  it('describes the recent past and near future', () => {
    const now = Date.now();
    // sub-30s rounds down to zero whole minutes
    expect(relativeTime(new Date(now - 10_000))).toBe('just now');
    expect(relativeTime(new Date(now - 5 * 60_000))).toBe('5m ago');
    expect(relativeTime(new Date(now - 3 * 3_600_000))).toBe('3h ago');
    expect(relativeTime(new Date(now + 2 * 3_600_000))).toBe('in 2h');
  });

  it('falls back to an absolute date beyond a month', () => {
    const old = new Date('2025-01-05T00:00:00Z');
    expect(relativeTime(old)).toMatch(/2025/);
  });
});

describe('daysUntil', () => {
  it('rounds up to whole days so a deadline today still reads as open', () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000);
    expect(daysUntil(inThreeDays)).toBeGreaterThanOrEqual(3);
    expect(daysUntil(new Date(Date.now() + 60_000))).toBe(1);
  });
});

describe('formatDate', () => {
  it('includes the time only when asked', () => {
    const iso = '2026-03-14T09:30:00';
    expect(formatDate(iso)).toMatch(/2026/);
    expect(formatDate(iso)).not.toMatch(/:/);
    expect(formatDate(iso, true)).toMatch(/:/);
  });
});

describe('scoreTone', () => {
  it('maps a score onto the shared colour ramp', () => {
    expect(scoreTone(92).tone).toBe('success');
    expect(scoreTone(70).tone).toBe('brand');
    expect(scoreTone(55).tone).toBe('warning');
    expect(scoreTone(12).tone).toBe('danger');
  });
});

describe('titleCase', () => {
  it('normalises enum-ish strings', () => {
    expect(titleCase('INTERNSHIP_PPO')).toBe('Internship Ppo');
    expect(titleCase('under review')).toBe('Under Review');
  });
});

describe('status metadata', () => {
  it('labels every application status', () => {
    expect(APPLICATION_STATUS_META.OFFERED.label).toBe('Offered');
    expect(APPLICATION_STATUS_META.WITHDRAWN.tone).toBe('muted');
  });
});

describe('attendance thresholds (shared package)', () => {
  it('is the single source of truth for the 75/65 bands', () => {
    expect(ATTENDANCE_THRESHOLD).toBe(75);
    expect(attendanceBand(88)).toBe('safe');
    expect(attendanceBand(70)).toBe('borderline');
    expect(attendanceBand(40)).toBe('at-risk');
    expect(ATTENDANCE_BAND_LABEL['at-risk']).toBe('at risk');
  });
});

describe('isStaffRole', () => {
  it('separates staff from students', () => {
    expect(isStaffRole('PLACEMENT_OFFICER')).toBe(true);
    expect(isStaffRole('FACULTY')).toBe(true);
    expect(isStaffRole('STUDENT')).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});
