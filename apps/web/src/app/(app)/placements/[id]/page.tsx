'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRoleFlags } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { APPLICATION_STATUS_META, JOB_TYPE_LABEL, daysUntil, formatDate, inr, scoreTone } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValue,
  LoadingBlock,
  Modal,
  ProgressBar,
  ScoreRing,
  SectionTitle,
  StatCard,
  Textarea,
  Tooltip,
} from '@/components/ui/Primitives';
import { FunnelChart } from '@/components/ui/Charts';
import { IconAlert, IconBriefcase, IconCheck, IconFile, IconSparkles, IconTarget, IconUsers, IconX } from '@/components/ui/Icons';
import type { AiMatch, AtsResult, InterviewQuestion } from '@/lib/types';

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isStudent, isStaff } = useRoleFlags();

  const job = useAsync(() => api.job(id), [id]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyNote, setApplyNote] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);

  // staff tools
  const [shortlist, setShortlist] = useState<{ summary: string; shortlist: AiMatch[]; poolSize: number; latencyMs: number } | null>(null);
  const [shortlisting, setShortlisting] = useState(false);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [matcher, setMatcher] = useState<{ matches: AiMatch[]; poolSize: number; provider: string } | null>(null);
  const [matching, setMatching] = useState(false);

  // student tools
  const [ats, setAts] = useState<AtsResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [prep, setPrep] = useState<InterviewQuestion[] | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);

  const apply = async () => {
    setApplying(true);
    try {
      const result = await api.apply(id, applyNote || undefined);
      setApplyResult({
        ok: true,
        message: `Application submitted${result.matchScore !== null ? ` · AI match score ${result.matchScore}/100` : ''}`,
        warnings: result.warnings,
      });
      setApplyOpen(false);
      setApplyNote('');
      job.reload();
    } catch (err) {
      setApplyResult({
        ok: false,
        message:
          err instanceof ApiError
            ? Array.isArray(err.details)
              ? `${err.message}: ${(err.details as string[]).join(', ')}`
              : err.message
            : 'Could not submit the application.',
      });
    } finally {
      setApplying(false);
    }
  };

  const runShortlist = async () => {
    setShortlisting(true);
    setShortlistError(null);
    try {
      setShortlist(await api.aiShortlist(id, 12));
    } catch (err) {
      setShortlistError(err instanceof Error ? err.message : 'AI shortlist failed');
    } finally {
      setShortlisting(false);
    }
  };

  const runMatcher = async () => {
    setMatching(true);
    setShortlistError(null);
    try {
      const result = await api.jobMatches(id, 15);
      setMatcher({ matches: result.matches, poolSize: result.poolSize, provider: result.provider });
    } catch (err) {
      setShortlistError(err instanceof Error ? err.message : 'Matching failed');
    } finally {
      setMatching(false);
    }
  };

  const runAts = async () => {
    setAtsLoading(true);
    try {
      setAts(await api.aiAtsScore(id));
    } catch (err) {
      setShortlistError(err instanceof Error ? err.message : 'ATS scoring failed');
    } finally {
      setAtsLoading(false);
    }
  };

  const runPrep = async () => {
    setPrepLoading(true);
    try {
      const result = await api.aiInterviewPrep(id, 8);
      setPrep(result.questions);
    } catch (err) {
      setShortlistError(err instanceof Error ? err.message : 'Could not generate questions');
    } finally {
      setPrepLoading(false);
    }
  };

  if (job.loading) return <LoadingBlock rows={6} label="Loading posting" />;
  if (job.error) return <ErrorState message={job.error} onRetry={job.reload} />;
  if (!job.data) return <EmptyState title="Posting not found" />;

  const j = job.data;
  const days = daysUntil(j.deadline);
  const funnelStages = j.funnel.map((stage) => ({
    ...stage,
    label: APPLICATION_STATUS_META[stage.status]?.label ?? stage.status,
  }));

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------- header */}
      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={j.status === 'OPEN' ? 'success' : 'muted'}>{j.status.toLowerCase()}</Badge>
              <Badge tone="neutral">{JOB_TYPE_LABEL[j.type]}</Badge>
              {j.tier ? <Badge tone="brand">{j.tier}</Badge> : null}
              {days <= 5 && j.status === 'OPEN' ? <Badge tone="danger">{days > 0 ? `${days} day(s) left` : 'Deadline passed'}</Badge> : null}
            </div>

            <h1 className="mt-2.5 text-xl font-bold text-ink-900">{j.title}</h1>
            <p className="mt-1 text-sm text-ink-600">
              <Link href="/companies" className="font-semibold text-brand-700 hover:text-brand-800">
                {j.company.name}
              </Link>{' '}
              · {j.location} · {j.workMode}
            </p>

            <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Compensation</p>
                <p className="text-sm font-bold text-ink-900">
                  {inr(j.ctcMin)} – {inr(j.ctcMax)}
                </p>
                {j.stipendPerMonth ? <p className="text-xs text-emerald-600">₹{j.stipendPerMonth.toLocaleString('en-IN')}/month</p> : null}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Eligibility</p>
                <p className="text-sm font-medium text-ink-800">CGPA ≥ {j.minCgpa.toFixed(1)} · ≤ {j.maxBacklogs} backlog(s)</p>
                <p className="text-xs text-ink-500">{j.allowedDepartments.length ? j.allowedDepartments.join(', ') : 'All branches'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Openings</p>
                <p className="text-sm font-medium text-ink-800">{j.openings} position(s)</p>
                <p className="text-xs text-ink-500">{j.eligibleCount} students currently eligible</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Deadline</p>
                <p className="text-sm font-medium text-ink-800">{formatDate(j.deadline)}</p>
                <p className="text-xs text-ink-500">Posted {formatDate(j.postedAt)}</p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:w-52">
            {isStudent ? (
              <>
                <Button onClick={() => setApplyOpen(true)} disabled={j.status !== 'OPEN' || days < 0} icon={<IconBriefcase width={15} height={15} />}>
                  {j.status !== 'OPEN' ? 'Applications closed' : days < 0 ? 'Deadline passed' : 'Apply now'}
                </Button>
                <Button variant="secondary" loading={atsLoading} onClick={() => void runAts()} icon={<IconFile width={15} height={15} />}>
                  Score my resume
                </Button>
                <Button variant="secondary" loading={prepLoading} onClick={() => void runPrep()} icon={<IconSparkles width={15} height={15} />}>
                  Interview prep
                </Button>
              </>
            ) : (
              <>
                <Button loading={shortlisting} onClick={() => void runShortlist()} icon={<IconSparkles width={15} height={15} />}>
                  AI shortlist
                </Button>
                <Button variant="secondary" loading={matching} onClick={() => void runMatcher()} icon={<IconTarget width={15} height={15} />}>
                  Ranked matcher
                </Button>
                <Link href={`/pipeline?jobId=${j.id}`}>
                  <Button variant="secondary" className="w-full">
                    Open pipeline
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {applyResult ? (
          <div
            className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
              applyResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <div>
              <p className="font-semibold">{applyResult.message}</p>
              {applyResult.warnings?.length ? (
                <ul className="mt-1 list-inside list-disc text-xs">
                  {applyResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button onClick={() => setApplyResult(null)} aria-label="Dismiss">
              <IconX width={15} height={15} />
            </button>
          </div>
        ) : null}
      </Card>

      {shortlistError ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <IconAlert width={16} height={16} className="mt-0.5 shrink-0" />
          <span>{shortlistError}</span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* -------------------------------------------------- description */}
        <Card className="lg:col-span-2">
          <CardHeader title="Role description" subtitle={`${j.company.name} · ${j.industry ?? 'Recruiter'}`} icon={<IconBriefcase width={16} height={16} />} />
          <div className="space-y-4 p-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{j.description}</p>

            {j.skills.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Required skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {j.skills.map((skill) => (
                    <span key={skill} className="rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <KeyValue
              columns={3}
              items={[
                { label: 'Batches', value: j.batches.length ? j.batches.join(', ') : 'Any' },
                { label: 'Bond', value: j.bondMonths ? `${j.bondMonths} months` : 'None' },
                { label: 'Applicants', value: `${j.applicants} student(s)` },
              ]}
            />

            {j.company.hrEmail ? (
              <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-xs text-ink-600">
                <p className="font-semibold text-ink-700">Recruiter contact</p>
                <p className="mt-0.5">
                  {j.company.hrName ?? 'HR'} · {j.company.hrEmail}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ------------------------------------------------------- funnel */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Hiring funnel" subtitle={`${j.applicants} applicants`} icon={<IconUsers width={16} height={16} />} />
            <div className="p-4">
              {funnelStages.length ? (
                <FunnelChart data={funnelStages} />
              ) : (
                <p className="py-6 text-center text-sm text-ink-400">No applications yet</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Posting health" icon={<IconTarget width={16} height={16} />} />
            <div className="space-y-3 p-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-500">Eligible pool coverage</span>
                  <span className="font-semibold text-ink-800">
                    {j.eligibleCount ? Math.min(100, Math.round((j.applicants / j.eligibleCount) * 100)) : 0}%
                  </span>
                </div>
                <ProgressBar value={j.eligibleCount ? Math.min(100, (j.applicants / j.eligibleCount) * 100) : 0} />
                <p className="mt-1 text-[11px] text-ink-400">
                  {j.applicants} applied of {j.eligibleCount} eligible students
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-500">Openings filled (offers)</span>
                  <span className="font-semibold text-ink-800">
                    {j.funnel.find((f) => f.status === 'OFFERED')?.count ?? 0}/{j.openings}
                  </span>
                </div>
                <ProgressBar
                  value={j.openings ? Math.min(100, ((j.funnel.find((f) => f.status === 'OFFERED')?.count ?? 0) / j.openings) * 100) : 0}
                  tone="bg-emerald-500"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* --------------------------------------------------- ATS (student) */}
      {isStudent && ats ? (
        <Card>
          <CardHeader
            title="ATS resume analysis"
            subtitle={`Scored against ${j.company.name} — ${j.title}`}
            icon={<IconFile width={16} height={16} />}
            action={<Badge tone={scoreTone(ats.score).tone}>{ats.verdict}</Badge>}
          />
          <div className="grid gap-5 p-5 lg:grid-cols-[auto_1fr_1fr]">
            <div className="flex justify-center">
              <ScoreRing score={ats.score} size={110} label="ATS score" />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Section checks</p>
              <ul className="space-y-1.5">
                {ats.sectionChecks.map((check) => (
                  <li key={check.section} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${check.present ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {check.present ? <IconCheck width={10} height={10} /> : <IconX width={10} height={10} />}
                    </span>
                    <span>
                      <span className="font-semibold text-ink-700">{check.section}</span>
                      <span className="block text-ink-500">{check.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Keyword coverage</p>
              <div className="flex flex-wrap gap-1">
                {ats.matchedKeywords.map((keyword) => (
                  <span key={keyword} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    {keyword}
                  </span>
                ))}
                {ats.missingKeywords.map((keyword) => (
                  <span key={keyword} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">
                    {keyword}
                  </span>
                ))}
              </div>

              {ats.suggestions.length ? (
                <>
                  <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-400">How to improve</p>
                  <ul className="space-y-1.5">
                    {ats.suggestions.map((suggestion) => (
                      <li key={suggestion} className="flex gap-2 text-xs text-ink-600">
                        <span className="text-brand-500">→</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* --------------------------------------------- interview prep */}
      {isStudent && prep ? (
        <Card>
          <CardHeader title="Interview preparation" subtitle={`Likely questions for ${j.title} at ${j.company.name}`} icon={<IconSparkles width={16} height={16} />} />
          <ol className="divide-y divide-ink-100">
            {prep.map((question, index) => (
              <li key={question.question} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={question.difficulty === 'Advanced' ? 'danger' : question.difficulty === 'Medium' ? 'warning' : 'neutral'}>
                        {question.difficulty}
                      </Badge>
                      <Badge tone="brand">{question.category}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-ink-800">{question.question}</p>
                    {question.idealAnswer ? <p className="mt-1 text-xs text-ink-500">{question.idealAnswer}</p> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* ------------------------------------------- AI shortlist (staff) */}
      {isStaff && shortlist ? (
        <Card>
          <CardHeader
            title="AI shortlist"
            subtitle={`${shortlist.poolSize} candidates reviewed · generated in ${shortlist.latencyMs} ms`}
            icon={<IconSparkles width={16} height={16} />}
            action={<Badge tone="brand">FAISS + skill scoring</Badge>}
          />
          <div className="border-b border-ink-100 bg-brand-50/50 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Recruiter briefing</p>
            <p className="mt-1 text-sm leading-relaxed text-brand-900">{shortlist.summary}</p>
          </div>
          <CandidateTable matches={shortlist.shortlist} />
        </Card>
      ) : null}

      {isStaff && matcher ? (
        <Card>
          <CardHeader
            title="Ranked candidate matcher"
            subtitle={`Pool of ${matcher.poolSize} · provider ${matcher.provider}`}
            icon={<IconTarget width={16} height={16} />}
          />
          <CandidateTable matches={matcher.matches} />
        </Card>
      ) : null}

      {isStaff && j.topCandidates.length ? (
        <Card>
          <CardHeader title="Top applicants" subtitle="Already applied — sorted by AI match score" icon={<IconUsers width={16} height={16} />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-2 text-left">Candidate</th>
                  <th className="px-3 py-2 text-center">Match</th>
                  <th className="px-3 py-2 text-center">ATS</th>
                  <th className="px-3 py-2 text-left">Skills</th>
                  <th className="px-5 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {j.topCandidates.map((candidate) => (
                  <tr key={candidate.applicationId} className="border-b border-ink-100 last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/students/${candidate.studentId}`} className="font-semibold text-ink-800 hover:text-brand-700">
                        {candidate.name}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {candidate.rollNo} · {candidate.department} · CGPA {candidate.cgpa.toFixed(2)}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {candidate.matchScore !== null ? (
                        <span className={`font-bold tabular-nums ${scoreTone(candidate.matchScore).text}`}>{candidate.matchScore}</span>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-ink-600">{candidate.atsScore ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {candidate.matchedSkills.slice(0, 3).map((skill) => (
                          <span key={skill} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                            {skill}
                          </span>
                        ))}
                        {candidate.missingSkills.slice(0, 2).map((skill) => (
                          <span key={skill} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={APPLICATION_STATUS_META[candidate.status].tone}>{APPLICATION_STATUS_META[candidate.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* -------------------------------------------------- apply modal */}
      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title={`Apply · ${j.title}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button loading={applying} onClick={() => void apply()}>
              Submit application
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-sm">
            <p className="font-semibold text-ink-800">{j.company.name}</p>
            <p className="text-xs text-ink-500">
              {j.title} · {j.location} · {inr(j.ctcMin)} – {inr(j.ctcMax)} · closes {formatDate(j.deadline)}
            </p>
          </div>

          <Textarea
            label="Cover note (optional)"
            hint="Tell the recruiter why you fit. The AI also scores your resume against this posting automatically."
            placeholder="I've built two production React applications and interned on a Node.js backend…"
            value={applyNote}
            onChange={(e) => setApplyNote(e.target.value)}
          />

          <ul className="space-y-1.5 text-xs text-ink-500">
            <li className="flex items-center gap-2">
              <IconCheck width={12} height={12} className="text-emerald-600" /> Your profile and skills are attached automatically
            </li>
            <li className="flex items-center gap-2">
              <IconCheck width={12} height={12} className="text-emerald-600" /> AI match + ATS scores are computed on submit
            </li>
            <li className="flex items-center gap-2">
              <IconCheck width={12} height={12} className="text-emerald-600" /> The placement cell is notified immediately
            </li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}

function CandidateTable({ matches }: { matches: AiMatch[] }) {
  if (!matches.length) {
    return <EmptyState title="No candidates in the pool" description="Widen the branch/batch filters or lower the CGPA cut-off." />;
  }

  const eligible = matches.filter((m) => m.eligible);

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap gap-3 border-b border-ink-100 px-5 py-3">
        <StatCard label="Shortlisted" value={eligible.length} hint="pass every eligibility gate" />
        <StatCard label="Top score" value={matches[0]?.score ?? 0} hint="out of 100" tone="brand" />
        <StatCard
          label="Avg skill match"
          value={`${Math.round(matches.slice(0, 5).reduce((sum, m) => sum + m.skillScore, 0) / Math.min(5, matches.length))}%`}
          hint="across top 5"
          tone="info"
        />
      </div>

      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-500">
            <th className="px-5 py-2 text-left">Candidate</th>
            <th className="px-3 py-2 text-center">Score</th>
            <th className="px-3 py-2 text-center">Semantic</th>
            <th className="px-3 py-2 text-center">Skills</th>
            <th className="px-3 py-2 text-left">AI rationale</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.id} className="border-b border-ink-100 last:border-0 align-top">
              <td className="px-5 py-3">
                <Link href={`/students/${match.id}`} className="font-semibold text-ink-800 hover:text-brand-700">
                  {match.name ?? match.id}
                </Link>
                <div className="mt-1">
                  {match.eligible ? <Badge tone="success">Eligible</Badge> : <Badge tone="danger">Gated</Badge>}
                </div>
                {match.blockers.length ? <p className="mt-1 max-w-[14rem] text-[11px] text-rose-600">{match.blockers.join(' · ')}</p> : null}
              </td>
              <td className="px-3 py-3 text-center">
                <Tooltip content={`Semantic ${match.semanticScore} · Skill ${match.skillScore}`}>
                  <span className={`text-base font-bold tabular-nums ${scoreTone(match.score).text}`}>{match.score}</span>
                </Tooltip>
              </td>
              <td className="px-3 py-3">
                <div className="mx-auto w-20">
                  <ProgressBar value={match.semanticScore} tone="bg-sky-500" />
                  <p className="mt-0.5 text-center text-[10px] tabular-nums text-ink-400">{match.semanticScore}%</p>
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="mx-auto w-20">
                  <ProgressBar value={match.skillScore} tone={scoreTone(match.skillScore).bar} />
                  <p className="mt-0.5 text-center text-[10px] tabular-nums text-ink-400">{match.skillScore}%</p>
                </div>
              </td>
              <td className="px-3 py-3">
                <p className="max-w-md text-xs leading-relaxed text-ink-600">{match.rationale}</p>
                {match.matchedSkills.length || match.missingSkills.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {match.matchedSkills.slice(0, 4).map((skill) => (
                      <span key={skill} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        ✓ {skill}
                      </span>
                    ))}
                    {match.missingSkills.slice(0, 3).map((skill) => (
                      <span key={skill} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        gap: {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
