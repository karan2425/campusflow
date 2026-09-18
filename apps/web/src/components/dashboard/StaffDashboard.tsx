'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useRoleFlags } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { APPLICATION_STATUS_META, formatDate, inr, percent, relativeTime } from '@/lib/format';
import { AreaChart, BreakdownBars, DonutChart, FunnelChart } from '../ui/Charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  ProgressBar,
  SectionTitle,
  StatCard,
} from '../ui/Primitives';
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconRefresh,
  IconSparkles,
  IconTarget,
  IconTrend,
  IconUsers,
} from '../ui/Icons';

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
};

const PLACEMENT_COLORS: Record<string, string> = {
  PLACED: '#10b981',
  IN_PROCESS: '#6366f1',
  ELIGIBLE: '#94a3b8',
  NOT_ELIGIBLE: '#f43f5e',
  OPTED_OUT: '#f59e0b',
};

export function StaffDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useRoleFlags();
  const analytics = useAsync(() => api.analytics(), []);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const syncIndex = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await api.aiSyncIndex();
      setSyncNotice(`FAISS index rebuilt · ${result.indexed} candidates indexed in ${result.dimension} dimensions (${result.latencyMs} ms)`);
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Index sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (analytics.loading) return <LoadingBlock rows={6} label="Loading placement analytics" />;
  if (analytics.error) return <ErrorState message={analytics.error} onRetry={analytics.reload} />;
  if (!analytics.data) return null;

  const { headline, byDepartment, trend, funnel, topRecruiters, byStatus, ctcBands } = analytics.data;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">
            Placement season overview
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {headline.totalStudents} students tracked · {headline.activeJobs} active drives · {headline.companies} recruiters onboarded
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={syncing}
            onClick={() => void syncIndex()}
            icon={<IconRefresh width={14} height={14} />}
          >
            Rebuild AI index
          </Button>
          <Link href="/placements">
            <Button size="sm" icon={<IconBriefcase width={14} height={14} />}>
              Manage drives
            </Button>
          </Link>
        </div>
      </div>

      {syncNotice ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-800">{syncNotice}</div>
      ) : null}

      {/* ----------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Placement rate"
          value={percent(headline.placementRate)}
          hint={`${headline.placed} of ${headline.totalStudents} students placed`}
          icon={<IconTarget width={17} height={17} />}
          tone="success"
        />
        <StatCard
          label="Average CTC"
          value={inr(headline.avgCtc)}
          hint={`median ${inr(headline.medianCtc)} · highest ${inr(headline.highestCtc)}`}
          icon={<IconTrend width={17} height={17} />}
          tone="brand"
        />
        <StatCard
          label="Offers rolled out"
          value={headline.totalOffers}
          hint={`${headline.acceptedOffers} accepted (${headline.totalOffers ? Math.round((headline.acceptedOffers / headline.totalOffers) * 100) : 0}% acceptance)`}
          icon={<IconBriefcase width={17} height={17} />}
          tone="info"
        />
        <StatCard
          label="Applications"
          value={headline.applications}
          hint={`${headline.avgApplicationsPerStudent} per student on average`}
          icon={<IconUsers width={17} height={17} />}
          tone="warning"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ------------------------------------------------------ trend */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Offers vs applications"
            subtitle="Last 8 months"
            icon={<IconTrend width={16} height={16} />}
            action={<Badge tone="brand">avg AI match {headline.avgMatchScore}/100</Badge>}
          />
          <div className="p-4">
            <AreaChart
              data={trend.map((point) => ({ label: point.label, value: point.offers, secondary: point.applications }))}
              height={230}
              primaryLabel="Offers"
              secondaryLabel="Applications"
            />
          </div>
        </Card>

        {/* ------------------------------------------------ distribution */}
        <Card>
          <CardHeader title="Student placement status" subtitle="Live across all batches" icon={<IconUsers width={16} height={16} />} />
          <div className="p-4">
            <DonutChart
              size={160}
              thickness={20}
              centerValue={percent(headline.placementRate, 0)}
              centerLabel="placed"
              data={byStatus.map((entry) => ({
                label: entry.status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
                value: entry.count,
                color: PLACEMENT_COLORS[entry.status] ?? '#94a3b8',
              }))}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------ funnel */}
        <Card>
          <CardHeader
            title="Hiring funnel"
            subtitle={`${headline.applications} applications across all drives`}
            icon={<IconTarget width={16} height={16} />}
            action={
              <Link href="/pipeline" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Open pipeline →
              </Link>
            }
          />
          <div className="p-4">
            <FunnelChart data={funnel.map((stage) => ({ ...stage, label: STAGE_LABELS[stage.status] ?? stage.status }))} />
          </div>
        </Card>

        {/* -------------------------------------------------- department */}
        <Card>
          <CardHeader title="Department performance" subtitle="Placement rate by branch" icon={<IconBuilding width={16} height={16} />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2 text-left">Branch</th>
                  <th className="px-3 py-2 text-right">Placed</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Avg CTC</th>
                  <th className="px-4 py-2 text-right">Top</th>
                </tr>
              </thead>
              <tbody>
                {byDepartment.map((dept) => (
                  <tr key={dept.code} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-ink-800">{dept.code}</span>
                      <span className="ml-2 text-xs text-ink-400">{dept.students} students</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">
                      {dept.placed}/{dept.students}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-24">
                          <ProgressBar value={dept.placementRate} tone={dept.placementRate >= 70 ? 'bg-emerald-500' : dept.placementRate >= 45 ? 'bg-brand-500' : 'bg-amber-500'} />
                        </span>
                        <span className="w-12 text-right text-xs font-semibold tabular-nums text-ink-800">{dept.placementRate}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{inr(dept.avgCtc)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{inr(dept.highestCtc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* -------------------------------------------------- recruiters */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Top recruiters"
            subtitle="By offers rolled out this season"
            icon={<IconBuilding width={16} height={16} />}
            action={
              <Link href="/companies" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                All companies →
              </Link>
            }
          />
          {topRecruiters.length === 0 ? (
            <EmptyState title="No offers recorded yet" description="Once drives conclude, recruiter rankings appear here." />
          ) : (
            <div className="divide-y divide-ink-100">
              {topRecruiters.slice(0, 6).map((recruiter, index) => (
                <div key={recruiter.company} className="flex items-center gap-4 px-4 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{recruiter.company}</p>
                    <p className="text-xs text-ink-500">
                      {recruiter.offers} offer(s) · {recruiter.accepted} accepted · avg {inr(recruiter.avgCtc)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-ink-900">{inr(recruiter.highestCtc)}</p>
                    <p className="text-[11px] text-ink-400">highest</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------- CTC bands */}
        <Card>
          <CardHeader title="CTC distribution" subtitle="Accepted and pending offers" icon={<IconTrend width={16} height={16} />} />
          <div className="p-4">
            <BreakdownBars
              data={ctcBands.map((band) => ({ label: band.band, value: band.count }))}
              colorFor={(value, index) => ['#94a3b8', '#60a5fa', '#6366f1', '#8b5cf6', '#10b981'][index] ?? '#6366f1'}
            />
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------- next actions */}
      <div className="grid gap-5 lg:grid-cols-2">
        <UpcomingInterviews />
        <RecentApplications />
      </div>

      {/* -------------------------------------------------------- AI activity */}
      {isAdmin || user?.role === 'PLACEMENT_OFFICER' ? <AiActivityPanel /> : null}
    </div>
  );
}

function UpcomingInterviews() {
  const { data, loading, error, reload } = useAsync(() => api.applications({ status: 'INTERVIEW_SCHEDULED', pageSize: 6 }), []);

  const upcoming = (data?.items ?? [])
    .flatMap((application) =>
      application.interviews
        .filter((interview) => interview.result === 'PENDING' && new Date(interview.scheduledAt) > new Date())
        .map((interview) => ({ application, interview })),
    )
    .sort((a, b) => new Date(a.interview.scheduledAt).getTime() - new Date(b.interview.scheduledAt).getTime())
    .slice(0, 6);

  return (
    <Card>
      <CardHeader
        title="Upcoming interviews"
        subtitle="Next scheduled rounds across all drives"
        icon={<IconCalendar width={16} height={16} />}
        action={
          <Link href="/applications" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            All applications →
          </Link>
        }
      />
      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : upcoming.length === 0 ? (
        <EmptyState title="No interviews scheduled" description="Schedule rounds from the pipeline view." icon={<IconCalendar />} />
      ) : (
        <ul className="divide-y divide-ink-100">
          {upcoming.map(({ application, interview }) => (
            <li key={interview.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-800">{application.student.name}</p>
                <p className="truncate text-xs text-ink-500">
                  {application.job.company} · {interview.name} · round {interview.round}
                </p>
                <p className="mt-0.5 text-xs font-medium text-amber-700">{formatDate(interview.scheduledAt, true)}</p>
              </div>
              <Badge tone="warning">{interview.mode.toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentApplications() {
  const { data, loading, error, reload } = useAsync(() => api.applications({ pageSize: 6 }), []);

  return (
    <Card>
      <CardHeader
        title="Latest applications"
        subtitle="Across every active drive"
        icon={<IconBriefcase width={16} height={16} />}
        action={
          <Link href="/applications" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            View all →
          </Link>
        }
      />
      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.items.length ? (
        <EmptyState title="No applications yet" />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.items.map((application) => (
            <li key={application.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-800">
                  {application.student.name}
                  <span className="ml-1.5 text-xs font-normal text-ink-400">{application.student.department}</span>
                </p>
                <p className="truncate text-xs text-ink-500">
                  {application.job.company} · {application.job.title} · {relativeTime(application.appliedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {application.matchScore !== null ? (
                  <span className="text-xs font-bold tabular-nums text-brand-700">{application.matchScore}</span>
                ) : null}
                <Badge tone={APPLICATION_STATUS_META[application.status].tone}>
                  {APPLICATION_STATUS_META[application.status].label}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AiActivityPanel() {
  const { data, loading } = useAsync(() => api.aiInsights(), []);

  return (
    <Card>
      <CardHeader
        title="AI usage telemetry"
        subtitle="Every model call is logged for audit and cost tracking"
        icon={<IconSparkles width={16} height={16} />}
        action={
          data ? (
            <Badge tone="brand">
              {data.totals.interactions} calls · avg {data.totals.avgLatencyMs} ms
            </Badge>
          ) : null
        }
      />
      {loading ? (
        <LoadingBlock rows={3} />
      ) : (
        <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">By capability</p>
            <BreakdownBars
              data={(data?.byKind ?? []).map((entry) => ({
                label: entry.kind.replace(/_/g, ' ').toLowerCase(),
                value: entry.count,
              }))}
            />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Recent calls</p>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {(data?.recent ?? []).slice(0, 8).map((call) => (
                <li key={call.id} className="rounded-lg border border-ink-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={call.provider === 'gemini' ? 'brand' : 'muted'}>{call.kind.replace(/_/g, ' ').toLowerCase()}</Badge>
                    <span className="text-[11px] text-ink-400">
                      {call.latencyMs ? `${call.latencyMs} ms` : ''} · {relativeTime(call.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-ink-600">{call.prompt}</p>
                  <p className="text-[11px] text-ink-400">
                    {call.user} {call.role ? `· ${call.role.replace(/_/g, ' ').toLowerCase()}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
