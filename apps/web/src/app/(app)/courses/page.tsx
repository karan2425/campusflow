'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Badge, Card, CardHeader, EmptyState, Input, LoadingBlock, ProgressBar, Select, StatCard } from '@/components/ui/Primitives';
import { IconBook, IconCheck, IconSearch, IconUsers } from '@/components/ui/Icons';
import type { Course } from '@/lib/types';

export default function CoursesPage() {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('');
  const [selected, setSelected] = useState<Course | null>(null);

  const departments = useAsync(() => api.departments(), []);
  const courses = useAsync(
    () =>
      api.courses({
        q: search || undefined,
        department: department || undefined,
        semester: semester ? Number(semester) : undefined,
      }),
    [search, department, semester],
  );

  const items = courses.data?.items ?? [];
  const totalEnrolled = items.reduce((sum, course) => sum + course.enrolled, 0);
  const totalSessions = items.reduce((sum, course) => sum + course.sessions, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Courses</h1>
        <p className="mt-1 text-sm text-ink-500">Curriculum, faculty allocation, enrolments and attendance sessions</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={items.length} hint="matching current filters" icon={<IconBook width={17} height={17} />} />
        <StatCard label="Enrolments" value={totalEnrolled} hint="student-course registrations" icon={<IconUsers width={17} height={17} />} tone="info" />
        <StatCard label="Sessions marked" value={totalSessions} hint="attendance sessions recorded" icon={<IconCheck width={17} height={17} />} tone="success" />
        <StatCard label="Branches" value={departments.data?.length ?? 0} hint="departments offering courses" icon={<IconBook width={17} height={17} />} tone="brand" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
              <IconSearch width={16} height={16} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by course code or title…"
              className="input pl-9"
              aria-label="Search courses"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Branch">
              <option value="">All branches</option>
              {(departments.data ?? []).map((dept) => (
                <option key={dept.code} value={dept.code}>
                  {dept.code} — {dept.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Select value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Semester">
              <option value="">All semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {courses.loading ? (
        <LoadingBlock rows={5} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title="No courses match those filters" description="Try a different branch or semester." icon={<IconBook />} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((course) => (
            <Card key={course.id} hover className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{course.code}</span>
                    <Badge tone="neutral">Sem {course.semester}</Badge>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-ink-900">{course.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {course.faculty} · {course.credits} credits
                  </p>
                </div>
              </div>

              {course.description ? <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-ink-500">{course.description}</p> : null}

              <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-500">Enrolled</span>
                    <span className="font-semibold tabular-nums text-ink-800">{course.enrolled}</span>
                  </div>
                  <ProgressBar value={Math.min(100, (course.enrolled / 40) * 100)} />
                </div>
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <span>{course.departmentName}</span>
                  <span>{course.sessions} session(s)</span>
                </div>
              </div>

              <button
                onClick={() => setSelected(course)}
                className="mt-3 text-left text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                View roster →
              </button>
            </Card>
          ))}
        </div>
      )}

      {selected ? <CourseRoster course={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function CourseRoster({ course, onClose }: { course: Course; onClose: () => void }) {
  const detail = useAsync(() => api.course(course.id), [course.id]);

  return (
    <Card className="border-brand-200">
      <CardHeader
        title={`${course.code} — ${course.title}`}
        subtitle={`${course.faculty} · ${course.departmentName} · semester ${course.semester}`}
        icon={<IconBook width={16} height={16} />}
        action={
          <button onClick={onClose} className="text-xs font-semibold text-ink-500 hover:text-ink-700">
            Close
          </button>
        }
      />

      {detail.loading ? (
        <LoadingBlock rows={4} />
      ) : !detail.data ? (
        <EmptyState title="Could not load the roster" />
      ) : (
        <div className="grid gap-5 p-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Roster ({detail.data.roster.length} students)
            </p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-ink-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-50">
                  <tr className="border-b border-ink-200 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-right">CGPA</th>
                    <th className="px-3 py-2 text-right">Attendance</th>
                    <th className="px-3 py-2 text-right">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.roster.map((entry) => (
                    <tr key={entry.enrollmentId} className="border-b border-ink-100 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-800">{entry.name}</p>
                        <p className="text-[11px] text-ink-400">{entry.rollNo}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-600">{entry.cgpa.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        {entry.attendancePct !== null ? (
                          <span className={`font-semibold tabular-nums ${entry.attendancePct >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {entry.attendancePct}%
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{entry.grade ? <Badge tone="brand">{entry.grade}</Badge> : <span className="text-ink-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Recent sessions</p>
            {detail.data.recentSessions.length === 0 ? (
              <p className="text-sm text-ink-400">No sessions marked yet.</p>
            ) : (
              <ul className="space-y-2">
                {detail.data.recentSessions.map((session) => (
                  <li key={session.id} className="rounded-lg border border-ink-100 px-3 py-2">
                    <p className="text-xs font-semibold text-ink-700">{new Date(session.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <p className="text-[11px] text-ink-500">{session.topic ?? 'Lecture'}</p>
                    <p className="text-[11px] text-ink-400">{session.records} records marked</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
