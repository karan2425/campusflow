'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { PLACEMENT_STATUS_META, ROLE_LABEL, formatDate, scoreTone } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  KeyValue,
  LoadingBlock,
  ProgressBar,
  ScoreRing,
  SectionTitle,
  StatCard,
  Textarea,
} from '@/components/ui/Primitives';
import { IconCheck, IconFile, IconSparkles, IconTarget, IconTrend, IconX } from '@/components/ui/Icons';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { isStudent } = { isStudent: user?.role === 'STUDENT' };
  const analytics = useAsync(() => (isStudent && user?.student?.id ? api.studentAnalytics(user.student.id) : Promise.resolve(null)), [isStudent, user?.student?.id]);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    city: '',
    about: '',
    githubUrl: '',
    linkedinUrl: '',
    codingScore: '',
    githubScore: '',
    skills: '',
    resumeText: '',
  });
  const [password, setPassword] = useState({ current: '', next: '' });
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Hydrate the form once the full student profile arrives.
  const profile = useAsync(() => (user?.student?.id ? api.student(user.student.id) : Promise.resolve(null)), [user?.student?.id]);

  useEffect(() => {
    if (!user) return;
    setForm((previous) => ({ ...previous, name: user.name, phone: user.phone ?? '' }));
  }, [user]);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      name: profile.data.name,
      phone: profile.data.phone ?? '',
      city: profile.data.city ?? '',
      about: profile.data.about ?? '',
      githubUrl: profile.data.githubUrl ?? '',
      linkedinUrl: profile.data.linkedinUrl ?? '',
      codingScore: profile.data.codingScore?.toString() ?? '',
      githubScore: profile.data.githubScore?.toString() ?? '',
      skills: profile.data.skills.join(', '),
      resumeText: '',
    });
  }, [profile.data]);

  const saveProfile = async () => {
    if (!user?.student?.id) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.updateStudent(user.student.id, {
        name: form.name,
        phone: form.phone || undefined,
        city: form.city || undefined,
        about: form.about || undefined,
        githubUrl: form.githubUrl || undefined,
        linkedinUrl: form.linkedinUrl || undefined,
        codingScore: form.codingScore ? Number(form.codingScore) : undefined,
        githubScore: form.githubScore ? Number(form.githubScore) : undefined,
        skills: form.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
        ...(form.resumeText.trim() ? { resumeText: form.resumeText } : {}),
      });
      setNotice({ tone: 'ok', text: 'Profile updated — your AI match scores will use the new data on the next run.' });
      profile.reload();
      analytics.reload();
      await refresh();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save your profile' });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setSavingPassword(true);
    setNotice(null);
    try {
      await api.changePassword(password.current, password.next);
      setNotice({ tone: 'ok', text: 'Password updated.' });
      setPassword({ current: '', next: '' });
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not change the password' });
    } finally {
      setSavingPassword(false);
    }
  };

  const parseResume = async () => {
    if (!form.resumeText.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const parsed = await api.aiParseResume(form.resumeText);
      setForm((previous) => ({ ...previous, skills: parsed.skills.slice(0, 30).join(', ') }));
      setNotice({ tone: 'ok', text: `Extracted ${parsed.skills.length} skills from your resume. Review and save.` });
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Resume parsing failed' });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <LoadingBlock rows={5} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Profile & settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          {ROLE_LABEL[user.role]} account · {user.email}
        </p>
      </div>

      {notice ? (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium ${
            notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <IconX width={15} height={15} />
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------------- account */}
        <Card>
          <CardHeader title="Account" subtitle="Identity and access" icon={<IconTarget width={16} height={16} />} />
          <div className="space-y-4 p-4">
            <KeyValue
              columns={1}
              items={[
                { label: 'Name', value: user.name },
                { label: 'Email', value: user.email },
                { label: 'Role', value: ROLE_LABEL[user.role] },
                { label: 'Last login', value: user.lastLoginAt ? formatDate(user.lastLoginAt, true) : '—' },
              ]}
            />
            {user.student ? (
              <div className="space-y-2 rounded-lg border border-ink-100 bg-ink-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Student record</p>
                <KeyValue
                  columns={1}
                  items={[
                    { label: 'Roll number', value: user.student.rollNo },
                    { label: 'Branch', value: user.student.departmentCode },
                    { label: 'Batch', value: user.student.batch },
                    { label: 'CGPA', value: user.student.cgpa.toFixed(2) },
                    {
                      label: 'Placement status',
                      value: <Badge tone={PLACEMENT_STATUS_META[user.student.placementStatus].tone}>{PLACEMENT_STATUS_META[user.student.placementStatus].label}</Badge>,
                    },
                  ]}
                />
                <p className="text-[11px] text-ink-400">Roll number, branch and CGPA are maintained by the institute.</p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* -------------------------------------------------------- profile */}
        <div className="space-y-5 lg:col-span-2">
          {isStudent ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Readiness"
                  value={`${analytics.data?.readiness ?? 0}%`}
                  hint="profile completeness for recruiters"
                  icon={<IconTarget width={17} height={17} />}
                  tone={(analytics.data?.readiness ?? 0) >= 70 ? 'success' : 'warning'}
                />
                <StatCard
                  label="Best match score"
                  value={analytics.data?.stats.bestMatchScore || '—'}
                  hint={`avg ${analytics.data?.stats.avgMatchScore ?? 0}/100`}
                  icon={<IconTrend width={17} height={17} />}
                  tone="brand"
                />
                <StatCard
                  label="Attendance"
                  value={`${analytics.data?.attendancePct ?? 0}%`}
                  hint={(analytics.data?.attendancePct ?? 0) >= 75 ? 'meets requirement' : 'below requirement'}
                  icon={<IconCheck width={17} height={17} />}
                  tone={(analytics.data?.attendancePct ?? 0) >= 75 ? 'success' : 'danger'}
                />
              </div>

              {analytics.data ? (
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <ScoreRing score={analytics.data.readiness} size={84} label="Readiness" />
                    <ul className="grid flex-1 gap-2 sm:grid-cols-2">
                      {analytics.data.profileChecks.map((check) => (
                        <li key={check.label} className="flex items-center gap-2 text-sm">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              check.done ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400'
                            }`}
                          >
                            {check.done ? <IconCheck width={12} height={12} /> : <IconX width={12} height={12} />}
                          </span>
                          <span className={check.done ? 'text-ink-600' : 'font-medium text-ink-800'}>{check.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ) : null}

              <Card>
                <CardHeader title="Edit profile" subtitle="Everything here feeds the AI matcher and recruiter view" icon={<IconFile width={16} height={16} />} />
                <div className="space-y-4 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    <Input label="Coding score" type="number" placeholder="0–1000" value={form.codingScore} onChange={(e) => setForm({ ...form, codingScore: e.target.value })} />
                    <Input label="GitHub score" type="number" placeholder="0–1000" value={form.githubScore} onChange={(e) => setForm({ ...form, githubScore: e.target.value })} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="GitHub URL" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
                    <Input label="LinkedIn URL" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
                  </div>

                  <Input
                    label="Skills"
                    hint="Comma separated. The matcher is synonym-aware, so React / ReactJS both work."
                    placeholder="React, Node.js, PostgreSQL, Docker, Python"
                    value={form.skills}
                    onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  />

                  <Textarea label="About" hint="Two or three sentences on what you build and what you're aiming for." value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />

                  <div>
                    <Textarea
                      label="Resume text"
                      hint={profile.data?.hasResumeText ? 'A resume is already on file. Pasting new text replaces it and re-extracts your skills.' : 'Paste your resume so the ATS scorer and matcher can read it.'}
                      placeholder="Paste the full text of your resume…"
                      value={form.resumeText}
                      onChange={(e) => setForm({ ...form, resumeText: e.target.value })}
                      className="min-h-[180px] font-mono text-xs"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" loading={saving} disabled={!form.resumeText.trim()} onClick={() => void parseResume()} icon={<IconSparkles width={14} height={14} />}>
                        Extract skills with AI
                      </Button>
                      {profile.data?.hasResumeText ? <Badge tone="success">resume on file</Badge> : <Badge tone="warning">no resume yet</Badge>}
                    </div>
                  </div>

                  <div className="border-t border-ink-100 pt-4">
                    <SectionTitle title="Profile strength" subtitle="Completeness drives recruiter visibility" />
                    <ProgressBar value={(analytics.data?.readiness ?? 0)} tone={scoreTone(analytics.data?.readiness ?? 0).bar} showLabel />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Link href={`/students/${user.student?.id ?? ''}`}>
                      <Button variant="secondary" size="sm">
                        View public profile
                      </Button>
                    </Link>
                    <Button size="sm" loading={saving} onClick={() => void saveProfile()}>
                      Save changes
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader title="Staff account" subtitle="Institute data is managed from the admin tools" icon={<IconTarget width={16} height={16} />} />
              <EmptyState
                title="No editable profile fields"
                description="Administrator, placement officer and faculty accounts are provisioned centrally. Use the dashboard tools to manage institute data."
                action={
                  <Link href="/dashboard">
                    <Button size="sm">Go to dashboard</Button>
                  </Link>
                }
              />
            </Card>
          )}

          {/* ------------------------------------------------------ security */}
          <Card>
            <CardHeader title="Security" subtitle="Change your password" icon={<IconTarget width={16} height={16} />} />
            <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Input
                label="Current password"
                type="password"
                value={password.current}
                onChange={(e) => setPassword({ ...password, current: e.target.value })}
              />
              <Input
                label="New password"
                type="password"
                hint="Minimum 8 characters"
                value={password.next}
                onChange={(e) => setPassword({ ...password, next: e.target.value })}
              />
              <Button
                variant="secondary"
                loading={savingPassword}
                disabled={!password.current || password.next.length < 8}
                onClick={() => void savePassword()}
              >
                Update
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
