import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, ok } from '../../lib/http.js';
import { assertStudentScope, requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { aiClient, type JobProfile } from '../../services/aiClient.js';
import { toJobProfile, toStudentProfile } from '../../services/eligibility.js';

export const aiRouter = Router();

/** GET /api/v1/ai/health — surfaced in the web app's system status widget */
aiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const startedAt = Date.now();
    try {
      const { data } = await aiClient.health();
      return ok(res, { ...data, reachable: true, roundTripMs: Date.now() - startedAt });
    } catch (err) {
      return ok(res, {
        reachable: false,
        status: 'offline',
        provider: 'none',
        indexSize: 0,
        reason: (err as Error).message,
      });
    }
  }),
);

/**
 * POST /api/v1/ai/sync-index — push the whole candidate pool into the FAISS index.
 * Idempotent; call it after bulk imports or at the start of a placement season.
 */
aiRouter.post(
  '/sync-index',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  asyncHandler(async (req, res) => {
    const students = await prisma.student.findMany({
      include: {
        user: { select: { name: true } },
        department: { select: { code: true } },
      },
    });

    const result = await aiClient.indexStudents(students.map(toStudentProfile));

    return ok(res, {
      ...result.data,
      latencyMs: result.latencyMs,
      syncedAt: new Date().toISOString(),
    });
  }),
);

aiRouter.use(requireAuth);

/**
 * POST /api/v1/ai/chat — role-aware campus assistant.
 * The API injects live database context so the LLM answers about *this* campus,
 * not a generic one. Context is deliberately compact to keep prompts cheap.
 */
aiRouter.post(
  '/chat',
  validate(
    z.object({
      message: z.string().min(2).max(2000),
      history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .max(10)
        .default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { message, history } = req.body as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
    };
    const user = req.user!;

    const context: Record<string, unknown> = { role: user.role, userName: user.name };

    if (user.role === 'STUDENT' && user.studentId) {
      const student = await prisma.student.findUnique({
        where: { id: user.studentId },
        include: {
          user: true,
          department: true,
          applications: { include: { job: { include: { company: true } }, interviews: true } },
          offers: true,
        },
      });

      if (student) {
        const attendance = await prisma.attendanceRecord.groupBy({
          by: ['status'],
          where: { studentId: student.id },
          _count: { status: true },
        });
        const marked = attendance.reduce((s, a) => s + a._count.status, 0);
        const present = attendance
          .filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
          .reduce((s, a) => s + a._count.status, 0);

        const openJobs = await prisma.jobPosting.findMany({
          where: {
            status: 'OPEN',
            deadline: { gte: new Date() },
            minCgpa: { lte: student.cgpa },
            maxBacklogs: { gte: student.backlogs },
          },
          include: { company: { select: { name: true } } },
          orderBy: { ctcMax: 'desc' },
          take: 8,
        });

        context.student = {
          name: student.user.name,
          rollNo: student.rollNo,
          department: student.department.code,
          batch: student.batch,
          cgpa: student.cgpa,
          backlogs: student.backlogs,
          skills: student.skills,
          placementStatus: student.placementStatus,
          attendancePct: marked ? Math.round((present / marked) * 1000) / 10 : null,
          hasResume: Boolean(student.resumeText || student.resumeUrl),
          applications: student.applications.map((a) => ({
            company: a.job.company.name,
            role: a.job.title,
            status: a.status,
            matchScore: a.matchScore,
            nextInterview: a.interviews.find((i) => i.result === 'PENDING')?.scheduledAt ?? null,
          })),
          offers: student.offers.map((o) => ({ company: o.companyName, ctc: o.ctc, accepted: o.accepted })),
          eligibleOpenings: openJobs.map((j) => ({
            jobId: j.id,
            company: j.company.name,
            title: j.title,
            ctcMax: j.ctcMax,
            deadline: j.deadline,
            skills: j.skills,
          })),
        };
      }
    } else {
      const [studentCount, placedCount, openJobs, upcomingInterviews, topRecruiters] = await Promise.all([
        prisma.student.count(),
        prisma.student.count({ where: { placementStatus: 'PLACED' } }),
        prisma.jobPosting.count({ where: { status: 'OPEN', deadline: { gte: new Date() } } }),
        prisma.interview.findMany({
          where: { scheduledAt: { gte: new Date() }, result: 'PENDING' },
          take: 10,
          orderBy: { scheduledAt: 'asc' },
          include: {
            application: {
              include: {
                job: { include: { company: { select: { name: true } } } },
                student: { include: { user: { select: { name: true } }, department: true } },
              },
            },
          },
        }),
        prisma.offer.groupBy({ by: ['companyName'], _count: { companyName: true }, orderBy: { _count: { companyName: 'desc' } }, take: 5 }),
      ]);

      const offers = await prisma.offer.findMany({ select: { ctc: true } });

      context.placementCell = {
        totalStudents: studentCount,
        placed: placedCount,
        placementRate: studentCount ? Math.round((placedCount / studentCount) * 1000) / 10 : 0,
        activeOpenings: openJobs,
        avgCtc: offers.length
          ? Math.round((offers.reduce((s, o) => s + o.ctc, 0) / offers.length) * 10) / 10
          : 0,
        highestCtc: offers.length ? Math.max(...offers.map((o) => o.ctc)) : 0,
        topRecruiters: topRecruiters.map((r) => ({ company: r.companyName, offers: r._count.companyName })),
        upcomingInterviews: upcomingInterviews.map((i) => ({
          company: i.application.job.company.name,
          student: i.application.student.user.name,
          department: i.application.student.department.code,
          round: i.name,
          at: i.scheduledAt,
        })),
      };
    }

    const started = Date.now();
    const result = await aiClient.chat(message, context, history);

    await prisma.aIInteraction.create({
      data: {
        userId: user.sub,
        kind: 'CHAT',
        prompt: message,
        response: result.data.answer,
        latencyMs: result.data.latencyMs || Date.now() - started,
        provider: result.data.provider,
      },
    });

    return ok(res, {
      answer: result.data.answer,
      suggestedActions: result.data.suggestedActions ?? [],
      provider: result.data.provider,
      latencyMs: result.latencyMs,
    });
  }),
);

