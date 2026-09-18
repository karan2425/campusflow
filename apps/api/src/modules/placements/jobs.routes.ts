import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok, paginated, parsePagination } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { aiClient } from '../../services/aiClient.js';
import {
  checkDepartmentEligibility,
  checkEligibility,
  loadCandidatePool,
  toJobProfile,
} from '../../services/eligibility.js';

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

/** GET /api/v1/jobs */
jobsRouter.get(
  '/',
  validate(
    z.object({
      status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']).optional(),
      type: z.enum(['FULL_TIME', 'INTERNSHIP', 'INTERNSHIP_PPO', 'PART_TIME']).optional(),
      company: z.string().optional(),
      minCtc: z.coerce.number().optional(),
      q: z.string().optional(),
      department: z.string().optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | number | undefined>;
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);

    const where: Prisma.JobPostingWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.type ? { type: q.type as never } : {}),
      ...(q.company ? { company: { name: { contains: String(q.company), mode: 'insensitive' } } } : {}),
      ...(q.minCtc ? { ctcMax: { gte: Number(q.minCtc) } } : {}),
      ...(q.department ? { allowedDepartments: { has: String(q.department) } } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: String(q.q), mode: 'insensitive' as const } },
              { description: { contains: String(q.q), mode: 'insensitive' as const } },
              { skills: { has: String(q.q) } },
              { company: { name: { contains: String(q.q), mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [total, jobs] = await Promise.all([
      prisma.jobPosting.count({ where }),
      prisma.jobPosting.findMany({
        where,
        orderBy: [{ status: 'asc' }, { deadline: 'asc' }],
        skip,
        take,
        include: { company: true, _count: { select: { applications: true } } },
      }),
    ]);

    const applicationCounts = await prisma.application.groupBy({
      by: ['jobId', 'status'],
      _count: { status: true },
      where: { jobId: { in: jobs.map((j) => j.id) } },
    });

    return paginated(res, {
      items: jobs.map((j) => {
        const counts = applicationCounts.filter((a) => a.jobId === j.id);
        const offered = counts.find((c) => c.status === 'OFFERED')?._count.status ?? 0;
        const shortlisted = counts.find((c) => c.status === 'SHORTLISTED')?._count.status ?? 0;
        return {
          id: j.id,
          title: j.title,
          company: j.company.name,
          companyId: j.company.id,
          industry: j.company.industry,
          tier: j.company.tier,
          type: j.type,
          status: j.status,
          location: j.location,
          workMode: j.workMode,
          ctcMin: j.ctcMin,
          ctcMax: j.ctcMax,
          stipendPerMonth: j.stipendPerMonth,
          minCgpa: j.minCgpa,
          maxBacklogs: j.maxBacklogs,
          allowedDepartments: j.allowedDepartments,
          batches: j.batches,
          skills: j.skills,
          openings: j.openings,
          bondMonths: j.bondMonths,
          deadline: j.deadline,
          postedAt: j.postedAt,
          applicants: j._count.applications,
          shortlisted,
          offered,
          daysToDeadline: Math.ceil((j.deadline.getTime() - Date.now()) / 86_400_000),
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

/** POST /api/v1/jobs */
jobsRouter.post(
  '/',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(
    z.object({
      companyId: z.string(),
      title: z.string().min(3),
      description: z.string().min(20),
      type: z.enum(['FULL_TIME', 'INTERNSHIP', 'INTERNSHIP_PPO', 'PART_TIME']).default('FULL_TIME'),
      location: z.string(),
      workMode: z.string().optional(),
      ctcMin: z.coerce.number().min(0),
      ctcMax: z.coerce.number().min(0),
      stipendPerMonth: z.coerce.number().int().optional(),
      minCgpa: z.coerce.number().min(0).max(10).default(6),
      maxBacklogs: z.coerce.number().int().min(0).default(0),
      allowedDepartments: z.array(z.string()).default([]),
      batches: z.array(z.coerce.number()).default([]),
      skills: z.array(z.string()).default([]),
      openings: z.coerce.number().int().min(1).default(1),
      bondMonths: z.coerce.number().int().optional(),
      deadline: z.string(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const job = await prisma.jobPosting.create({
      data: {
        ...body,
        deadline: new Date(String(body.deadline)),
        createdById: req.user!.sub,
      } as Prisma.JobPostingUncheckedCreateInput,
      include: { company: true },
    });

    // Notify eligible students immediately — this is the flow students love.
    const candidates = await prisma.student.findMany({
      where: {
        cgpa: { gte: job.minCgpa },
        backlogs: { lte: job.maxBacklogs },
        ...(job.allowedDepartments.length ? { department: { code: { in: job.allowedDepartments } } } : {}),
        ...(job.batches.length ? { batch: { in: job.batches } } : {}),
        placementStatus: { in: ['ELIGIBLE', 'IN_PROCESS'] },
      },
      select: { userId: true },
    });

    if (candidates.length) {
      await prisma.notification.createMany({
        data: candidates.map((c) => ({
          userId: c.userId,
          title: `New opening: ${job.title} at ${job.company.name}`,
          body: `CTC up to ${job.ctcMax} LPA · Apply before ${job.deadline.toDateString()}`,
          type: 'PLACEMENT' as const,
          link: `/placements/${job.id}`,
        })),
      });
    }

    return created(res, { ...job, notifiedStudents: candidates.length });
  }),
);

/** GET /api/v1/jobs/:id — job detail + funnel */
jobsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const job = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      include: { company: true },
    });
    if (!job) throw AppError.notFound('Job posting not found');

    const [funnel, applicantCount, topApplications] = await Promise.all([
      prisma.application.groupBy({ by: ['status'], where: { jobId: job.id }, _count: { status: true } }),
      // Excludes withdrawals so the number matches what staff see in the pipeline.
      prisma.application.count({ where: { jobId: job.id, status: { not: 'WITHDRAWN' } } }),
      prisma.application.findMany({
        where: { jobId: job.id },
        orderBy: [{ matchScore: 'desc' }],
        take: 10,
        include: {
          student: {
            include: { user: { select: { name: true } }, department: { select: { code: true } } },
          },
        },
      }),
    ]);

    const eligibleCount = await prisma.student.count({
      where: {
        cgpa: { gte: job.minCgpa },
        backlogs: { lte: job.maxBacklogs },
        ...(job.allowedDepartments.length ? { department: { code: { in: job.allowedDepartments } } } : {}),
        ...(job.batches.length ? { batch: { in: job.batches } } : {}),
      },
    });

    return ok(res, {
      ...job,
      company: job.company,
      applicants: applicantCount,
      eligibleCount,
      funnel: funnel.map((f) => ({ status: f.status, count: f._count.status })),
      topCandidates: topApplications.map((a) => ({
        applicationId: a.id,
        studentId: a.studentId,
        name: a.student.user.name,
        rollNo: a.student.rollNo,
        department: a.student.department.code,
        cgpa: a.student.cgpa,
        matchScore: a.matchScore,
        atsScore: a.atsScore,
        status: a.status,
        aiSummary: a.aiSummary,
        matchedSkills: a.matchedSkills,
        missingSkills: a.missingSkills,
      })),
    });
  }),
);

/** PATCH /api/v1/jobs/:id */
jobsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(
    z.object({
      status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']).optional(),
      deadline: z.string().optional(),
      openings: z.coerce.number().int().min(1).optional(),
      minCgpa: z.coerce.number().optional(),
      skills: z.array(z.string()).optional(),
      description: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const job = await prisma.jobPosting.update({
      where: { id: req.params.id },
      data: { ...body, ...(body.deadline ? { deadline: new Date(String(body.deadline)) } : {}) },
    });
    return ok(res, job);
  }),
);

/**
 * GET /api/v1/jobs/:id/matches — AI-ranked candidate shortlist.
 * Uses FAISS semantic similarity + structured eligibility scoring.
 */
jobsRouter.get(
  '/:id/matches',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  asyncHandler(async (req, res) => {
    const topK = Math.min(50, Number(req.query.topK ?? 15) || 15);

    const job = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      include: { company: true },
    });
    if (!job) throw AppError.notFound('Job posting not found');

    const pool = await loadCandidatePool(prisma, {
      ...(job.allowedDepartments.length ? { department: { code: { in: job.allowedDepartments } } } : {}),
      ...(job.batches.length ? { batch: { in: job.batches } } : {}),
      placementStatus: { in: ['ELIGIBLE', 'IN_PROCESS'] },
    });

    if (!pool.length) {
      return ok(res, { jobId: job.id, matches: [], provider: 'none', note: 'No students in the eligible pool yet' });
    }

    const result = await aiClient.matchStudentsForJob(toJobProfile(job), pool, topK);

    // Persist the scores so the pipeline UI shows stable, explainable numbers.
    await Promise.all(
      result.data.matches
        .filter((m) => m.eligible)
        .map(async (m) => {
          const existing = await prisma.application.findUnique({
            where: { jobId_studentId: { jobId: job.id, studentId: m.id } },
          });
          if (!existing) return;
          await prisma.application.update({
            where: { id: existing.id },
            data: {
              matchScore: m.score,
              aiSummary: m.rationale,
              matchedSkills: m.matchedSkills,
              missingSkills: m.missingSkills,
            },
          });
        }),
    );

    await prisma.aIInteraction.create({
      data: {
        userId: req.user!.sub,
        kind: 'CANDIDATE_SHORTLIST',
        prompt: `Shortlist for ${job.title} @ ${job.company.name} (pool=${pool.length}, topK=${topK})`,
        response: JSON.stringify(result.data.matches.slice(0, 5)),
        latencyMs: result.latencyMs,
      },
    });

    return ok(res, {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company.name,
      poolSize: pool.length,
      provider: result.data.provider,
      latencyMs: result.latencyMs,
      matches: result.data.matches,
    });
  }),
);

/** POST /api/v1/jobs/:id/applications/bulk — placement cell bulk-applies on behalf */
jobsRouter.post(
  '/:id/applications/bulk',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(z.object({ studentIds: z.array(z.string()).min(1), source: z.string().default('PLACEMENT_CELL') })),
  asyncHandler(async (req, res) => {
    const { studentIds, source } = req.body as { studentIds: string[]; source: string };
    const job = await prisma.jobPosting.findUnique({ where: { id: req.params.id }, include: { company: true } });
    if (!job) throw AppError.notFound('Job posting not found');

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { user: true, department: true },
    });

    const rejected: { studentId: string; reasons: string[] }[] = [];
    const accepted: string[] = [];

    for (const s of students) {
      const deptBlocker = checkDepartmentEligibility(job, s.department.code);
      const { eligible, blockers } = checkEligibility(job, s);
      if (!eligible || deptBlocker) {
        rejected.push({ studentId: s.id, reasons: [...blockers, ...(deptBlocker ? [deptBlocker] : [])] });
      } else {
        accepted.push(s.id);
      }
    }

    const result = await prisma.application.createMany({
      data: accepted.map((studentId) => ({ jobId: job.id, studentId, source, status: 'APPLIED' as const })),
      skipDuplicates: true,
    });

    const studentUsers = await prisma.student.findMany({
      where: { id: { in: accepted } },
      select: { userId: true },
    });
    await prisma.notification.createMany({
      data: studentUsers.map((s) => ({
        userId: s.userId,
        title: `Applied to ${job.title} at ${job.company.name}`,
        body: 'Your placement cell submitted this application on your behalf.',
        type: 'PLACEMENT' as const,
        link: '/applications',
      })),
    });

    return created(res, { applied: result.count, rejected });
  }),
);
