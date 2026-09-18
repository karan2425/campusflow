'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth, useRoleFlags } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { scoreTone } from '@/lib/format';
import {
  ATTENDANCE_BAND_BAR,
  ATTENDANCE_BAND_LABEL,
  ATTENDANCE_BAND_TONE,
  ATTENDANCE_BORDERLINE,
  ATTENDANCE_THRESHOLD,
  attendanceBand,
} from '@campusflow/shared';
import { DonutChart } from '@/components/ui/Charts';
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
  Tabs,
} from '@/components/ui/Primitives';
import { IconAlert, IconCheck, IconDownload, IconUsers } from '@/components/ui/Icons';

const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: '#10b981',
  LATE: '#f59e0b',
  ABSENT: '#f43f5e',
  EXCUSED: '#0ea5e9',
};

export default function AttendancePage() {
  const { user } = useAuth();
  const { isStudent } = useRoleFlags();

  return isStudent ? <StudentAttendance studentId={user?.student?.id} /> : <StaffAttendance />;
}

// ------------------------------------------------------------------ student
function StudentAttendance({ studentId }: { studentId?: string }) {
  const [courseId, setCourseId] = useState('');
  const perCourse = useAsync(() => (studentId ? api.studentAttendance(studentId) : Promise.resolve([])), [studentId]);
  const profile = useAsync(() => (studentId ? api.student(studentId) : Promise.resolve(null)), [studentId]);
  const sessions = useAsync(() => api.attendanceOverview().catch(() => null), []);

  if (!studentId) return <EmptyState title="Student profile not linked" description="Contact the placement cell to link your record." />;

  const overall = profile.data?.attendance;
  const courses = perCourse.data ?? [];
  const belowThreshold = courses.filter((course) => course.pct < ATTENDANCE_THRESHOLD);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">My attendance</h1>
        <p className="mt-1 text-sm text-ink-500">
          {overall ? `${overall.totalSessions} class sessions marked this semester` : 'Attendance across all enrolled courses'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={overall ? `${overall.percentage}%` : '—'}
          hint={
            (overall?.percentage ?? 0) >= ATTENDANCE_THRESHOLD
              ? `Above the ${ATTENDANCE_THRESHOLD}% requirement`
              : `Below the ${ATTENDANCE_THRESHOLD}% requirement`
          }
          icon={<IconCheck width={17} height={17} />}
          tone={
            (overall?.percentage ?? 0) >= ATTENDANCE_THRESHOLD ? 'success' : 'danger'
          }
        />
        <StatCard label="Sessions present" value={overall?.present ?? '—'} hint={`+${overall?.late ?? 0} late arrivals`} icon={<IconUsers width={17} height={17} />} tone="info" />
        <StatCard label="Courses tracked" value={courses.length} hint="with attendance recorded" icon={<IconCheck width={17} height={17} />} tone="brand" />
        <StatCard
          label="Courses at risk"
          value={belowThreshold.length}
          hint={`below the ${ATTENDANCE_THRESHOLD}% threshold`}
          icon={<IconAlert width={17} height={17} />}
          tone={belowThreshold.length ? 'danger' : 'success'}
        />
      </div>

      {belowThreshold.length ? (
        <Card className="border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-amber-600">
              <IconAlert width={18} height={18} />
            </span>
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Attendance warning</p>
              <p className="mt-0.5 text-xs">
                You are below {ATTENDANCE_THRESHOLD}% in {belowThreshold.length} course(s):{' '}
                {belowThreshold.map((c) => c.code).join(', ')}. Most institutes require {ATTENDANCE_THRESHOLD}%
                attendance to appear for placement drives — speak to your faculty advisor.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Distribution" subtitle="All sessions this semester" icon={<IconCheck width={16} height={16} />} />
          <div className="p-4">
            {overall?.totalSessions ? (
              <DonutChart
                size={160}
                thickness={20}
                centerValue={`${overall.percentage}%`}
                centerLabel="present"
                data={overall.breakdown.map((entry) => ({
                  label: entry.status.charAt(0) + entry.status.slice(1).toLowerCase(),
                  value: entry.count,
                  color: ATTENDANCE_COLORS[entry.status] ?? '#94a3b8',
                }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-ink-400">No attendance recorded yet</p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Course-wise breakdown"
            subtitle={`Attendance per subject with the ${ATTENDANCE_THRESHOLD}% threshold marked`} icon={<IconCheck width={16} height={16} />} />
          {perCourse.loading ? (
            <LoadingBlock rows={4} />
          ) : courses.length === 0 ? (
            <EmptyState title="No courses with attendance yet" description="Attendance appears once faculty mark a session." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {courses.map((course) => (
                <li key={course.courseId} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-800">
                        {course.code} <span className="font-normal text-ink-500">{course.title}</span>
                      </p>
                      <p className="text-xs text-ink-500">
                        {course.present} present of {course.total} sessions
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="relative w-40">
                        <ProgressBar
                          value={course.pct}
                          tone={ATTENDANCE_BAND_BAR[attendanceBand(course.pct)]}
                        />
                        {/* required-attendance marker */}
                        <span className="absolute top-[-3px] h-3 w-px bg-ink-400" style={{ left: `${ATTENDANCE_THRESHOLD}%` }} aria-hidden="true" />
                      </div>
                      <span className={`w-14 text-right text-sm font-bold tabular-nums ${scoreTone(course.pct).text}`}>{course.pct}%</span>
                      <Badge tone={ATTENDANCE_BAND_TONE[attendanceBand(course.pct)]}>
                        {ATTENDANCE_BAND_LABEL[attendanceBand(course.pct)]}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {profile.data ? (
        <Card>
          <CardHeader title="Enrolled courses" subtitle="Choose a course to see its sessions" icon={<IconUsers width={16} height={16} />} />
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCourseId('')}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  courseId === '' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'
                }`}
              >
                All courses
              </button>
              {profile.data.courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => setCourseId(course.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    courseId === course.id ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'
                  }`}
                >
                  {course.code}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">
              {sessions.data
                ? `${sessions.data.courses.filter((c) => !courseId || c.courseId === courseId).length} course(s) with recorded sessions across the institute.`
                : 'Loading session history…'}
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------- staff
function StaffAttendance() {
  const overview = useAsync(() => api.attendanceOverview(), []);
  const [tab, setTab] = useState<'courses' | 'defaulters'>('courses');

  if (overview.loading) return <LoadingBlock rows={6} label="Loading attendance analytics" />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return null;

  const { overallPct, totalMarked, breakdown, courses, defaulters } = overview.data;
  const atRiskCourses = courses.filter((course) => (course.attendancePct ?? 100) < 70);

  const exportDefaulters = () => {
    const lines = [
      'Roll No,Name,Branch,Attendance %',
      ...defaulters.map((student) => `${student.rollNo},${student.name},${student.department},${student.attendancePct}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'campusflow-attendance-defaulters.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Attendance monitoring</h1>
          <p className="mt-1 text-sm text-ink-500">
            {totalMarked.toLocaleString('en-IN')} attendance records across {courses.length} active courses
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportDefaulters} disabled={!defaulters.length} icon={<IconDownload width={14} height={14} />}>
          Export defaulters
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Institute attendance" value={`${overallPct}%`} hint="weighted across all sessions" icon={<IconCheck width={17} height={17} />} tone={overallPct >= ATTENDANCE_THRESHOLD ? 'success' : 'warning'} />
        <StatCard label="Records marked" value={totalMarked.toLocaleString('en-IN')} hint="present, absent, late, excused" icon={<IconUsers width={17} height={17} />} tone="info" />
        <StatCard label="Courses below 70%" value={atRiskCourses.length} hint="may need remedial sessions" icon={<IconAlert width={17} height={17} />} tone={atRiskCourses.length ? 'danger' : 'success'} />
        <StatCard label="Defaulters" value={defaulters.length} hint={`students under ${ATTENDANCE_BORDERLINE}% overall`} icon={<IconAlert width={17} height={17} />} tone={defaulters.length ? 'warning' : 'success'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Attendance distribution" subtitle="All marked records" icon={<IconCheck width={16} height={16} />} />
          <div className="p-4">
            <DonutChart
              size={160}
              thickness={20}
              centerValue={`${overallPct}%`}
              centerLabel="overall"
              data={breakdown.map((entry) => ({
                label: entry.status.charAt(0) + entry.status.slice(1).toLowerCase(),
                value: entry.count,
                color: ATTENDANCE_COLORS[entry.status] ?? '#94a3b8',
              }))}
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Course health"
            subtitle="Lowest attendance courses first — these may need intervention"
            icon={<IconUsers width={16} height={16} />}
            action={
              <Tabs
                tabs={[
                  { id: 'courses', label: 'Courses', count: courses.length },
                  { id: 'defaulters', label: 'Defaulters', count: defaulters.length },
                ]}
                active={tab}
                onChange={setTab}
              />
            }
          />
          {tab === 'courses' ? (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-ink-50">
                  <tr className="border-b border-ink-200 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2 text-left">Course</th>
                    <th className="px-3 py-2 text-right">Sessions</th>
                    <th className="px-3 py-2 text-right">Enrolled</th>
                    <th className="px-4 py-2 text-left">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...courses]
                    .sort((a, b) => (a.attendancePct ?? 100) - (b.attendancePct ?? 100))
                    .map((course) => (
                      <tr key={course.courseId} className="border-b border-ink-100 last:border-0">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-ink-800">{course.code}</p>
                          <p className="text-[11px] text-ink-400">
                            {course.title} · {course.department} sem {course.semester}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{course.sessions}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{course.enrolled}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <ProgressBar
                              value={course.attendancePct ?? 0}
                              tone={ATTENDANCE_BAND_BAR[attendanceBand(course.attendancePct ?? 0)]}
                            />
                            <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-ink-800">
                              {course.attendancePct ?? '—'}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : defaulters.length === 0 ? (
            <EmptyState title="No defaulters" description={`Every student with recorded attendance is above ${ATTENDANCE_BORDERLINE}%.`} icon={<IconCheck />} />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="sticky top-0 bg-ink-50">
                  <tr className="border-b border-ink-200 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-left">Branch</th>
                    <th className="px-4 py-2 text-right">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {defaulters.map((student) => (
                    <tr key={student.studentId} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/students/${student.studentId}`} className="font-semibold text-ink-800 hover:text-brand-700">
                          {student.name}
                        </Link>
                        <p className="text-[11px] text-ink-400">{student.rollNo}</p>
                      </td>
                      <td className="px-3 py-2.5 text-ink-600">{student.department}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-bold tabular-nums text-rose-600">{student.attendancePct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle
          title="How the alerts work"
          subtitle="Low-attendance notifications are generated automatically"
        />
        <ul className="grid gap-2 text-xs text-ink-600 sm:grid-cols-3">
          <li className="rounded-lg bg-ink-50 px-3 py-2">
            Marking a session where a student has 35%+ absences in that course sends them an academic alert automatically.
          </li>
          <li className="rounded-lg bg-ink-50 px-3 py-2">
            Students under {ATTENDANCE_THRESHOLD}% overall are flagged here and on their profile as a
            placement-eligibility risk.
          </li>
          <li className="rounded-lg bg-ink-50 px-3 py-2">
            Export the defaulter list to share with faculty advisors or the academic office.
          </li>
        </ul>
      </Card>
    </div>
  );
}
