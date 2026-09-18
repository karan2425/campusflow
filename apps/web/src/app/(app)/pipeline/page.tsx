'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { APPLICATION_STATUS_META, formatDate, inr, scoreTone } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, ProgressBar, Select, StatCard } from '@/components/ui/Primitives';
import { IconBriefcase, IconRefresh, IconTarget, IconUsers } from '@/components/ui/Icons';
import type { PipelineColumn } from '@/lib/types';

const COLUMN_TONES: Record<string, string> = {
  APPLIED: 'border-t-ink-400',
  UNDER_REVIEW: 'border-t-sky-500',
  SHORTLISTED: 'border-t-brand-500',
  INTERVIEW_SCHEDULED: 'border-t-amber-500',
  INTERVIEWED: 'border-t-violet-500',
  OFFERED: 'border-t-emerald-500',
  REJECTED: 'border-t-rose-400',
};

/**
 * Kanban view of the hiring pipeline. Staff drag students through stages by
 * clicking the stage buttons on each card — a click model rather than HTML5
 * drag-and-drop, which is unusable on touch devices and inside iframes.
 */
export default function PipelinePage() {
  const searchParams = useSearchParams();
  const [jobId, setJobId] = useState(searchParams.get('jobId') ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const jobs = useAsync(() => api.jobs({ status: 'OPEN', pageSize: 50 }), []);
  const pipeline = useAsync(() => api.pipeline(jobId || undefined), [jobId]);

  const move = async (applicationId: string, status: string, studentName: string) => {
    setBusy(applicationId);
    setNotice(null);
    try {
      await api.updateApplicationStatus(applicationId, status);
      setNotice(`${studentName} moved to "${APPLICATION_STATUS_META[status as keyof typeof APPLICATION_STATUS_META].label}" — the student has been notified.`);
      pipeline.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not update the stage');
    } finally {
      setBusy(null);
    }
  };

  const columns = pipeline.data?.columns ?? [];
  const total = pipeline.data?.total ?? 0;
  const offered = columns.find((c) => c.status === 'OFFERED')?.count ?? 0;
  const activeStages = columns.filter((c) => !['OFFERED', 'REJECTED'].includes(c.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Hiring pipeline</h1>
          <p className="mt-1 text-sm text-ink-500">Move candidates through stages — students are notified on every change</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <Select label="Drive" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">All open drives</option>
              {(jobs.data?.items ?? []).map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.title}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" size="sm" onClick={pipeline.reload} icon={<IconRefresh width={14} height={14} />}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total applications" value={total} hint={jobId ? 'in this drive' : 'across all drives'} icon={<IconBriefcase width={17} height={17} />} />
        <StatCard label="In active stages" value={activeStages.reduce((sum, c) => sum + c.count, 0)} hint="applied → interviewed" icon={<IconUsers width={17} height={17} />} tone="info" />
        <StatCard label="Offers rolled out" value={offered} hint="awaiting or accepted" icon={<IconTarget width={17} height={17} />} tone="success" />
        <StatCard
          label="Conversion to offer"
          value={total ? `${Math.round((offered / total) * 100)}%` : '—'}
          hint="of all applications"
          icon={<IconTarget width={17} height={17} />}
          tone="brand"
        />
      </div>

      {notice ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-800">{notice}</div>
      ) : null}

      {pipeline.loading ? (
        <LoadingBlock rows={5} label="Loading pipeline" />
      ) : pipeline.error ? (
        <ErrorState message={pipeline.error} onRetry={pipeline.reload} />
      ) : total === 0 ? (
        <Card>
          <EmptyState title="No applications in this drive yet" description="Once students apply, they appear here as cards." icon={<IconBriefcase />} />
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <PipelineColumnView key={column.status} column={column} busy={busy} onMove={move} />
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineColumnView({
  column,
  busy,
  onMove,
}: {
  column: PipelineColumn;
  busy: string | null;
  onMove: (applicationId: string, status: string, studentName: string) => void;
}) {
  const meta = APPLICATION_STATUS_META[column.status];
  const nextStages: Record<string, string[]> = {
    APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
    UNDER_REVIEW: ['SHORTLISTED', 'REJECTED'],
    SHORTLISTED: ['INTERVIEW_SCHEDULED', 'REJECTED'],
    INTERVIEW_SCHEDULED: ['INTERVIEWED', 'REJECTED'],
    INTERVIEWED: ['OFFERED', 'REJECTED'],
    OFFERED: [],
    REJECTED: ['UNDER_REVIEW'],
  };
  const moves = nextStages[column.status] ?? [];

  return (
    <section className={`w-72 shrink-0 rounded-xl border border-t-4 border-ink-200 bg-white ${COLUMN_TONES[column.status] ?? 'border-t-ink-400'}`}>
      <header className="flex items-center justify-between border-b border-ink-100 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-ink-800">{meta.label}</h2>
        <Badge tone={meta.tone}>{column.count}</Badge>
      </header>

      <div className="max-h-[68vh] space-y-2.5 overflow-y-auto p-2.5">
        {column.cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-400">No candidates at this stage</p>
        ) : (
          column.cards.map((card) => (
            <article key={card.id} className="rounded-lg border border-ink-200 bg-white p-3 shadow-card transition-shadow hover:shadow-pop">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/students/${card.id.split('-')[0]}`} className="block truncate text-sm font-semibold text-ink-900">
                    {card.studentName}
                  </Link>
                  <p className="truncate text-[11px] text-ink-500">
                    {card.rollNo} · {card.department}
                  </p>
                </div>
                {card.matchScore !== null ? (
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${scoreTone(card.matchScore).text}`}>{card.matchScore}</span>
                ) : null}
              </div>

              <p className="mt-1.5 truncate text-xs font-medium text-ink-700">{card.company}</p>
              <p className="truncate text-[11px] text-ink-500">{card.jobTitle}</p>

              {card.nextInterview ? (
                <p className="mt-1.5 rounded bg-amber-50 px-1.5 py-1 text-[11px] font-medium text-amber-800">
                  Interview {formatDate(card.nextInterview)}
                </p>
              ) : null}

              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
                <span>{inr(card.ctc)}</span>
                <span>applied {new Date(card.appliedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>

              {card.matchScore !== null ? <ProgressBar className="mt-2" value={card.matchScore} tone={scoreTone(card.matchScore).bar} /> : null}

              {moves.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {moves.map((stage) => (
                    <button
                      key={stage}
                      disabled={busy === card.id}
                      onClick={() => onMove(card.id, stage, card.studentName)}
                      className={`rounded px-1.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        stage === 'REJECTED'
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : stage === 'OFFERED'
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-ink-100 text-ink-700 hover:bg-brand-100 hover:text-brand-800'
                      }`}
                    >
                      → {APPLICATION_STATUS_META[stage as keyof typeof APPLICATION_STATUS_META]?.label ?? stage}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