/** POST /api/v1/ai/resume/ats-score — ATS score of a student's resume vs a job */
aiRouter.post(
  '/resume/ats-score',
  validate(z.object({ jobId: z.string().optional(), resumeText: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { jobId, resumeText } = req.body as { jobId?: string; resumeText?: string };
    const user = req.user!;

    const studentId = user.role === 'STUDENT' ? user.studentId : (req.body as { studentId?: string }).studentId;
    if (!studentId) throw AppError.badRequest('studentId is required');
    assertStudentScope(req, studentId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, department: true },
    });
    if (!student) throw AppError.notFound('Student not found');

    const text = resumeText ?? student.resumeText;
    if (!text) throw AppError.badRequest('No resume text on file — upload a resume first');

    let jobProfile: JobProfile = {
      jobId: 'generic',
      companyName: 'Generic',
      title: 'Software Engineer',
      description: 'General campus placement role evaluated against standard software engineering expectations.',
      skills: student.skills,
      minCgpa: 6,
      maxBacklogs: 0,
      allowedDepartments: [],
      batches: [],
      location: 'India',
      ctcMax: 0,
    };

    if (jobId) {
      const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, include: { company: true } });
      if (!job) throw AppError.notFound('Job posting not found');
      jobProfile = toJobProfile(job);
    }

    const result = await aiClient.atsScore(text, jobProfile);

    await prisma.aIInteraction.create({
      data: {
        userId: user.sub,
        kind: 'ATS_SCORE',
        prompt: `ATS score for ${student.rollNo} vs ${jobProfile.companyName} ${jobProfile.title}`,
        response: JSON.stringify({ score: result.data.score, verdict: result.data.verdict }),
        latencyMs: result.latencyMs,
      },
    });

    if (jobId) {
      await prisma.application.updateMany({
        where: { jobId, studentId },
        data: { atsScore: result.data.score },
      });
    }

    return ok(res, { ...result.data, latencyMs: result.latencyMs });
  }),
);

/** POST /api/v1/ai/resume/parse — extract structured data from raw resume text */
aiRouter.post(
  '/resume/parse',
  validate(z.object({ resumeText: z.string().min(50), persist: z.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    const { resumeText, persist } = req.body as { resumeText: string; persist: boolean };
    const result = await aiClient.parseResume(resumeText);

    if (persist && req.user!.role === 'STUDENT' && req.user!.studentId) {
      await prisma.student.update({
        where: { id: req.user!.studentId },
        data: {
          resumeText,
          skills: result.data.skills.slice(0, 40),
        },
      });
    }

    return ok(res, result.data);
  }),
);

/** GET /api/v1/ai/recommendations — AI-ranked jobs for the signed-in student */
aiRouter.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const studentId = user.role === 'STUDENT' ? user.studentId : (req.query.studentId as string | undefined);
    if (!studentId) throw AppError.badRequest('studentId is required');
    if (user.role === 'STUDENT') assertStudentScope(req, studentId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, department: true },
    });
    if (!student) throw AppError.notFound('Student not found');

    const applied = await prisma.application.findMany({
      where: { studentId: student.id },
      select: { jobId: true },
    });

    const jobs = await prisma.jobPosting.findMany({
      where: {
        status: 'OPEN',
        deadline: { gte: new Date() },
        id: { notIn: applied.map((a) => a.jobId) },
        minCgpa: { lte: student.cgpa },
        maxBacklogs: { gte: student.backlogs },
        ...(student.department ? {} : {}),
      },
      include: { company: true },
      take: 40,
    });

    if (!jobs.length) return ok(res, { recommendations: [], provider: 'none', message: 'No open roles right now' });

    const result = await aiClient.matchJobsForStudent(
      toStudentProfile(student),
      jobs.map(toJobProfile),
      10,
    );

    const enriched = result.data.matches.map((m) => {
      const job = jobs.find((j) => j.id === m.id)!;
      return {
        ...m,
        jobId: job.id,
        title: job.title,
        company: job.company.name,
        tier: job.company.tier,
        ctcMax: job.ctcMax,
        location: job.location,
        type: job.type,
        deadline: job.deadline,
        applyUrl: `/placements/${job.id}`,
      };
    });

    return ok(res, {
      recommendations: enriched,
      provider: result.data.provider,
      latencyMs: result.latencyMs,
    });
  }),
);

