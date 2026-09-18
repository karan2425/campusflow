'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAsync, useDebounced } from '@/lib/hooks';
import { PLACEMENT_STATUS_META, scoreTone } from '@/lib/format';
import { DataTable, Pagination, type Column } from '@/components/ui/Table';
import { Badge, Card, Input, Select, Avatar, Button } from '@/components/ui/Primitives';
import { IconDownload, IconFilter, IconSearch, IconUsers } from '@/components/ui/Icons';
import type { StudentListItem } from '@/lib/types';

export default function StudentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [status, setStatus] = useState('');
  const [minCgpa, setMinCgpa] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearch = useDebounced(search, 350);

  const departments = useAsync(() => api.departments(), []);
  const students = useAsync(
    () =>
      api.students({
        q: debouncedSearch || undefined,
        department: department || undefined,
        batch: batch ? Number(batch) : undefined,
        placementStatus: status || undefined,
        minCgpa: minCgpa ? Number(minCgpa) : undefined,
        sort,
        page,
        pageSize: 20,
      }),
    [debouncedSearch, department, batch, status, minCgpa, sort, page],
  );

  const columns: Column<StudentListItem>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{row.name}</p>
            <p className="truncate text-xs text-ink-500">{row.rollNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Branch',
      render: (row) => (
        <div>
          <p className="font-medium text-ink-700">{row.department}</p>
          <p className="text-xs text-ink-400">Batch {row.batch} · Sem {row.currentSemester}</p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'cgpa',
      header: 'CGPA',
      align: 'right',
      render: (row) => {
        const tone = scoreTone(row.cgpa * 10);
        return (
          <div className="text-right">
            <span className={`font-bold tabular-nums ${tone.text}`}>{row.cgpa.toFixed(2)}</span>
            {row.backlogs > 0 ? <p className="text-xs text-rose-600">{row.backlogs} backlog(s)</p> : <p className="text-xs text-emerald-600">no backlogs</p>}
          </div>
        );
      },
    },
    {
      key: 'skills',
      header: 'Top skills',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600">
              {skill}
            </span>
          ))}
          {row.skills.length > 3 ? <span className="px-1 text-[11px] text-ink-400">+{row.skills.length - 3}</span> : null}
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'applications',
      header: 'Apps',
      align: 'center',
      render: (row) => <span className="tabular-nums font-medium text-ink-700">{row.applications}</span>,
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Placement',
      render: (row) => {
        const meta = PLACEMENT_STATUS_META[row.placementStatus];
        return (
          <div className="flex items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {row.verified ? <span className="text-[11px] font-medium text-emerald-600">verified</span> : null}
          </div>
        );
      },
    },
  ];

  const exportCsv = () => {
    const rows = students.data?.items ?? [];
    const header = ['Name', 'Roll No', 'Branch', 'Batch', 'CGPA', 'Backlogs', 'Status', 'Skills', 'Applications'];
    const body = rows.map((row) =>
      [row.name, row.rollNo, row.department, row.batch, row.cgpa, row.backlogs, row.placementStatus, row.skills.join('; '), row.applications]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campusflow-students-page${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Student directory</h1>
          <p className="mt-1 text-sm text-ink-500">
            {students.data ? `${students.data.total} students match the current filters` : 'Search, filter and export the full student body'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((v) => !v)} icon={<IconFilter width={14} height={14} />}>
            {showFilters ? 'Hide filters' : 'Filters'}
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} icon={<IconDownload width={14} height={14} />} disabled={!students.data?.items.length}>
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
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
              placeholder="Search by name, roll number, email or skill…"
              className="input pl-9"
              aria-label="Search students"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              <option value="name">Sort: Name (A–Z)</option>
              <option value="cgpa">Sort: CGPA (high → low)</option>
              <option value="coding">Sort: Coding score</option>
              <option value="recent">Sort: Recently added</option>
            </Select>
          </div>
        </div>

        {showFilters ? (
          <div className="mt-3 grid gap-3 border-t border-ink-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Branch"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All branches</option>
              {(departments.data ?? []).map((dept) => (
                <option key={dept.code} value={dept.code}>
                  {dept.code} — {dept.name}
                </option>
              ))}
            </Select>

            <Select
              label="Batch"
              value={batch}
              onChange={(e) => {
                setBatch(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All batches</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </Select>

            <Select
              label="Placement status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any status</option>
              <option value="PLACED">Placed</option>
              <option value="IN_PROCESS">In process</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="NOT_ELIGIBLE">Not eligible</option>
              <option value="OPTED_OUT">Opted out</option>
            </Select>

            <Input
              label="Minimum CGPA"
              type="number"
              min={0}
              max={10}
              step={0.1}
              placeholder="e.g. 7.5"
              value={minCgpa}
              onChange={(e) => {
                setMinCgpa(e.target.value);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={students.data?.items ?? []}
          loading={students.loading}
          error={students.error}
          onRowClick={(row) => router.push(`/students/${row.id}`)}
          emptyTitle="No students match those filters"
          emptyDescription="Try widening the CGPA range or clearing the branch filter."
          emptyAction={<Button variant="secondary" size="sm" onClick={() => { setSearch(''); setDepartment(''); setBatch(''); setStatus(''); setMinCgpa(''); }}>Clear filters</Button>}
        />
        {students.data ? (
          <Pagination
            page={students.data.page}
            totalPages={students.data.totalPages}
            total={students.data.total}
            pageSize={students.data.pageSize}
            onChange={setPage}
          />
        ) : null}
      </Card>

      {students.data && students.data.total > 0 ? (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <IconUsers width={14} height={14} />
          Click any row to open the full 360° profile — academics, attendance, applications and offers.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Link href="/ai-studio" className="font-semibold text-brand-600 hover:text-brand-700">
            Open the AI studio
          </Link>
          to run a semantic search across the candidate pool.
        </p>
      )}
    </div>
  );
}
