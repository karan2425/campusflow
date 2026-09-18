'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth, useRoleFlags } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { formatDate, inr, scoreTone } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  LoadingBlock,
  ProgressBar,
  ScoreRing,
  SectionTitle,
  Select,
  StatCard,
  Tabs,
  Textarea,
  Tooltip,
} from '@/components/ui/Primitives';
import { IconAlert, IconCheck, IconFile, IconSparkles, IconTarget, IconUsers, IconX } from '@/components/ui/Icons';
import type { AiMatch, AtsResult, InterviewQuestion } from '@/lib/types';

type TabId = 'overview' | 'matching' | 'resume' | 'prep';

export default function AiStudioPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isStudent, isStaff } = useRoleFlags();
  const [tab, setTab] = useState<TabId>(isStudent ? 'overview' : 'matching');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900">
            AI studio
            <span className="rounded-md bg-gradient-to-r from-brand-500 to-violet-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Gemini + FAISS
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Semantic candidate matching, resume intelligence and interview preparation — every output is explainable
          </p>
        </div>
        <Link href="/ai-studio">
          <Button variant="secondary" size="sm">
            Refresh
          </Button>
        </Link>
      </div>

      <Card className="p-1.5">
        <Tabs<TabId>
          active={tab}
          onChange={setTab}
          tabs={
            isStudent
              ? [
                  { id: 'overview', label: 'Recommendations' },
                  { id: 'resume', label: 'Resume & ATS' },
                  { id: 'prep', label: 'Interview prep' },
                ]
              : [
                  { id: 'overview', label: 'AI status' },
                  { id: 'matching', label: 'Candidate matching' },
                  { id: 'prep', label: 'Interview generator' },
                ]
          }
        />
      </Card>

      {tab === 'overview' ? <OverviewPanel /> : null}
      {tab === 'matching' ? <MatchingPanel /> : null}
      {tab === 'resume' ? <ResumePanel /> : null}
      {tab === 'prep' ? <InterviewPanel /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- overview
function OverviewPanel() {
  const { isStudent } = useRoleFlags();
  const health = useAsync(() => api.aiHealth(), []);
  const recommendations = useAsync(() => (isStudent ? api.aiRecommendations() : Promise.resolve(null)), [isStudent]);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        {isStudent ? (
          <>
            <CardHeader
              title="Ranked recommendations for you"
              subtitle="Computed by hybrid scoring: semantic similarity, skill overlap and eligibility"
              icon={<IconSparkles width={16} height={16} />}
            />
            {recommendations.loading ? (
              <LoadingBlock rows={4} />
            ) : !recommendations.data?.recommendations.length ? (
              <EmptyState title="No matching openings right now" description="All eligible roles may already be applied to, or none are open." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {recommendations.data.recommendations.map((match) => (
                  <li key={match.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/placements/${match.jobId}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
                          {match.title}
                        </Link>
                        <p className="text-xs text-ink-500">
                          {match.company} · {inr(match.ctcMax ?? 0)} · closes {formatDate(match.deadline ?? '')}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{match.rationale}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex gap-2">
                          <Tooltip content={`Semantic ${match.semanticScore}% · Skill ${match.skillScore}%`}>
                            <span className={`text-lg font-bold tabular-nums ${scoreTone(match.score).text}`}>{match.score}</span>
                          </Tooltip>
                        </div>
                        <Link href={`/placements/${match.jobId}`}>
                          <Button size="sm" variant="secondary" className="mt-1">
                            Open
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <AiInsights />
        )}
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Service status" subtitle="FastAPI microservice health" icon={<IconSparkles width={16} height={16} />} />
          <div className="space-y-3 p-4 text-sm">
            {health.loading ? (
              <LoadingBlock rows={3} />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Reachability</span>
                  <Badge tone={health.data?.reachable ? 'success' : 'danger'}>{health.data?.reachable ? 'online' : 'offline'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Embedding provider</span>
                  <span className="font-medium text-ink-800">{health.data?.provider ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Gemini</span>
                  <Badge tone={health.data?.geminiEnabled ? 'brand' : 'muted'}>
                    {health.data?.geminiEnabled ? 'enabled' : 'offline fallback'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Candidates indexed</span>
                  <span className="font-semibold tabular-nums text-ink-900">{health.data?.indexSize ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Round trip</span>
                  <span className="tabular-nums text-ink-700">{health.data?.roundTripMs ?? '—'} ms</span>
                </div>

                {!health.data?.reachable ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    Start the AI service: <code className="font-mono">cd apps/ai && uvicorn app.main:app --port 8000</code>
                  </p>
                ) : !health.data?.geminiEnabled ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Set <code className="font-mono">GEMINI_API_KEY</code> in <code className="font-mono">apps/ai/.env</code> for
                    Gemini-generated prose. Matching, ATS scoring and interview questions all work without it.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="How the score is built" icon={<IconTarget width={16} height={16} />} />
          <ul className="space-y-3 p-4 text-xs text-ink-600">
            <li>
              <div className="mb-1 flex justify-between font-semibold text-ink-800">
                <span>Semantic similarity</span>
                <span>35%</span>
              </div>
              <ProgressBar value={35} tone="bg-sky-500" />
              <p className="mt-1">FAISS cosine similarity over profile and job-description embeddings.</p>
            </li>
            <li>
              <div className="mb-1 flex justify-between font-semibold text-ink-800">
                <span>Skill overlap</span>
                <span>50%</span>
              </div>
              <ProgressBar value={50} tone="bg-brand-500" />
              <p className="mt-1">Synonym-aware matching of required skills against the student's listed skills.</p>
            </li>
            <li>
              <div className="mb-1 flex justify-between font-semibold text-ink-800">
                <span>Academic & activity fit</span>
                <span>15%</span>
              </div>
              <ProgressBar value={15} tone="bg-emerald-500" />
              <p className="mt-1">CGPA headroom over the cut-off, backlogs, coding and GitHub signals.</p>
            </li>
            <li className="rounded-lg bg-ink-50 px-3 py-2 text-ink-500">
              Eligibility (CGPA, backlogs, branch, batch) is a hard gate: ineligible candidates always rank below eligible
              ones, whatever their text similarity.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AiInsights() {
  const insights = useAsync(() => api.aiInsights(), []);

  if (insights.loading) return <LoadingBlock rows={5} />;
  if (!insights.data) return <EmptyState title="No AI activity logged yet" description="Run a match or shortlist to populate this log." />;

  return (
    <>
      <CardHeader
        title="AI usage telemetry"
        subtitle="Every model call is persisted with provider, latency and outcome"
        icon={<IconSparkles width={16} height={16} />}
        action={<Badge tone="brand">{insights.data.totals.interactions} total calls</Badge>}
      />
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <StatCard label="Total calls" value={insights.data.totals.interactions} icon={<IconSparkles width={17} height={17} />} />
        <StatCard label="Avg latency" value={`${insights.data.totals.avgLatencyMs} ms`} tone="info" icon={<IconTarget width={17} height={17} />} />
        <StatCard label="Capabilities" value={insights.data.byKind.length} tone="brand" icon={<IconUsers width={17} height={17} />} />
      </div>
      <div className="border-t border-ink-100 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">By capability</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {insights.data.byKind.map((entry) => (
            <li key={entry.kind} className="rounded-lg border border-ink-100 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-700">{entry.kind.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="tabular-nums text-ink-500">
                  {entry.count} · {entry.avgLatencyMs} ms avg
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-ink-100 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Recent calls</p>
        <ul className="space-y-2">
          {insights.data.recent.slice(0, 8).map((call) => (
            <li key={call.id} className="rounded-lg border border-ink-100 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={call.provider === 'gemini' ? 'brand' : 'muted'}>{call.kind.replace(/_/g, ' ').toLowerCase()}</Badge>
                <span className="text-[11px] text-ink-400">
                  {call.user} · {call.latencyMs ?? '—'} ms
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-600">{call.prompt}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- matching
function MatchingPanel() {
  const jobs = useAsync(() => api.jobs({ status: 'OPEN', pageSize: 50 }), []);
  const [jobId, setJobId] = useState('');
  const [topK, setTopK] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; shortlist: AiMatch[]; poolSize: number; latencyMs: number; company: string; title: string } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexNotice, setIndexNotice] = useState<string | null>(null);

  const run = async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.aiShortlist(jobId, Number(topK)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shortlist failed');
    } finally {
      setBusy(false);
    }
  };

  const rebuildIndex = async () => {
    setIndexing(true);
    setIndexNotice(null);
    try {
      const response = await api.aiSyncIndex();
      setIndexNotice(`Indexed ${response.indexed} candidates into ${response.dimension}-dimensional vectors in ${response.latencyMs} ms.`);
    } catch (err) {
      setIndexNotice(err instanceof Error ? err.message : 'Indexing failed');
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <Select label="Job posting" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Select a posting to shortlist…</option>
              {(jobs.data?.items ?? []).map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.title} ({job.applicants} applicants)
                </option>
              ))}
            </Select>
          </div>
          <div className="w-32">
            <Select label="Shortlist size" value={topK} onChange={(e) => setTopK(e.target.value)}>
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="15">Top 15</option>
              <option value="25">Top 25</option>
            </Select>
          </div>
          <Button disabled={!jobId} loading={busy} onClick={() => void run()} icon={<IconSparkles width={15} height={15} />}>
            Generate shortlist
          </Button>
          <Button variant="secondary" loading={indexing} onClick={() => void rebuildIndex()}>
            Rebuild index
          </Button>
        </div>

        {indexNotice ? <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">{indexNotice}</p> : null}
        {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
      </Card>

      {result ? (
        <Card>
          <CardHeader
            title={`Shortlist · ${result.title} @ ${result.company}`}
            subtitle={`${result.poolSize} candidates reviewed · ${result.latencyMs} ms · persisted to matching applications`}
            icon={<IconUsers width={16} height={16} />}
          />
          <div className="border-b border-ink-100 bg-brand-50/50 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Recruiter briefing</p>
            <p className="mt-1 text-sm leading-relaxed text-brand-900">{result.summary}</p>
          </div>
          <ul className="divide-y divide-ink-100">
            {result.shortlist.map((match, index) => (
              <li key={match.id} className="flex flex-wrap items-start gap-4 px-5 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/students/${match.id}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
                      {match.name}
                    </Link>
                    {match.eligible ? <Badge tone="success">eligible</Badge> : <Badge tone="danger">gated</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{match.rationale}</p>
                  {match.matchedSkills.length || match.missingSkills.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {match.matchedSkills.map((skill) => (
                        <span key={skill} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          ✓ {skill}
                        </span>
                      ))}
                      {match.missingSkills.map((skill) => (
                        <span key={skill} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          gap: {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-lg font-bold tabular-nums ${scoreTone(match.score).text}`}>{match.score}</span>
                  <p className="text-[10px] uppercase text-ink-400">score</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="No shortlist generated yet"
            description="Pick a posting and generate a ranked shortlist. Each candidate gets a score, matched skills, gaps and a written rationale."
            icon={<IconSparkles />}
          />
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- resume
function ResumePanel() {
  const { user } = useAuth();
  const jobs = useAsync(() => api.jobs({ status: 'OPEN', pageSize: 50 }), []);
  const [jobId, setJobId] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ats, setAts] = useState<AtsResult | null>(null);
  const [parsed, setParsed] = useState<{ skills: string[]; education: string[]; projects: string[]; experience: string[]; summary: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const score = async () => {
    setBusy(true);
    setError(null);
    try {
      setAts(await api.aiAtsScore(jobId || undefined, resumeText || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not score the resume');
    } finally {
      setBusy(false);
    }
  };

  const parse = async () => {
    if (!resumeText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setParsed(await api.aiParseResume(resumeText));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the resume');
    } finally {
      setBusy(false);
    }
  };

  const saveToProfile = async () => {
    if (!user?.student?.id || !resumeText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.aiParseResume(resumeText, true);
      setError(null);
      setParsed(await api.aiParseResume(resumeText));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save to your profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Resume intelligence"
          subtitle="Paste resume text to score it against a posting and extract structured data"
          icon={<IconFile width={16} height={16} />}
        />
        <div className="space-y-3 p-4">
          <Select label="Score against" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">Generic software engineering benchmark</option>
            {(jobs.data?.items ?? []).map((job) => (
              <option key={job.id} value={job.id}>
                {job.company} — {job.title}
              </option>
            ))}
          </Select>

          <Textarea
            label="Resume text"
            hint="Leave empty to use the resume already on your profile."
            placeholder="Paste the full text of your resume here…"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="min-h-[220px] font-mono text-xs"
          />

          <div className="flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => void score()} icon={<IconTarget width={15} height={15} />}>
              Score with ATS
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void parse()} disabled={!resumeText.trim()}>
              Extract structure
            </Button>
            {user?.student?.id ? (
              <Button variant="secondary" loading={saving} onClick={() => void saveToProfile()} disabled={!resumeText.trim()}>
                Save to my profile
              </Button>
            ) : null}
          </div>

          {error ? (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <IconAlert width={14} height={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      </Card>

      <div className="space-y-5">
        {ats ? (
          <Card>
            <CardHeader
              title="ATS score"
              subtitle={ats.verdict}
              icon={<IconTarget width={16} height={16} />}
              action={<Badge tone={scoreTone(ats.score).tone}>{ats.score}/100</Badge>}
            />
            <div className="space-y-4 p-4">
              <div className="flex justify-center">
                <ScoreRing score={ats.score} size={100} label="ATS" />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Section coverage</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {ats.sectionChecks.map((check) => (
                    <li key={check.section} className="flex items-center gap-2 text-xs">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full ${check.present ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {check.present ? <IconCheck width={10} height={10} /> : <IconX width={10} height={10} />}
                      </span>
                      <span className={check.present ? 'text-ink-600' : 'font-medium text-ink-800'}>{check.section}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Keywords — {ats.matchedKeywords.length} matched, {ats.missingKeywords.length} missing
                </p>
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
              </div>

              {ats.suggestions.length ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Recommendations</p>
                  <ul className="space-y-1">
                    {ats.suggestions.map((suggestion) => (
                      <li key={suggestion} className="flex gap-2 text-xs text-ink-600">
                        <span className="text-brand-500">→</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {parsed ? (
          <Card>
            <CardHeader title="Extracted structure" subtitle={parsed.summary} icon={<IconFile width={16} height={16} />} />
            <div className="space-y-3 p-4 text-xs">
              <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-ink-400">Skills ({parsed.skills.length})</p>
                <div className="flex flex-wrap gap-1">
                  {parsed.skills.map((skill) => (
                    <span key={skill} className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              {(['education', 'projects', 'experience'] as const).map((section) =>
                parsed[section].length ? (
                  <div key={section}>
                    <p className="mb-1 font-semibold uppercase tracking-wide text-ink-400">{section}</p>
                    <ul className="space-y-0.5 text-ink-600">
                      {parsed[section].map((line, index) => (
                        <li key={`${section}-${index}`} className="line-clamp-2">
                          • {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          </Card>
        ) : null}

        {!ats && !parsed ? (
          <Card>
            <EmptyState
              title="Nothing analysed yet"
              description="Paste a resume and run an ATS score or structure extraction. Both work without an LLM key."
              icon={<IconFile />}
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- interview
function InterviewPanel() {
  const jobs = useAsync(() => api.jobs({ status: 'OPEN', pageSize: 50 }), []);
  const [jobId, setJobId] = useState('');
  const [count, setCount] = useState('8');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ role: string; company: string; questions: InterviewQuestion[]; latencyMs: number } | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.aiInterviewPrep(jobId || undefined, Number(count)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate questions');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <Select label="Target role" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Generic software engineering interview</option>
              {(jobs.data?.items ?? []).map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-32">
            <Select label="Questions" value={count} onChange={(e) => setCount(e.target.value)}>
              <option value="5">5</option>
              <option value="8">8</option>
              <option value="12">12</option>
              <option value="16">16</option>
            </Select>
          </div>
          <Button loading={busy} onClick={() => void generate()} icon={<IconSparkles width={15} height={15} />}>
            Generate questions
          </Button>
        </div>
        {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
      </Card>

      {result ? (
        <Card>
          <CardHeader
            title={`${result.role} interview bank`}
            subtitle={`${result.company} · ${result.questions.length} questions · generated in ${result.latencyMs} ms`}
            icon={<IconTarget width={16} height={16} />}
          />
          <ol className="divide-y divide-ink-100">
            {result.questions.map((question, index) => (
              <li key={question.question} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={question.difficulty === 'Advanced' ? 'danger' : question.difficulty === 'Medium' ? 'warning' : 'neutral'}>
                        {question.difficulty}
                      </Badge>
                      <Badge tone="brand">{question.category}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-ink-800">{question.question}</p>
                    {question.idealAnswer ? <p className="mt-1 text-xs text-ink-500">What a strong answer covers: {question.idealAnswer}</p> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="No question bank generated"
            description="Choose a role and generate a tailored question set, ordered from warm-up to advanced."
            icon={<IconTarget />}
          />
        </Card>
      )}
    </div>
  );
}