/** POST /api/v1/ai/interview-prep — generated question bank for a specific role */
aiRouter.post(
  '/interview-prep',
  validate(z.object({ jobId: z.string().optional(), count: z.coerce.number().int().min(3).max(20).default(8) })),
  asyncHandler(async (req, res) => {
    const { jobId, count } = req.body as { jobId?: string; count: number };
    const user = req.user!;
    const studentId = user.role === 'STUDENT' ? user.studentId : (req.body as { studentId?: string }).studentId;
    if (!studentId) throw AppError.badRequest('studentId is required');
    assertStudentScope(req, studentId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, department: true },
    });
    if (!student) throw AppError.notFound('Student not found');

    const job = jobId
      ? await prisma.jobPosting.findUnique({ where: { id: jobId }, include: { company: true } })
      : null;

    const jobProfile = job
      ? toJobProfile(job)
      : {
          jobId: 'generic',
          companyName: 'Campus Recruiter',
          title: 'Software Engineer',
          description: 'Standard campus software engineering interview.',
          skills: student.skills,
          minCgpa: 6,
          maxBacklogs: 0,
          allowedDepartments: [],
          batches: [],
          location: 'India',
          ctcMax: 0,
        };

    const result = await aiClient.interviewQuestions(toStudentProfile(student), jobProfile, count);

    await prisma.aIInteraction.create({
      data: {
        userId: user.sub,
        kind: 'INTERVIEW_QUESTIONS',
        prompt: `Interview prep for ${student.rollNo} @ ${jobProfile.companyName}`,
        response: JSON.stringify({ count: result.data.questions.length }),
        latencyMs: result.latencyMs,
      },
    });

    return ok(res, {
      role: jobProfile.title,
      company: jobProfile.companyName,
      questions: result.data.questions,
      latencyMs: result.latencyMs,
    });
  }),
);

/** POST /api/v1/ai/jobs/:id/shortlist — AI shortlist with a written summary */
aiRouter.post(
  '/jobs/:id/shortlist',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  validate(z.object({ topK: z.coerce.number().int().min(1).max(50).default(10) })),
  asyncHandler(async (req, res) => {
    const { topK } = req.body as { topK: number };
    const job = await prisma.jobPosting.findUnique({ where: { id: req.params.id }, include: { company: true } });
    if (!job) throw AppError.notFound('Job posting not found');

    const students = await prisma.student.findMany({
      where: {
        placementStatus: { in: ['ELIGIBLE', 'IN_PROCESS'] },
        ...(job.allowedDepartments.length ? { department: { code: { in: job.allowedDepartments } } } : {}),
        ...(job.batches.length ? { batch: { in: job.batches } } : {}),
      },
      include: { user: { select: { name: true } }, department: { select: { code: true } } },
    });

    const result = await aiClient.shortlist(toJobProfile(job), students.map(toStudentProfile), topK);

    await prisma.aIInteraction.create({
      data: {
        userId: req.user!.sub,
        kind: 'CANDIDATE_SHORTLIST',
        prompt: `AI shortlist ${job.title} @ ${job.company.name}`,
        response: result.data.summary,
        latencyMs: result.latencyMs,
      },
    });

    return ok(res, {
      jobId: job.id,
      company: job.company.name,
      title: job.title,
      summary: result.data.summary,
      shortlist: result.data.shortlist,
      poolSize: students.length,
      latencyMs: result.latencyMs,
    });
  }),
);

/** GET /api/v1/ai/insights — AI activity log for admins */
aiRouter.get(
  '/insights',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  asyncHandler(async (_req, res) => {
    const [byKind, recent, latency] = await Promise.all([
      prisma.aIInteraction.groupBy({ by: ['kind'], _count: { kind: true }, _avg: { latencyMs: true } }),
      prisma.aIInteraction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { user: { select: { name: true, role: true } } },
      }),
      prisma.aIInteraction.aggregate({ _avg: { latencyMs: true }, _count: { _all: true } }),
    ]);

    return ok(res, {
      totals: { interactions: latency._count._all, avgLatencyMs: Math.round(latency._avg.latencyMs ?? 0) },
      byKind: byKind.map((k) => ({
        kind: k.kind,
        count: k._count.kind,
        avgLatencyMs: Math.round(k._avg.latencyMs ?? 0),
      })),
      recent: recent.map((r) => ({
        id: r.id,
        kind: r.kind,
        prompt: r.prompt.slice(0, 140),
        user: r.user?.name ?? 'System',
        role: r.user?.role ?? null,
        provider: r.provider,
        latencyMs: r.latencyMs,
        createdAt: r.createdAt,
      })),
    });
  }),
);
