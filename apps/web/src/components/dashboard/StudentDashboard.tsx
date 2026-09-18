'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { APPLICATION_STATUS_META, formatDate, inr, relativeTime, scoreTone } from '@/lib/format';
import { AreaChart, DonutChart } from '../ui/Charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  ProgressBar,
  ScoreRing,
  SectionTitle,
  StatCard,
  Tooltip,
} from '../ui/Primitives';
import {
  IconBriefcase,
  IconCalendar,
  IconCheck,
  IconSparkles,
  IconTarget,
  IconTrend,
  IconX,
} from '../ui/Icons';

const STATUS_COLORS: Record<string, string> = {
  APPLIED: '#94a3b8',
  UNDER_REVIEW: '#0ea5e9',
  SHORTLISTED: '#6366f1',
  INTERVIEW_SCHEDULED: '#f59e0b',
  INTERVIEWED: '#8b5cf6',
  OFFERED: '#10b981',
  REJECTED: '#f43f5e',
  WITHDRAWN: '#cbd5e1',
};

export function StudentDashboard() {
  const { user } = useAuth();
  const studentId = user?.student?.id;

  const analytics = useAsync(() => api.studentAnalytics(studentId!), [studentId]);
  const recommendations = useAsync(() => api.aiRecommendations(), []);
  const applications = useAsync(() => api.applications({ pageSize: 6 }), []);
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  const apply = async (jobId: string, company: string) => {
    setApplying(jobId);
    setAppliedNotice(null);
    try {
      const result = await api.apply(jobId);
      setAppliedNotice(
        `Applied to ${company}${result.matchScore !== null ? ` · AI match score ${result.matchScore}/100` : ''}`,
      );
      recommendations.reload();
      applications.reload();
      analytics.reload();
    } catch (err) {
      setAppliedNotice(err instanceof Error ? err.message : 'Could not apply right now.');
    } finally {
      setApplying(null);
    }
  };

  if (!studentId) {
    return <EmptyState title="Student profile not linked" description="Ask the placement cell to link your student record to this account." />;
  }

  const stats = analytics.data?.stats;
  const readiness = analytics.data?.readiness ?? 0;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              {user?.student?.departmentCode} · Batch {user?.student?.batch} · {user?.student?.rollNo}
            </p>
            <h1 className="mt-1 text-xl font-bold">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              {stats?.activeApplications
                ? `${stats.activeApplications} application(s) in flight. `
                : 'No active applications yet — start with the AI recommendations below. '}
              {stats?.interviews ? `${stats.interviews} interview round(s) so far.` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/placements">
                <Button size="sm" variant="secondary" className="border-white/25 bg-white/15 text-white hover:bg-white/25">
                  Browse openings
                </Button>
              </Link>
              <Link href="/ai-studio">
                <Button size="sm" variant="secondary" className="border-white/25 bg-white/15 text-white hover:bg-white/25" icon={<IconSparkles width={14} height={14} />}>
                  AI studio
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-5 rounded-xl bg-white/12 px-5 py-4 backdrop-blur">
            <div className="text-center">
              <ScoreRing score={readiness} size={72} label="Readiness" />
            </div>
            <div className="text-xs text-white/85">
              <p className="font-semibold text-white">Profile readiness</p>
              <p className="mt-0.5 max-w-[10rem] leading-relaxed">
                {readiness >= 80
                  ? 'Excellent — recruiters see a complete profile.'
                  : 'Complete the checklist below to improve recruiter visibility.'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {appliedNotice ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-800">
          <span>{appliedNotice}</span>
          <button onClick={() => setAppliedNotice(null)} className="text-brand-500 hover:text-brand-700" aria-label="Dismiss">
            <IconX width={15} height={15} />
          </button>
        </div>
      ) : null}

      {/* ----------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications" value={stats?.applications ?? '—'} hint={`${stats?.activeApplications ?? 0} active`} icon={<IconBriefcase width={17} height={17} />} />
        <StatCard label="Interviews" value={stats?.interviews ?? '—'} hint={`${stats?.shortlisted ?? 0} shortlisted`} icon={<IconCalendar width={17} height={17} />} tone="info" />
        <StatCard
          label="Best match score"
          value={stats?.bestMatchScore ? `${stats.bestMatchScore}` : '—'}
          hint={stats?.avgMatchScore ? `averaging ${stats.avgMatchScore}/100` : 'AI-scored on apply'}
          icon={<IconTarget width={17} height={17} />}
          tone="brand"
        />
        <StatCard
          label="Attendance"
          value={analytics.data ? `${analytics.data.attendancePct}%` : '—'}
          hint={(analytics.data?.attendancePct ?? 0) >= 75 ? 'Above the 75% requirement' : 'Below the 75% requirement'}
          icon={<IconCheck width={17} height={17} />}
          tone={(analytics.data?.attendancePct ?? 0) >= 75 ? 'success' : 'danger'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* -------------------------------------------- AI recommendations */}
        <div className="xl:col-span-2">
          <SectionTitle
            title="AI-recommended openings"
            subtitle="Ranked by semantic fit, skill overlap and eligibility"
            action={
              <Link href="/placements" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                View all →
              </Link>
            }
          />

          <Card>
            {recommendations.loading ? (
              <LoadingBlock rows={4} />
            ) : recommendations.error ? (
              <ErrorState message={recommendations.error} onRetry={recommendations.reload} />
            ) : !recommendations.data?.recommendations.length ? (
              <EmptyState
                title="No open roles match your profile yet"
                description="New drives are posted through the season. Check back soon or ask the copilot what to improve."
                icon={<IconBriefcase />}
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {recommendations.data.recommendations.slice(0, 5).map((match) => {
                  const tone = scoreTone(match.score);
                  return (
                    <li key={match.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/placements/${match.jobId}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
                              {match.title}
                            </Link>
                            <Badge tone="neutral">{match.tier ?? 'Company'}</Badge>
                            {match.eligible ? <Badge tone="success">Eligible</Badge> : <Badge tone="danger">Not eligible</Badge>}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {match.company} · {match.location} · up to {inr(match.ctcMax ?? 0)} · closes {formatDate(match.deadline ?? '')}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-600">{match.rationale}</p>

                          {match.matchedSkills.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {match.matchedSkills.slice(0, 5).map((skill) => (
                                <span key={skill} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                  {skill}
                                </span>
                              ))}
                              {match.missingSkills.slice(0, 3).map((skill) => (
                                <span key={skill} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500 line-through">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Tooltip content={`Semantic ${match.semanticScore} · Skills ${match.skillScore}`}>
                            <div className="text-right">
                              <span className={`text-lg font-bold tabular-nums ${tone.text}`}>{match.score}</span>
                              <span className="text-xs text-ink-400">/100</span>
                            </div>
                          </Tooltip>
                          <Button
                            size="sm"
                            disabled={!match.eligible || applying !== null}
                            loading={applying === match.jobId}
                            onClick={() => match.jobId && void apply(match.jobId, match.company ?? '')}
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                      {match.eligible ? null : (
                        <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
                          {match.blockers.join(' · ')}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* -------------------------------------------------- side column */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Profile checklist" subtitle="What recruiters can see" icon={<IconCheck width={16} height={16} />} />
            {analytics.loading ? (
              <LoadingBlock rows={3} />
            ) : (
              <ul className="space-y-2.5 p-4">
                {(analytics.data?.profileChecks ?? []).map((check) => (
                  <li key={check.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        check.done ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400'
                      }`}
                    >
                      {check.done ? <IconCheck width={12} height={12} /> : <IconX width={12} height={12} />}
                    </span>
                    <span className={check.done ? 'text-ink-600' : 'font-medium text-ink-800'}>{check.label}</span>
                  </li>
                ))}
                <li className="pt-1">
                  <ProgressBar value={readiness} tone={scoreTone(readiness).bar} showLabel />
                </li>
                <li>
                  <Link href="/profile">
                    <Button variant="secondary" size="sm" className="w-full">
                      Edit profile
                    </Button>
                  </Link>
                </li>
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Application mix" subtitle={`${stats?.applications ?? 0} total applications`} icon={<IconTrend width={16} height={16} />} />
            <div className="p-4">
              {applications.loading ? (
                <LoadingBlock rows={2} />
              ) : !applications.data?.items.length ? (
                <p className="py-4 text-center text-sm text-ink-400">No applications yet</p>
              ) : (
                <DonutChart
                  size={150}
                  thickness={18}
                  centerValue={String(stats?.applications ?? 0)}
                  centerLabel="applications"
                  data={Object.entries(
                    applications.data.items.reduce<Record<string, number>>((acc, app) => {
                      acc[app.status] = (acc[app.status] ?? 0) + 1;
                      return acc;
                    }, {}),
                  ).map(([status, count]) => ({
                    label: APPLICATION_STATUS_META[status as keyof typeof APPLICATION_STATUS_META]?.label ?? status,
                    value: count,
                    color: STATUS_COLORS[status] ?? '#94a3b8',
                  }))}
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ----------------------------------------------------- timeline */}
        <Card>
          <CardHeader title="Recent activity" subtitle="Applications and interviews" icon={<IconCalendar width={16} height={16} />} />
          {analytics.loading ? (
            <LoadingBlock rows={4} />
          ) : !analytics.data?.timeline.length ? (
            <EmptyState title="No activity yet" description="Apply to a posting to start your timeline." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {analytics.data.timeline.slice(0, 7).map((event, index) => (
                <li key={`${event.label}-${index}`} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      event.type === 'interview' ? 'bg-amber-500' : 'bg-brand-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{event.label}</p>
                    <p className="text-xs text-ink-500">
                      {event.type === 'interview' ? 'Interview' : 'Application'} · {relativeTime(event.date)}
                      {event.status ? ` · ${event.status.replace(/_/g, ' ').toLowerCase()}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------------------ offers */}
        <Card>
          <CardHeader title="Offers" subtitle="Accept or decline from Applications" icon={<IconBriefcase width={16} height={16} />} />
          {analytics.loading ? (
            <LoadingBlock rows={2} />
          ) : !analytics.data?.offers.length ? (
            <EmptyState
              title="No offers yet"
              description="Keep applying — your best match score improves as your profile fills out."
              icon={<IconBriefcase />}
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {analytics.data.offers.map((offer) => (
                <li key={offer.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{offer.company}</p>
                      <p className="text-xs text-ink-500">
                        {offer.role} · offered {relativeTime(offer.offerDate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-ink-900">{inr(offer.ctc)}</p>
                      <Badge tone={offer.accepted ? 'success' : 'warning'}>{offer.accepted ? 'Accepted' : 'Action needed'}</Badge>
                    </div>
                  </div>
                </li>
              ))}
              <li className="p-3">
                <Link href="/applications">
                  <Button variant="secondary" size="sm" className="w-full">
                    Manage offers
                  </Button>
                </Link>
              </li>
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Attendance sparkline is intentionally small — used inside the attendance page too. */
export function AttendanceTrend({ values }: { values: number[] }) {
  return (
    <AreaChart
      data={values.map((value, index) => ({ label: `W${index + 1}`, value }))}
      height={160}
      primaryLabel="Attendance %"
    />
  );
}
