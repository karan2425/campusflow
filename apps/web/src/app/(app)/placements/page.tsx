'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRoleFlags } from '@/lib/auth';
import { useAsync, useDebounced } from '@/lib/hooks';
import { JOB_TYPE_LABEL, daysUntil, formatDate, inr } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea, Tabs } from '@/components/ui/Primitives';
import { Pagination } from '@/components/ui/Table';
import { IconBriefcase, IconPlus, IconSearch, IconSparkles, IconTarget } from '@/components/ui/Icons';
import type { JobListItem } from '@/lib/types';

export default function PlacementsPage() {
  const router = useRouter();
  const { isStaff, isOfficer, isAdmin } = useRoleFlags();
  const canManage = isOfficer || isAdmin;

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [department, setDepartment] = useState('');
  const [minCtc, setMinCtc] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [sort, setSort] = useState<'deadline' | 'ctc' | 'applicants'>('deadline');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 350);
  const departments = useAsync(() => api.departments(), []);
  const companies = useAsync(() => (canManage ? api.companies() : Promise.resolve([])), [canManage]);

  const jobs = useAsync(
    () =>
      api.jobs({
        q: debouncedSearch || undefined,
        type: type || undefined,
        department: department || undefined,
        minCtc: minCtc ? Number(minCtc) : undefined,
        status: status || undefined,
        page,
        pageSize: 12,
      }),
    [debouncedSearch, type, department, minCtc, status, page],
  );

  const items = jobs.data?.items ?? [];
  const sorted = [...items].sort((a, b) => {
    if (sort === 'ctc') return b.ctcMax - a.ctcMax;
    if (sort === 'applicants') return b.applicants - a.applicants;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Job postings</h1>
          <p className="mt-1 text-sm text-ink-500">
            {jobs.data ? `${jobs.data.total} posting(s)` : 'Open roles across all recruiters'} · ranked by AI match when you open a posting
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)} icon={<IconPlus width={14} height={14} />}>
            New posting
          </Button>
        ) : (
          <Link href="/ai-studio">
            <Button size="sm" variant="secondary" icon={<IconSparkles width={14} height={14} />}>
              AI recommendations
            </Button>
          </Link>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
              <IconSearch width={16} height={16} />
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by role, company or skill…"
              className="input pl-9"
              aria-label="Search postings"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Job type">
              <option value="">All types</option>
              <option value="FULL_TIME">Full time</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="INTERNSHIP_PPO">Internship + PPO</option>
            </Select>
            <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} aria-label="Branch">
              <option value="">All branches</option>
              {(departments.data ?? []).map((dept) => (
                <option key={dept.code} value={dept.code}>
                  {dept.code}
                </option>
              ))}
            </Select>
            <Select value={minCtc} onChange={(e) => { setMinCtc(e.target.value); setPage(1); }} aria-label="Minimum CTC">
              <option value="">Any CTC</option>
              <option value="6">≥ 6 LPA</option>
              <option value="10">≥ 10 LPA</option>
              <option value="15">≥ 15 LPA</option>
              <option value="25">≥ 25 LPA</option>
            </Select>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
              <option value="OPEN">Open</option>
              <option value="">All statuses</option>
              <option value="CLOSED">Closed</option>
              <option value="DRAFT">Draft</option>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Sort</span>
          <Tabs
            tabs={[
              { id: 'deadline', label: 'Deadline' },
              { id: 'ctc', label: 'Highest CTC' },
              { id: 'applicants', label: 'Most applicants' },
            ]}
            active={sort}
            onChange={setSort}
          />
        </div>
      </Card>

      {jobs.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-52 p-4">
              <div className="skeleton h-full w-full" />
            </Card>
          ))}
        </div>
      ) : jobs.error ? (
        <Card>
          <EmptyState title="Could not load postings" description={jobs.error} action={<Button size="sm" variant="secondary" onClick={jobs.reload}>Retry</Button>} />
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState title="No postings match those filters" description="Try clearing the branch or CTC filter." icon={<IconBriefcase />} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((job) => (
              <JobCard key={job.id} job={job} canManage={canManage} onOpen={() => router.push(`/placements/${job.id}`)} />
            ))}
          </div>
          {jobs.data ? (
            <Card>
              <Pagination page={jobs.data.page} totalPages={jobs.data.totalPages} total={jobs.data.total} pageSize={jobs.data.pageSize} onChange={setPage} />
            </Card>
          ) : null}
        </>
      )}

      {canManage ? (
        <CreateJobModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companies={(companies.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          departments={(departments.data ?? []).map((d) => d.code)}
          onCreated={() => {
            setCreateOpen(false);
            jobs.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function JobCard({ job, canManage, onOpen }: { job: JobListItem; canManage: boolean; onOpen: () => void }) {
  const days = daysUntil(job.deadline);
  const closing = days <= 5 && job.status === 'OPEN';

  return (
    <Card hover className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
              {job.company.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-500">{job.company}</p>
              <p className="truncate text-[11px] text-ink-400">{job.tier ?? job.industry ?? 'Recruiter'}</p>
            </div>
          </div>
          <Link href={`/placements/${job.id}`} className="mt-2.5 block">
            <h3 className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700">{job.title}</h3>
          </Link>
        </div>
        <Badge tone={job.status === 'OPEN' ? 'success' : job.status === 'CLOSED' ? 'muted' : 'warning'}>
          {job.status.toLowerCase()}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-ink-400">CTC</p>
          <p className="font-bold text-ink-900">
            {job.type === 'INTERNSHIP' || job.type === 'INTERNSHIP_PPO'
              ? `${inr(job.ctcMax)}`
              : `${inr(job.ctcMin)} – ${inr(job.ctcMax)}`}
          </p>
          {job.stipendPerMonth ? <p className="text-[11px] text-emerald-600">₹{job.stipendPerMonth.toLocaleString('en-IN')}/month stipend</p> : null}
        </div>
        <div>
          <p className="text-ink-400">Eligibility</p>
          <p className="font-semibold text-ink-800">CGPA ≥ {job.minCgpa.toFixed(1)}</p>
          <p className="text-[11px] text-ink-500">
            {job.allowedDepartments.length ? job.allowedDepartments.join(', ') : 'All branches'} · {job.batches.join(', ')}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {job.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600">
            {skill}
          </span>
        ))}
        {job.skills.length > 4 ? <span className="px-1 text-[11px] text-ink-400">+{job.skills.length - 4}</span> : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <div className="min-w-0 text-xs">
          <p className={closing ? 'font-semibold text-rose-600' : 'text-ink-500'}>
            {job.status === 'OPEN' ? (days > 0 ? `${days} day(s) left` : 'Deadline passed') : 'Closed'} · {formatDate(job.deadline)}
          </p>
          <p className="text-ink-400">
            {job.applicants} applicant(s)
            {canManage ? ` · ${job.shortlisted} shortlisted · ${job.offered} offered` : ''}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          {canManage ? 'Manage' : 'View'}
        </Button>
      </div>
    </Card>
  );
}

function CreateJobModal({
  open,
  onClose,
  companies,
  departments,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companies: { id: string; name: string }[];
  departments: string[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    companyId: companies[0]?.id ?? '',
    title: '',
    description: '',
    type: 'FULL_TIME',
    location: 'Bengaluru',
    workMode: 'Hybrid',
    ctcMin: '8',
    ctcMax: '12',
    minCgpa: '7',
    maxBacklogs: '0',
    openings: '5',
    deadline: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    skills: '',
    batches: '2026',
    allowedDepartments: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createJob({
        companyId: form.companyId,
        title: form.title,
        description: form.description,
        type: form.type,
        location: form.location,
        workMode: form.workMode,
        ctcMin: Number(form.ctcMin),
        ctcMax: Number(form.ctcMax),
        minCgpa: Number(form.minCgpa),
        maxBacklogs: Number(form.maxBacklogs),
        openings: Number(form.openings),
        deadline: new Date(form.deadline).toISOString(),
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        batches: form.batches.split(',').map((b) => Number(b.trim())).filter((b) => !Number.isNaN(b)),
        allowedDepartments: form.allowedDepartments,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the posting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create job posting"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!form.title || !form.description || !form.companyId}>
            Publish posting
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {companies.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Add a company first — postings must belong to a recruiter record.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Company" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
          <Input label="Role title" placeholder="Software Engineer — AI Platform" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>

        <Textarea
          label="Job description"
          placeholder="Responsibilities, requirements, selection process… (minimum 20 characters)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="min-h-[140px]"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="FULL_TIME">Full time</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="INTERNSHIP_PPO">Internship + PPO</option>
            <option value="PART_TIME">Part time</option>
          </Select>
          <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Select label="Work mode" value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })}>
            <option value="Hybrid">Hybrid</option>
            <option value="On-site">On-site</option>
            <option value="Remote">Remote</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="CTC min (LPA)" type="number" step="0.5" value={form.ctcMin} onChange={(e) => setForm({ ...form, ctcMin: e.target.value })} />
          <Input label="CTC max (LPA)" type="number" step="0.5" value={form.ctcMax} onChange={(e) => setForm({ ...form, ctcMax: e.target.value })} />
          <Input label="Openings" type="number" value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} />
          <Input label="Deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Minimum CGPA" type="number" step="0.1" value={form.minCgpa} onChange={(e) => setForm({ ...form, minCgpa: e.target.value })} />
          <Input label="Max backlogs" type="number" value={form.maxBacklogs} onChange={(e) => setForm({ ...form, maxBacklogs: e.target.value })} />
          <Input label="Eligible batches" hint="Comma separated, e.g. 2026,2027" value={form.batches} onChange={(e) => setForm({ ...form, batches: e.target.value })} />
        </div>

        <Input
          label="Required skills"
          hint="Comma separated — these drive the AI matching and ATS scoring"
          placeholder="React, Node.js, PostgreSQL, Docker"
          value={form.skills}
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
        />

        <div>
          <label className="label">Eligible branches</label>
          <div className="flex flex-wrap gap-2">
            {departments.map((code) => {
              const active = form.allowedDepartments.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      allowedDepartments: active ? form.allowedDepartments.filter((d) => d !== code) : [...form.allowedDepartments, code],
                    })
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-ink-400">Leave all unselected to open the posting to every branch.</p>
        </div>

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <IconTarget width={14} height={14} className="mt-0.5 shrink-0" />
          Publishing immediately notifies every eligible student. The posting also becomes available for AI shortlisting.
        </p>
      </div>
    </Modal>
  );
}
