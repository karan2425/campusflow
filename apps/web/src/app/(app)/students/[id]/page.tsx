'use client';

import { use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { APPLICATION_STATUS_META, PLACEMENT_STATUS_META, formatDate, inr, scoreTone } from '@/lib/format';
import { Badge, Card, CardHeader, Avatar, Button, EmptyState, ErrorState, KeyValue, LoadingBlock, ProgressBar, ScoreRing, StatCard } from '@/components/ui/Primitives';
import { DonutChart } from '@/components/ui/Charts';
import { IconBriefcase, IconBook, IconCalendar, IconCheck, IconFile, IconTarget, IconTrend } from '@/components/ui/Icons';

const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: '#10b981',
  LATE: '#f59e0b',
  ABSENT: '#f43f5e',
  EXCUSED: '#0ea5e9',
};

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const student = useAsync(() => api.student(id), [id]);
  const analytics = useAsync(() => api.studentAnalytics(id), [id]);
  const attendance = useAsync(() => api.studentAttendance(id), [id]);

  if (student.loading) return <LoadingBlock rows={6} label="Loading student profile" />;
  if (student.error) return <ErrorState message={student.error} onRetry={student.reload} />;
  if (!student.data) return <EmptyState title="Student not found" />;

  const s = student.data;
  const placementMeta = PLACEMENT_STATUS_META[s.placementStatus];

  return (
    <div className="space-y-5">
      {/* --------------------------------------------------------- header */}
      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <Avatar name={s.name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-ink-900">{s.name}</h1>
                <Badge tone={placementMeta.tone}>{placementMeta.label}</Badge>
                {s.verified ? <Badge tone="success">verified</Badge> : <Badge tone="muted">unverified</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-500">
                {s.rollNo} · {s.department} · Batch {s.batch} · Semester {s.currentSemester}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                <span>{s.email}</span>
                {s.phone ? <span>{s.phone}</span> : null}
                {s.city ? <span>{s.city}</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.githubUrl ? (
                  <a href={s.githubUrl} target="_blank" rel="noreferrer" className="rounded-md border border-ink-200 px-2 py-0.5 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-700">
                    GitHub
                  </a>
                ) : null}
                {s.linkedinUrl ? (
                  <a href={s.linkedinUrl} target="_blank" rel="noreferrer" className="rounded-md border border-ink-200 px-2 py-0.5 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-700">
                    LinkedIn
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <ScoreRing score={analytics.data?.readiness ?? 0} size={78} label="Readiness" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">CGPA</p>
                <p className={`text-lg font-bold tabular-nums ${scoreTone(s.cgpa * 10).text}`}>{s.cgpa.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Backlogs</p>
                <p className={`text-lg font-bold tabular-nums ${s.backlogs ? 'text-rose-600' : 'text-emerald-600'}`}>{s.backlogs}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Attendance</p>
                <p className={`text-lg font-bold tabular-nums ${s.attendance.percentage >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {s.attendance.percentage}%
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Resume</p>
                <p className="text-lg font-bold text-ink-700">{s.hasResumeText ? 'On file' : 'Missing'}</p>
              </div>
            </div>
          </div>
        </div>

        {s.about ? <p className="mt-4 border-t border-ink-100 pt-4 text-sm leading-relaxed text-ink-600">{s.about}</p> : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications" value={s.applications.length} hint={`${analytics.data?.stats.activeApplications ?? 0} active`} icon={<IconBriefcase width={17} height={17} />} />
        <StatCard label="Interviews" value={analytics.data?.stats.interviews ?? 0} hint={`${analytics.data?.stats.shortlisted ?? 0} shortlisted`} icon={<IconCalendar width={17} height={17} />} tone="info" />
        <StatCard label="Best match" value={analytics.data?.stats.bestMatchScore ? `${analytics.data.stats.bestMatchScore}` : '—'} hint="AI score across applications" icon={<IconTarget width={17} height={17} />} tone="brand" />
        <StatCard label="Offers" value={analytics.data?.stats.offers ?? 0} hint={analytics.data?.offers[0] ? `best ${inr(analytics.data.offers[0].ctc)}` : 'none yet'} icon={<IconTrend width={17} height={17} />} tone="success" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------------- skills */}
        <Card className="lg:col-span-2">
          <CardHeader title="Skills & signals" subtitle="Used by the AI matcher when ranking candidates" icon={<IconTarget width={16} height={16} />} />
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-1.5">
              {s.skills.length ? (
                s.skills.map((skill) => (
                  <span key={skill} className="rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                    {skill}
                  </span>
                ))
              ) : (
                <p className="text-sm text-ink-400">No skills listed — the AI matcher has little to work with.</p>
              )}
            </div>
            <KeyValue
              columns={3}
              items={[
                { label: 'Coding score', value: s.codingScore ?? '—' },
                { label: 'GitHub score', value: s.githubScore ?? '—' },
                { label: 'Verified', value: s.verified ? 'Yes' : 'No' },
              ]}
            />
            {s.resumeUrl ? (
              <a href={s.resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
                <IconFile width={15} height={15} /> View uploaded resume
              </a>
            ) : null}
          </div>
        </Card>

        {/* --------------------------------------------------- attendance */}
        <Card>
          <CardHeader title="Attendance" subtitle={`${s.attendance.totalSessions} sessions marked`} icon={<IconCheck width={16} height={16} />} />
          <div className="p-4">
            {s.attendance.totalSessions === 0 ? (
              <p className="py-4 text-center text-sm text-ink-400">No attendance recorded yet</p>
            ) : (
              <>
                <DonutChart
                  size={140}
                  thickness={18}
                  centerValue={`${s.attendance.percentage}%`}
                  centerLabel="overall"
                  data={s.attendance.breakdown.map((entry) => ({
                    label: entry.status.charAt(0) + entry.status.slice(1).toLowerCase(),
                    value: entry.count,
                    color: ATTENDANCE_COLORS[entry.status] ?? '#94a3b8',
                  }))}
                />
                {s.attendance.percentage < 75 ? (
                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Below the 75% requirement — this student may be barred from placement drives.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------ per course */}
      {attendance.data?.length ? (
        <Card>
          <CardHeader title="Course-wise attendance" subtitle="Semester performance by subject" icon={<IconBook width={16} height={16} />} />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {attendance.data.map((course) => (
              <div key={course.courseId} className="rounded-lg border border-ink-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">{course.code}</p>
                    <p className="truncate text-xs text-ink-500">{course.title}</p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${course.pct >= 75 ? 'text-emerald-600' : course.pct >= 65 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {course.pct}%
                  </span>
                </div>
                <ProgressBar
                  className="mt-2"
                  value={course.pct}
                  tone={course.pct >= 75 ? 'bg-emerald-500' : course.pct >= 65 ? 'bg-amber-500' : 'bg-rose-500'}
                />
                <p className="mt-1 text-[11px] text-ink-400">
                  {course.present} present of {course.total} sessions
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------ applications */}
        <Card className="lg:col-span-2">
          <CardHeader title="Placement applications" subtitle={`${s.applications.length} total`} icon={<IconBriefcase width={16} height={16} />} />
          {s.applications.length === 0 ? (
            <EmptyState title="No applications yet" description="This student has not applied to any postings." />
          ) : (
            <div className="divide-y divide-ink-100">
              {s.applications.map((application) => {
                const meta = APPLICATION_STATUS_META[application.status];
                return (
                  <div key={application.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/placements/${application.job.id}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
                            {application.job.company}
                          </Link>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {application.job.title} · up to {inr(application.job.ctcMax)} · applied {formatDate(application.appliedAt)}
                        </p>
                        {application.interviews.length ? (
                          <ul className="mt-1.5 space-y-1">
                            {application.interviews.map((interview) => (
                              <li key={interview.id} className="text-xs text-ink-500">
                                Round {interview.round} · {interview.name} · {formatDate(interview.scheduledAt)} ·{' '}
                                <span className={interview.result === 'CLEARED' ? 'font-semibold text-emerald-600' : interview.result === 'FAILED' ? 'font-semibold text-rose-600' : 'font-semibold text-amber-600'}>
                                  {interview.result.toLowerCase()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        {application.matchScore !== null ? (
                          <>
                            <p className={`text-lg font-bold tabular-nums ${scoreTone(application.matchScore).text}`}>{application.matchScore}</p>
                            <p className="text-[11px] text-ink-400">match score</p>
                          </>
                        ) : null}
                        {application.atsScore !== null ? (
                          <p className="mt-1 text-[11px] text-ink-400">ATS {application.atsScore}</p>
                        ) : null}
                        {application.offer ? (
                          <p className="mt-1 text-xs font-semibold text-emerald-700">
                            {inr(application.offer.ctc)} {application.offer.accepted ? '· accepted' : '· pending'}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ----------------------------------------------------- courses */}
        <Card>
          <CardHeader title="Enrolled courses" subtitle={`${s.courses.length} this semester`} icon={<IconBook width={16} height={16} />} />
          {s.courses.length === 0 ? (
            <EmptyState title="No enrollments" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {s.courses.map((course) => (
                <li key={course.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-800">{course.code}</p>
                      <p className="truncate text-xs text-ink-500">{course.title}</p>
                      <p className="text-[11px] text-ink-400">{course.faculty ?? 'Unassigned'} · {course.credits} credits</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {course.grade ? <Badge tone="brand">{course.grade}</Badge> : null}
                      {course.marks !== null ? <p className="mt-1 text-xs tabular-nums text-ink-500">{course.marks}/100</p> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {analytics.data?.timeline.length ? (
        <Card>
          <CardHeader title="Activity timeline" subtitle="Most recent 12 events" icon={<IconCalendar width={16} height={16} />} />
          <ol className="relative ml-6 border-l border-ink-200 py-4 pr-4">
            {analytics.data.timeline.map((event, index) => (
              <li key={`${event.label}-${index}`} className="relative pb-4 pl-5 last:pb-0">
                <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${event.type === 'interview' ? 'bg-amber-500' : 'bg-brand-500'}`} />
                <p className="text-sm font-medium text-ink-800">{event.label}</p>
                <p className="text-xs text-ink-500">
                  {formatDate(event.date, true)} · {event.status.replace(/_/g, ' ').toLowerCase()}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="flex justify-end gap-2">
        <Link href="/students">
          <Button variant="secondary" size="sm">
            Back to directory
          </Button>
        </Link>
        <Link href={`/ai-studio?studentId=${s.id}`}>
          <Button size="sm">Analyse with AI</Button>
        </Link>
      </div>
    </div>
  );
}
