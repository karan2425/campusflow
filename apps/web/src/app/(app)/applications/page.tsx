'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth, useRoleFlags } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { APPLICATION_STATUS_META, formatDate, inr, relativeTime, scoreTone } from '@/lib/format';
import { DataTable, Pagination, type Column } from '@/components/ui/Table';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  ProgressBar,
  Select,
  StatCard,
  Tabs,
  Textarea,
} from '@/components/ui/Primitives';
import { IconBriefcase, IconCalendar, IconCheck, IconDownload, IconTarget, IconTrend, IconX } from '@/components/ui/Icons';
import type { Application, ApplicationStatus } from '@/lib/types';

const STUDENT_TABS: { id: string; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'APPLIED,UNDER_REVIEW', label: 'In review' },
  { id: 'SHORTLISTED', label: 'Shortlisted' },
  { id: 'INTERVIEW_SCHEDULED,INTERVIEWED', label: 'Interviews' },
  { id: 'OFFERED', label: 'Offers' },
  { id: 'REJECTED,WITHDRAWN', label: 'Closed' },
];

export default function ApplicationsPage() {
  const { user } = useAuth();
  const { isStudent, isStaff } = useRoleFlags();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Application | null>(null);

  const applications = useAsync(
    () => api.applications({ status: statusFilter || undefined, page, pageSize: 20 }),
    [statusFilter, page],
  );

  const items = applications.data?.items ?? [];
  const offers = items.filter((a) => a.offer);
  const interviews = items.flatMap((a) => a.interviews.filter((i) => i.result === 'PENDING'));

  const columns: Column<Application>[] = isStudent
    ? [
        {
          key: 'job',
          header: 'Role',
          render: (row) => (
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{row.job.company}</p>
              <p className="truncate text-xs text-ink-500">{row.job.title}</p>
            </div>
          ),
        },
        {
          key: 'ctc',
          header: 'Package',
          align: 'right',
          render: (row) => <span className="font-medium tabular-nums text-ink-800">{inr(row.job.ctcMax)}</span>,
          hideOnMobile: true,
        },
        {
          key: 'match',
          header: 'AI match',
          align: 'center',
          render: (row) =>
            row.matchScore !== null ? (
              <div className="mx-auto w-16">
                <span className={`text-sm font-bold tabular-nums ${scoreTone(row.matchScore).text}`}>{row.matchScore}</span>
                <ProgressBar className="mt-0.5" value={row.matchScore} tone={scoreTone(row.matchScore).bar} />
              </div>
            ) : (
              <span className="text-xs text-ink-400">—</span>
            ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (row) => <Badge tone={APPLICATION_STATUS_META[row.status].tone}>{APPLICATION_STATUS_META[row.status].label}</Badge>,
        },
        {
          key: 'updated',
          header: 'Updated',
          render: (row) => <span className="text-xs text-ink-500">{relativeTime(row.updatedAt)}</span>,
          hideOnMobile: true,
        },
      ]
    : [
        {
          key: 'student',
          header: 'Student',
          render: (row) => (
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{row.student.name}</p>
              <p className="truncate text-xs text-ink-500">
                {row.student.rollNo} · {row.student.department} · CGPA {row.student.cgpa.toFixed(2)}
              </p>
            </div>
          ),
        },
        {
          key: 'job',
          header: 'Applied to',
          render: (row) => (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-800">{row.job.company}</p>
              <p className="truncate text-xs text-ink-500">{row.job.title}</p>
            </div>
          ),
        },
        {
          key: 'match',
          header: 'Match',
          align: 'center',
          render: (row) => (
            <span className={`font-bold tabular-nums ${row.matchScore !== null ? scoreTone(row.matchScore).text : 'text-ink-300'}`}>
              {row.matchScore ?? '—'}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (row) => <Badge tone={APPLICATION_STATUS_META[row.status].tone}>{APPLICATION_STATUS_META[row.status].label}</Badge>,
        },
        {
          key: 'applied',
          header: 'Applied',
          render: (row) => <span className="text-xs text-ink-500">{relativeTime(row.appliedAt)}</span>,
          hideOnMobile: true,
        },
      ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{isStudent ? 'My applications' : 'Applications'}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {isStudent
              ? 'Track every application, interview round and offer in one timeline'
              : `${applications.data?.total ?? 0} applications across all drives`}
          </p>
        </div>
        <div className="flex gap-2">
          {isStaff ? (
            <Link href="/pipeline">
              <Button size="sm" variant="secondary">
                Kanban pipeline
              </Button>
            </Link>
          ) : null}
          <Link href="/placements">
            <Button size="sm" icon={<IconBriefcase width={14} height={14} />}>
              {isStudent ? 'Find openings' : 'Manage postings'}
            </Button>
          </Link>
        </div>
      </div>

      {isStudent ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total applications" value={applications.data?.total ?? 0} hint="across all drives" icon={<IconBriefcase width={17} height={17} />} />
          <StatCard label="Upcoming interviews" value={interviews.length} hint="scheduled rounds" icon={<IconCalendar width={17} height={17} />} tone="warning" />
          <StatCard label="Offers received" value={offers.length} hint={offers.length ? 'respond to accept' : 'keep applying'} icon={<IconTrend width={17} height={17} />} tone="success" />
          <StatCard
            label="Placement status"
            value={user?.student?.placementStatus?.replace('_', ' ').toLowerCase() ?? '—'}
            hint={`CGPA ${user?.student?.cgpa.toFixed(2) ?? '—'}`}
            icon={<IconTarget width={17} height={17} />}
            tone="brand"
          />
        </div>
      ) : null}

      <Card className="p-4">
        <Tabs
          tabs={isStudent ? STUDENT_TABS.map((tab) => ({ id: tab.id, label: tab.label })) : [{ id: '', label: 'All applications' }, ...STUDENT_TABS.slice(1)]}
          active={statusFilter}
          onChange={(id) => {
            setStatusFilter(id);
            setPage(1);
          }}
        />
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={items}
          loading={applications.loading}
          error={applications.error}
          onRowClick={(row) => setSelected(row)}
          emptyTitle={isStudent ? 'No applications yet' : 'No applications match this filter'}
          emptyDescription={isStudent ? 'Browse open postings and apply — the AI scores your fit instantly.' : undefined}
          emptyAction={
            isStudent ? (
              <Link href="/placements">
                <Button size="sm">Browse openings</Button>
              </Link>
            ) : undefined
          }
        />
        {applications.data ? (
          <Pagination
            page={applications.data.page}
            totalPages={applications.data.totalPages}
            total={applications.data.total}
            pageSize={applications.data.pageSize}
            onChange={setPage}
          />
        ) : null}
      </Card>

      <ApplicationDetail
        application={selected}
        onClose={() => setSelected(null)}
        isStudent={isStudent}
        canManage={isStaff && !isStudent}
        onChanged={() => {
          applications.reload();
          setSelected(null);
        }}
      />
    </div>
  );
}

function ApplicationDetail({
  application,
  onClose,
  isStudent,
  canManage,
  onChanged,
}: {
  application: Application | null;
  onClose: () => void;
  isStudent: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interviewForm, setInterviewForm] = useState({
    name: 'Technical Round 1',
    scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16),
    durationMins: '45',
    mode: 'ONLINE',
    meetingLink: '',
    interviewer: '',
  });
  const [offerForm, setOfferForm] = useState({ ctc: '', location: '', joiningDate: '' });
  const [note, setNote] = useState('');

  if (!application) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const nextStatuses: ApplicationStatus[] = ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED', 'REJECTED'];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${application.student.name} → ${application.job.company}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50 p-4">
          <div>
            <p className="text-sm font-semibold text-ink-900">{application.job.title}</p>
            <p className="text-xs text-ink-500">
              {application.job.location} · up to {inr(application.job.ctcMax)} · applied {formatDate(application.appliedAt)}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              Source: {application.source === 'STUDENT' ? 'student self-apply' : 'placement cell'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={APPLICATION_STATUS_META[application.status].tone}>{APPLICATION_STATUS_META[application.status].label}</Badge>
            <div className="flex gap-3 text-right">
              {application.matchScore !== null ? (
                <div>
                  <p className={`text-lg font-bold tabular-nums ${scoreTone(application.matchScore).text}`}>{application.matchScore}</p>
                  <p className="text-[10px] uppercase text-ink-400">match</p>
                </div>
              ) : null}
              {application.atsScore !== null ? (
                <div>
                  <p className="text-lg font-bold tabular-nums text-sky-700">{application.atsScore}</p>
                  <p className="text-[10px] uppercase text-ink-400">ATS</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {application.aiSummary ? (
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">AI assessment</p>
            <p className="mt-1 text-sm leading-relaxed text-brand-900">{application.aiSummary}</p>
            {application.matchedSkills.length || application.missingSkills.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {application.matchedSkills.map((skill) => (
                  <span key={skill} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                    ✓ {skill}
                  </span>
                ))}
                {application.missingSkills.map((skill) => (
                  <span key={skill} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                    gap: {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {application.coverNote ? (
          <div>
            <p className="label">Cover note</p>
            <p className="rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-700">{application.coverNote}</p>
          </div>
        ) : null}

        {/* -------------------------------------------------- interviews */}
        <div>
          <p className="label">Interview rounds</p>
          {application.interviews.length === 0 ? (
            <p className="text-sm text-ink-400">No rounds scheduled yet.</p>
          ) : (
            <ul className="space-y-2">
              {application.interviews.map((interview) => (
                <li key={interview.id} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-800">
                        Round {interview.round} · {interview.name}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDate(interview.scheduledAt, true)} · {interview.durationMins} min · {interview.mode.toLowerCase()}
                        {interview.interviewer ? ` · ${interview.interviewer}` : ''}
                      </p>
                      {interview.feedback ? <p className="mt-1 text-xs text-ink-600">“{interview.feedback}”</p> : null}
                      {interview.meetingLink ? (
                        <a href={interview.meetingLink} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
                          Join meeting link →
                        </a>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={interview.result === 'CLEARED' ? 'success' : interview.result === 'FAILED' ? 'danger' : interview.result === 'NO_SHOW' ? 'muted' : 'warning'}>
                        {interview.result.toLowerCase()}
                      </Badge>
                      {interview.score !== null ? <span className="text-sm font-bold tabular-nums text-ink-700">{interview.score}</span> : null}
                    </div>
                  </div>

                  {canManage && interview.result === 'PENDING' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['CLEARED', 'FAILED', 'NO_SHOW'] as const).map((result) => (
                        <Button
                          key={result}
                          size="sm"
                          variant={result === 'CLEARED' ? 'success' : result === 'FAILED' ? 'danger' : 'secondary'}
                          disabled={busy}
                          onClick={() => void act(() => api.recordInterview(interview.id, { result, feedback: note || undefined }))}
                        >
                          {result === 'CLEARED' ? 'Mark cleared' : result === 'FAILED' ? 'Mark failed' : 'No show'}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------------ offer */}
        {application.offer ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Offer · {inr(application.offer.ctc)} · {application.offer.role}
                </p>
                <p className="text-xs text-emerald-700">
                  {application.offer.location ?? 'Location TBD'} · offered {formatDate(application.offer.offerDate)} ·{' '}
                  {application.offer.accepted ? 'accepted' : 'awaiting response'}
                </p>
              </div>
              {isStudent && !application.offer.accepted ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="success" disabled={busy} onClick={() => void act(() => api.respondToOffer(application.offer!.id, true))}>
                    Accept offer
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void act(() => api.respondToOffer(application.offer!.id, false, 'Declined by student'))}
                  >
                    Decline
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {/* -------------------------------------------------- staff tools */}
        {canManage ? (
          <div className="space-y-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Placement cell actions</p>

            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === application.status ? 'primary' : 'secondary'}
                  disabled={busy || status === application.status}
                  onClick={() => void act(() => api.updateApplicationStatus(application.id, status, note || undefined))}
                >
                  {APPLICATION_STATUS_META[status].label}
                </Button>
              ))}
            </div>

            <Textarea
              label="Note to student (optional)"
              placeholder="Include context — it is sent in the student's notification."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[70px]"
            />

            <div className="grid gap-3 border-t border-ink-200 pt-3 sm:grid-cols-3">
              <Select label="Round" value={interviewForm.name} onChange={(e) => setInterviewForm({ ...interviewForm, name: e.target.value })}>
                <option>Online Assessment</option>
                <option>Technical Round 1</option>
                <option>Technical Round 2</option>
                <option>Managerial Round</option>
                <option>HR Round</option>
              </Select>
              <Input
                label="Date & time"
                type="datetime-local"
                value={interviewForm.scheduledAt}
                onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
              />
              <Select label="Mode" value={interviewForm.mode} onChange={(e) => setInterviewForm({ ...interviewForm, mode: e.target.value })}>
                <option value="ONLINE">Online</option>
                <option value="IN_PERSON">In person</option>
                <option value="TELEPHONIC">Telephonic</option>
              </Select>
              <Input
                label="Meeting link"
                placeholder="https://meet…"
                value={interviewForm.meetingLink}
                onChange={(e) => setInterviewForm({ ...interviewForm, meetingLink: e.target.value })}
              />
              <Input
                label="Interviewer"
                placeholder="Panel name"
                value={interviewForm.interviewer}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewer: e.target.value })}
              />
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  icon={<IconCalendar width={14} height={14} />}
                  onClick={() =>
                    void act(() =>
                      api.scheduleInterview(application.id, {
                        round: application.interviews.length + 1,
                        name: interviewForm.name,
                        scheduledAt: new Date(interviewForm.scheduledAt).toISOString(),
                        durationMins: Number(interviewForm.durationMins),
                        mode: interviewForm.mode,
                        meetingLink: interviewForm.meetingLink || undefined,
                        interviewer: interviewForm.interviewer || undefined,
                      }),
                    )
                  }
                >
                  Schedule round
                </Button>
              </div>
            </div>

            {!application.offer ? (
              <div className="grid gap-3 border-t border-ink-200 pt-3 sm:grid-cols-4">
                <Input
                  label="Offer CTC (LPA)"
                  type="number"
                  step="0.5"
                  placeholder="12.5"
                  value={offerForm.ctc}
                  onChange={(e) => setOfferForm({ ...offerForm, ctc: e.target.value })}
                />
                <Input label="Location" placeholder="Bengaluru" value={offerForm.location} onChange={(e) => setOfferForm({ ...offerForm, location: e.target.value })} />
                <Input label="Joining date" type="date" value={offerForm.joiningDate} onChange={(e) => setOfferForm({ ...offerForm, joiningDate: e.target.value })} />
                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="success"
                    className="w-full"
                    disabled={busy || !offerForm.ctc}
                    icon={<IconCheck width={14} height={14} />}
                    onClick={() =>
                      void act(() =>
                        api.makeOffer(application.id, {
                          ctc: Number(offerForm.ctc),
                          location: offerForm.location || undefined,
                          joiningDate: offerForm.joiningDate ? new Date(offerForm.joiningDate).toISOString() : undefined,
                        }),
                      )
                    }
                  >
                    Roll out offer
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {isStudent && !['OFFERED', 'INTERVIEWED', 'REJECTED', 'WITHDRAWN'].includes(application.status) ? (
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => void act(() => api.withdrawApplication(application.id))}
          >
            Withdraw application
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
