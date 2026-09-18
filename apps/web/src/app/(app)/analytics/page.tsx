'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { inr, percent } from '@/lib/format';
import { AreaChart, BreakdownBars, DonutChart, FunnelChart } from '@/components/ui/Charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  LoadingBlock,
  ProgressBar,
  SectionTitle,
  Select,
  StatCard,
} from '@/components/ui/Primitives';
import { IconAlert, IconBriefcase, IconBuilding, IconDownload, IconTarget, IconTrend, IconUsers } from '@/components/ui/Icons';

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
};

const STATUS_COLORS: Record<string, string> = {
  PLACED: '#10b981',
  IN_PROCESS: '#6366f1',
  ELIGIBLE: '#94a3b8',
  NOT_ELIGIBLE: '#f43f5e',
  OPTED_OUT: '#f59e0b',
};

export default function AnalyticsPage() {
  const [batch, setBatch] = useState('');
  const analytics = useAsync(() => api.analytics(batch ? Number(batch) : undefined), [batch]);

  if (analytics.loading) return <LoadingBlock rows={7} label="Computing placement analytics" />;
  if (analytics.error) return <ErrorState message={analytics.error} onRetry={analytics.reload} />;
  if (!analytics.data) return null;

  const { headline, byDepartment, trend, funnel, topRecruiters, byStatus, ctcBands } = analytics.data;
  const weakDepts = byDepartment.filter((d) => d.placementRate < 50 && d.students > 0);
  const unplaced = headline.totalStudents - headline.placed;

  const exportReport = () => {
    const lines = [
      'CampusFlow placement report',
      `Scope,batch ${batch || 'all'}`,
      `Generated,${new Date().toISOString()}`,
      '',
      'Metric,Value',
      `Total students,${headline.totalStudents}`,
      `Placed,${headline.placed}`,
      `Placement rate %,${headline.placementRate}`,
      `Average CTC (LPA),${headline.avgCtc}`,
      `Median CTC (LPA),${headline.medianCtc}`,
      `Highest CTC (LPA),${headline.highestCtc}`,
      `Offers,${headline.totalOffers}`,
      `Accepted offers,${headline.acceptedOffers}`,
      `Applications,${headline.applications}`,
      `Interviews,${headline.interviews}`,
      `Active openings,${headline.activeJobs}`,
      `Companies,${headline.companies}`,
      `Avg AI match score,${headline.avgMatchScore}`,
      '',
      'Branch,Students,Placed,Rate %,Avg CTC,Highest CTC',
      ...byDepartment.map((d) => `${d.code},${d.students},${d.placed},${d.placementRate},${d.avgCtc},${d.highestCtc}`),
      '',
      'Company,Offers,Accepted,Avg CTC,Highest CTC',
      ...topRecruiters.map((r) => `${r.company},${r.offers},${r.accepted},${r.avgCtc},${r.highestCtc}`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campusflow-placement-report-${batch || 'all'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Placement analytics</h1>
          <p className="mt-1 text-sm text-ink-500">
            Live figures computed from {headline.totalStudents} student records, {headline.applications} applications and{' '}
            {headline.totalOffers} offers
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Select label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">All batches</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </Select>
          </div>
          <Button variant="secondary" size="sm" onClick={exportReport} icon={<IconDownload width={14} height={14} />}>
            Export report
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------- headline KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Placement rate"
          value={percent(headline.placementRate)}
          hint={`${headline.placed} placed · ${unplaced} unplaced`}
          icon={<IconTarget width={17} height={17} />}
          tone="success"
        />
        <StatCard
          label="Average CTC"
          value={inr(headline.avgCtc)}
          hint={`median ${inr(headline.medianCtc)}`}
          icon={<IconTrend width={17} height={17} />}
          tone="brand"
        />
        <StatCard
          label="Highest package"
          value={inr(headline.highestCtc)}
          hint={`${headline.companies} recruiters engaged`}
          icon={<IconBuilding width={17} height={17} />}
          tone="info"
        />
        <StatCard
          label="Active drives"
          value={headline.activeJobs}
          hint={`${headline.totalJobs} posted this season`}
          icon={<IconBriefcase width={17} height={17} />}
          tone="warning"
        />
      </div>

      {/* ------------------------------------------------------- attention */}
      {weakDepts.length || headline.acceptedOffers < headline.totalOffers ? (
        <Card className="border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-600">
              <IconAlert width={18} height={18} />
            </span>
            <div className="space-y-1 text-sm text-amber-900">
              <p className="font-semibold">Points needing attention</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                {weakDepts.length ? (
                  <li>
                    {weakDepts.length} branch(es) below 50% placement: {weakDepts.map((d) => `${d.code} (${d.placementRate}%)`).join(', ')}.
                    Consider targeted drives or lower CGPA cut-offs for these branches.
                  </li>
                ) : null}
                {headline.acceptedOffers < headline.totalOffers ? (
                  <li>
                    {headline.totalOffers - headline.acceptedOffers} offer(s) still awaiting student response — follow up from the pipeline view.
                  </li>
                ) : null}
                {headline.avgMatchScore < 60 ? (
                  <li>
                    Average AI match score is {headline.avgMatchScore}/100. Profile quality (resume, skills) is the main lever —
                    run a resume clinic before the next drive.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ trend */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Offers and applications over time"
            subtitle="Monthly volume for the trailing 8 months"
            icon={<IconTrend width={16} height={16} />}
          />
          <div className="p-4">
            <AreaChart
              data={trend.map((point) => ({ label: point.label, value: point.offers, secondary: point.applications }))}
              height={250}
              primaryLabel="Offers"
              secondaryLabel="Applications"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Offer acceptance" subtitle={`${headline.acceptedOffers} of ${headline.totalOffers} accepted`} icon={<IconTarget width={16} height={16} />} />
          <div className="p-4">
            <DonutChart
              size={150}
              thickness={20}
              centerValue={headline.totalOffers ? `${Math.round((headline.acceptedOffers / headline.totalOffers) * 100)}%` : '—'}
              centerLabel="acceptance"
              data={[
                { label: 'Accepted', value: headline.acceptedOffers, color: '#10b981' },
                { label: 'Awaiting response', value: headline.totalOffers - headline.acceptedOffers, color: '#f59e0b' },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* ----------------------------------------------------- dept + ctc */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Branch-wise placement rate" subtitle="Compared against branch headcount" icon={<IconUsers width={16} height={16} />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2 text-left">Branch</th>
                  <th className="px-3 py-2 text-left">Placement rate</th>
                  <th className="px-3 py-2 text-right">Avg CTC</th>
                  <th className="px-4 py-2 text-right">Highest</th>
                </tr>
              </thead>
              <tbody>
                {byDepartment.map((dept) => (
                  <tr key={dept.code} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-800">{dept.code}</p>
                      <p className="text-[11px] text-ink-400">
                        {dept.placed}/{dept.students} placed
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={dept.placementRate}
                          tone={dept.placementRate >= 70 ? 'bg-emerald-500' : dept.placementRate >= 50 ? 'bg-brand-500' : 'bg-amber-500'}
                        />
                        <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-ink-800">{dept.placementRate}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{inr(dept.avgCtc)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-ink-800">{inr(dept.highestCtc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Hiring funnel" subtitle="Application → offer conversion" icon={<IconTarget width={16} height={16} />} />
            <div className="p-4">
              <FunnelChart data={funnel.map((stage) => ({ ...stage, label: STAGE_LABELS[stage.status] ?? stage.status }))} />
            </div>
          </Card>

          <Card>
            <CardHeader title="CTC bands" subtitle="Distribution of offers rolled out" icon={<IconTrend width={16} height={16} />} />
            <div className="p-4">
              <BreakdownBars
                data={ctcBands.map((band) => ({ label: band.band, value: band.count }))}
                colorFor={(_, index) => ['#94a3b8', '#60a5fa', '#6366f1', '#8b5cf6', '#10b981'][index] ?? '#6366f1'}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------- recruiters */}
      <Card>
        <SectionTitle
          title="Recruiter leaderboard"
          subtitle="Ranked by offers rolled out this season"
          action={
            <Link href="/companies" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              Company profiles →
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5 text-left">#</th>
                <th className="px-4 py-2.5 text-left">Company</th>
                <th className="px-4 py-2.5 text-right">Offers</th>
                <th className="px-4 py-2.5 text-right">Accepted</th>
                <th className="px-4 py-2.5 text-right">Avg CTC</th>
                <th className="px-4 py-2.5 text-right">Highest</th>
                <th className="px-4 py-2.5 text-left">Acceptance</th>
              </tr>
            </thead>
            <tbody>
              {topRecruiters.map((recruiter, index) => (
                <tr key={recruiter.company} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3 text-xs font-bold text-ink-400">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold text-ink-800">{recruiter.company}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-700">{recruiter.offers}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-700">{recruiter.accepted}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-700">{inr(recruiter.avgCtc)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-ink-900">{inr(recruiter.highestCtc)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={recruiter.offers ? (recruiter.accepted / recruiter.offers) * 100 : 0}
                        tone="bg-emerald-500"
                      />
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-500">
                        {recruiter.offers ? Math.round((recruiter.accepted / recruiter.offers) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Student status distribution" subtitle="Where every student stands right now" icon={<IconUsers width={16} height={16} />} />
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            {byStatus.map((entry) => (
              <div key={entry.status}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink-700">{entry.status.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="tabular-nums text-ink-500">
                    <span className="font-bold text-ink-900">{entry.count}</span> / {headline.totalStudents} (
                    {headline.totalStudents ? Math.round((entry.count / headline.totalStudents) * 100) : 0}%)
                  </span>
                </div>
                <ProgressBar value={headline.totalStudents ? (entry.count / headline.totalStudents) * 100 : 0} tone="bg-brand-500" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center">
            <DonutChart
              size={200}
              thickness={26}
              centerValue={String(headline.totalStudents)}
              centerLabel="students tracked"
              data={byStatus.map((entry) => ({
                label: entry.status.replace(/_/g, ' ').toLowerCase(),
                value: entry.count,
                color: STATUS_COLORS[entry.status] ?? '#94a3b8',
              }))}
            />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs text-ink-500">
        <span className="inline-flex items-center gap-2">
          <Badge tone="brand">avg AI match {headline.avgMatchScore}/100</Badge>
          <Badge tone="info">{headline.interviews} interview rounds</Badge>
          <Badge tone="neutral">{headline.avgApplicationsPerStudent} applications / student</Badge>
        </span>
        <Link href="/ai-studio" className="font-semibold text-brand-600 hover:text-brand-700">
          Open the AI studio to act on this data →
        </Link>
      </div>
    </div>
  );
}
