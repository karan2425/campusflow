'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { daysUntil, formatDate, inr } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Modal, Select, StatCard, Textarea } from '@/components/ui/Primitives';
import { IconBuilding, IconPlus, IconSearch, IconTrend } from '@/components/ui/Icons';
import { useRoleFlags } from '@/lib/auth';

export default function CompaniesPage() {
  const { isOfficer, isAdmin } = useRoleFlags();
  const canManage = isOfficer || isAdmin;

  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const companies = useAsync(() => api.companies(), []);

  const items = (companies.data ?? []).filter((company) => {
    const matchesSearch =
      !search ||
      company.name.toLowerCase().includes(search.toLowerCase()) ||
      (company.industry ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesIndustry = !industry || company.industry === industry;
    return matchesSearch && matchesIndustry;
  });

  const industries = Array.from(new Set((companies.data ?? []).map((c) => c.industry).filter(Boolean))) as string[];
  const totalOffers = (companies.data ?? []).reduce((sum, c) => sum + c.offersMade, 0);
  const highest = Math.max(0, ...(companies.data ?? []).map((c) => c.avgCtc ?? 0));

  if (companies.loading) return <LoadingBlock rows={6} label="Loading recruiters" />;
  if (companies.error) return <ErrorState message={companies.error} onRetry={companies.reload} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Recruiters</h1>
          <p className="mt-1 text-sm text-ink-500">Every company engaged with the placement cell this season</p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)} icon={<IconPlus width={14} height={14} />}>
            Add company
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Companies" value={companies.data?.length ?? 0} hint="engaged this season" icon={<IconBuilding width={17} height={17} />} />
        <StatCard label="Offers made" value={totalOffers} hint="across all recruiters" icon={<IconTrend width={17} height={17} />} tone="success" />
        <StatCard label="Active drives" value={(companies.data ?? []).reduce((sum, c) => sum + c.openJobs, 0)} hint="postings still open" icon={<IconBuilding width={17} height={17} />} tone="brand" />
        <StatCard label="Top avg CTC" value={highest ? inr(highest) : '—'} hint="best paying recruiter" icon={<IconTrend width={17} height={17} />} tone="info" />
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
              placeholder="Search company or industry…"
              className="input pl-9"
              aria-label="Search companies"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Industry">
              <option value="">All industries</option>
              {industries.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState title="No companies match" description="Try a different search term." icon={<IconBuilding />} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((company) => (
            <Card key={company.id} hover className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-sm font-bold text-white">
                  {company.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink-900">{company.name}</h3>
                    {company.tier ? <Badge tone={company.tier === 'Tier 1' ? 'brand' : company.tier === 'Startup' ? 'warning' : 'neutral'}>{company.tier}</Badge> : null}
                  </div>
                  <p className="text-xs text-ink-500">
                    {company.industry ?? 'Industry not set'}
                    {company.hqCity ? ` · ${company.hqCity}` : ''}
                  </p>
                </div>
              </div>

              {company.description ? <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-ink-500">{company.description}</p> : null}

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-center">
                <div>
                  <p className="text-lg font-bold tabular-nums text-ink-900">{company.openJobs}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">open</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums text-emerald-600">{company.offersMade}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">offers</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums text-brand-700">{company.avgCtc ? inr(company.avgCtc) : '—'}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">avg ctc</p>
                </div>
              </div>

              {company.jobs.length ? (
                <ul className="mt-3 space-y-1.5">
                  {company.jobs.slice(0, 3).map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-2 text-xs">
                      <Link href={`/placements/${job.id}`} className="truncate text-ink-700 hover:text-brand-700">
                        {job.title}
                      </Link>
                      <span className="shrink-0 tabular-nums text-ink-400">{inr(job.ctcMax)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-400">
                <span>{company.hrName ? `${company.hrName} · ${company.hrEmail}` : 'No HR contact recorded'}</span>
                {company.website ? (
                  <a href={company.website} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:text-brand-700">
                    Website
                  </a>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddCompanyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          companies.reload();
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function AddCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    website: '',
    industry: '',
    tier: 'Tier 2',
    hqCity: '',
    hrName: '',
    hrEmail: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createCompany({
        name: form.name,
        website: form.website || undefined,
        industry: form.industry || undefined,
        tier: form.tier,
        hqCity: form.hqCity || undefined,
        hrName: form.hrName || undefined,
        hrEmail: form.hrEmail || undefined,
        description: form.description || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the company');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add recruiter"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!form.name} onClick={() => void submit()}>
            Save company
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Company name" placeholder="Vertex Analytics" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Tier" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
            <option>Tier 1</option>
            <option>Tier 2</option>
            <option>Startup</option>
            <option>Service</option>
            <option>Product</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Industry" placeholder="Data & AI" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <Input label="HQ city" placeholder="Bengaluru" value={form.hqCity} onChange={(e) => setForm({ ...form, hqCity: e.target.value })} />
        </div>

        <Input label="Website" placeholder="https://example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="HR contact name" placeholder="Priyanka Rao" value={form.hrName} onChange={(e) => setForm({ ...form, hrName: e.target.value })} />
          <Input label="HR email" type="email" placeholder="talent@example.com" value={form.hrEmail} onChange={(e) => setForm({ ...form, hrEmail: e.target.value })} />
        </div>

        <Textarea label="About the company" placeholder="What they do, hiring reputation, interview style…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      </div>
    </Modal>
  );
}
