'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Input, Select } from '@/components/ui/Primitives';
import {
  IconBriefcase,
  IconChart,
  IconCheck,
  IconGraduation,
  IconSparkles,
  IconTarget,
  IconUsers,
} from '@/components/ui/Icons';

const DEMO_ACCOUNTS = [
  {
    role: 'Placement Officer',
    email: 'officer@campusflow.dev',
    blurb: 'Pipeline, analytics, AI shortlisting',
    icon: <IconBriefcase width={15} height={15} />,
  },
  {
    role: 'Student',
    email: 'demo.student@campusflow.dev',
    blurb: 'Aarav Sharma · CSE 2026 · CGPA 8.74',
    icon: <IconGraduation width={15} height={15} />,
  },
  {
    role: 'Admin',
    email: 'admin@campusflow.dev',
    blurb: 'Full institute oversight',
    icon: <IconUsers width={15} height={15} />,
  },
  {
    role: 'Faculty',
    email: 'faculty@campusflow.dev',
    blurb: 'Courses, attendance, class rosters',
    icon: <IconTarget width={15} height={15} />,
  },
];

const HIGHLIGHTS = [
  { icon: <IconSparkles width={16} height={16} />, title: 'AI candidate matching', body: 'FAISS semantic search plus skill-overlap scoring ranks every applicant with a written rationale.' },
  { icon: <IconBriefcase width={16} height={16} />, title: 'End-to-end placement drive', body: 'Postings, applications, interview rounds, offers and student acceptances in one pipeline.' },
  { icon: <IconChart width={16} height={16} />, title: 'Placement analytics', body: 'Live placement rate, CTC bands, department comparison and recruiter leaderboards.' },
  { icon: <IconTarget width={16} height={16} />, title: 'Academics built in', body: 'Attendance tracking with automatic defaulter alerts, courses, grades and rosters.' },
];

export default function LoginPage() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password@123');
  const [submitting, setSubmitting] = useState<string | null>(null);

  const signIn = async (nextEmail: string, nextPassword: string) => {
    setSubmitting(nextEmail);
    try {
      await login(nextEmail, nextPassword);
    } catch {
      /* error text is surfaced through the auth context */
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------- brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 px-10 py-12 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: 'radial-gradient(1200px 600px at 15% -10%, #4f46e5 0%, transparent 55%), radial-gradient(900px 500px at 100% 100%, #7c3aed 0%, transparent 50%)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <IconGraduation width={22} height={22} />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">CampusFlow</p>
              <p className="text-xs text-white/70">College management & placement platform</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-md text-3xl font-bold leading-tight tracking-tight">
            Run the entire placement season from one place.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
            Student records, attendance, recruiter drives, interview rounds and offers — with an AI layer
            that matches candidates to roles and explains every decision.
          </p>

          <ul className="mt-9 max-w-md space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white">
                  {item.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs leading-relaxed text-white/65">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/60">
          <span className="inline-flex items-center gap-1.5"><IconCheck width={13} height={13} /> Next.js + TypeScript</span>
          <span className="inline-flex items-center gap-1.5"><IconCheck width={13} height={13} /> Express REST API</span>
          <span className="inline-flex items-center gap-1.5"><IconCheck width={13} height={13} /> PostgreSQL + Prisma</span>
          <span className="inline-flex items-center gap-1.5"><IconCheck width={13} height={13} /> FastAPI + Gemini + FAISS</span>
        </div>
      </section>

      {/* ----------------------------------------------------- login form */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white">
              <IconGraduation width={20} height={20} />
            </span>
            <div>
              <p className="font-bold text-ink-900">CampusFlow</p>
              <p className="text-xs text-ink-500">Placement & academics</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-ink-900">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500">Use a demo account below, or your institute credentials.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(email, password);
            }}
          >
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              placeholder="you@campusflow.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={submitting === email}>
              Sign in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Demo accounts</span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <ul className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  onClick={() => {
                    setEmail(account.email);
                    setPassword('Password@123');
                    void signIn(account.email, 'Password@123');
                  }}
                  disabled={submitting !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-left transition-all hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    {account.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-800">{account.role}</span>
                    <span className="block truncate text-xs text-ink-500">{account.blurb}</span>
                  </span>
                  {submitting === account.email ? (
                    <span className="text-xs font-semibold text-brand-600">Signing in…</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-xs text-ink-400">
            All demo accounts use the password <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-600">Password@123</code>
          </p>
        </div>
      </section>
    </div>
  );
}
