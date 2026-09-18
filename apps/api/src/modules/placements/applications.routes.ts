import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok, paginated, parsePagination } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { aiClient } from '../../services/aiClient.js';
import { checkDepartmentEligibility, checkEligibility, toJobProfile, toStudentProfile } from '../../services/eligibility.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

/** GET /api/v1/applications — students see their own, staff see everything */
applicationsRouter.get(
  '/',
  validate(
    z.object({
      status: z.string().optional(),
      jobId: z.string().optional(),
      studentId: z.string().optional(),
      minMatch: z.coerce.number().optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | number | undefined>;
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>, 25);

    const isStudent = req.user!.role === 'STUDENT';
    const where: Prisma.ApplicationWhereInput = {
      ...(isStudent ? { studentId: req.user!.studentId } : {}),
      ...(!isStudent && q.studentId ? { studentId: String(q.studentId) } : {}),
      ...(q.jobId ? { jobId: String(q.jobId) } : {}),
      ...(q.status ? { status: { in: String(q.status).split(',') as never[] } } : {}),
      ...(q.minMatch ? { matchScore: { gte: Number(q.minMatch) } } : {}),
    };

    const [total, applications] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take,
        include: {
          job: { include: { company: { select: { name: true, tier: true, industry: true } } } },
          student: {
            include: { user: { select: { name: true, email: true } }, department: { select: { code: true } } },
          },
          interviews: { orderBy: { scheduledAt: 'asc' } },
          offers: true,
        },
      }),
    ]);

    return paginated(res, {
      items: applications.map((a) => ({
        id: a.id,
        status: a.status,
        appliedAt: a.appliedAt,
        updatedAt: a.updatedAt,
        source: a.source,
        matchScore: a.matchScore,
        atsScore: a.atsScore,
        aiSummary: a.aiSummary,
        matchedSkills: a.matchedSkills,
        missingSkills: a.missingSkills,
        coverNote: a.coverNote,
        student: {
          id: a.student.id,
          name: a.student.user.name,
          email: a.student.user.email,
          rollNo: a.student.rollNo,
          department: a.student.department.code,
          cgpa: a.student.cgpa,
          skills: a.student.skills,
        },
        job: {
          id: a.job.id,
          title: a.job.title,
          company: a.job.company.name,
          tier: a.job.company.tier,
          type: a.job.type,
          ctcMax: a.job.ctcMax,
          location: a.job.location,
        },
        interviews: a.interviews,
        offer: a.offers[0] ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

/** GET /api/v1/applications/pipeline — kanban board grouped by status */
applicationsRouter.get(
  '/pipeline',
  asyncHandler(async (req, res) => {
    const isStudent = req.user!.role === 'STUDENT';
    const jobId = req.query.jobId as string | undefined;

    const applications = await prisma.application.findMany({
      where: {
        ...(isStudent ? { studentId: req.user!.studentId } : {}),
        ...(jobId ? { jobId } : {}),
      },
      orderBy: [{ matchScore: 'desc' }, { appliedAt: 'desc' }],
      include: {
        job: { include: { company: { select: { name: true, tier: true } } } },
        student: { include: { user: { select: { name: true } }, department: { select: { code: true } } } },
        interviews: true,
      },
    });

    const columns = [
      'APPLIED',
      'UNDER_REVIEW',
      'SHORTLISTED',
      'INTERVIEW_SCHEDULED',
      'INTERVIEWED',
      'OFFERED',
      'REJECTED',
    ] as const;

    return ok(res, {
      columns: columns.map((status) => ({
        status,
        count: applications.filter((a) => a.status === status).length,
        cards: applications
          .filter((a) => a.status === status)
          .map((a) => ({
            id: a.id,
            studentName: a.student.user.name,
            rollNo: a.student.rollNo,
            department: a.student.department.code,
            jobTitle: a.job.title,
            company: a.job.company.name,
            ctc: a.job.ctcMax,
            matchScore: a.matchScore,
            appliedAt: a.appliedAt,
            nextInterview: a.interviews.find((i) => i.result === 'PENDING')?.scheduledAt ?? null,
          })),
      })),
      total: applications.length,
    });
  }),
);

/** POST /api/v1/applications — student applies; AI scores the fit inline */
applicationsRouter.post(
  '/',
  validate(z.object({ jobId: z.string(), coverNote: z.string().max(1200).optional() })),
  asyncHandler(async (req, res) => {
    const { jobId, coverNote } = req.body as { jobId: string; coverNote?: string };
    const user = req.user!;

    const studentId =
      user.role === 'STUDENT'
        ? user.studentId
        : (req.body as { studentId?: string }).studentId;
    if (!studentId) throw AppError.badRequest('studentId is required for staff-initiated applications');

    const [job, student] = await Promise.all([
      prisma.jobPosting.findUnique({ where: { id: jobId }, include: { company: true } }),
      prisma.student.findUnique({
        where: { id: studentId },
        include: { user: true, department: true },
      }),
    ]);
    if (!job) throw AppError.notFound('Job posting not found');
    if (!student) throw AppError.notFound('Student not found');
    if (job.status !== 'OPEN') throw AppError.conflict('This posting is no longer accepting applications');
    if (job.deadline < new Date()) throw AppError.conflict('The application deadline has passed');

    const deptBlocker = checkDepartmentEligibility(job, student.department.code);
    const { eligible, blockers, warnings } = checkEligibility(job, student);
    if (!eligible || deptBlocker) {
      throw AppError.badRequest('You are not eligible for this role', [...blockers, ...(deptBlocker ? [deptBlocker] : [])]);
    }

    const existing = await prisma.application.findUnique({
      where: { jobId_studentId: { jobId, studentId } },
    });
    if (existing) throw AppError.conflict('You have already applied to this posting');

    const application = await prisma.application.create({
      data: {
        jobId,
        studentId,
        coverNote,
        resumeUrl: student.resumeUrl,
        status: 'APPLIED',
      },
    });

    // Enrich with AI scores; failure here must never block the application.
    let matchScore: number | null = null;
    let ats: Awaited<ReturnType<typeof aiClient.atsScore>>['data'] | null = null;
    try {
      const [match, atsResult] = await Promise.all([
        aiClient.matchJobsForStudent(toStudentProfile(student), [toJobProfile(job)], 1),
        student.resumeText
          ? aiClient.atsScore(student.resumeText, toJobProfile(job))
          : Promise.resolve(null),
      ]);
      const best = match.data.matches[0];
      matchScore = best?.score ?? null;
      ats = atsResult?.data ?? null;

      await prisma.application.update({
        where: { id: application.id },
        data: {
          matchScore,
          atsScore: ats?.score ?? null,
          aiSummary: best?.rationale,
          matchedSkills: best?.matchedSkills ?? [],
          missingSkills: best?.missingSkills ?? [],
        },
      });
    } catch {
      // AI service offline — the application still goes through.
    }

    const officers = await prisma.user.findMany({
      where: { role: { in: ['PLACEMENT_OFFICER', 'ADMIN'] } },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: officers.map((o) => ({
        userId: o.id,
        title: `New application: ${student.user.name} → ${job.company.name}`,
        body: `${job.title} · match score ${matchScore ?? 'pending'}`,
        type: 'PLACEMENT' as const,
        link: `/applications`,
      })),
    });

    return created(res, {
      id: application.id,
      status: application.status,
      matchScore,
      atsScore: ats?.score ?? null,
      warnings,
    });
  }),
);

/** PATCH /api/v1/applications/:id/status — move through the hiring pipeline */
applicationsRouter.patch(
  '/:id/status',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  validate(
    z.object({
      status: z.enum([
        'APPLIED',
        'UNDER_REVIEW',
        'SHORTLISTED',
        'INTERVIEW_SCHEDULED',
        'INTERVIEWED',
        'OFFERED',
        'REJECTED',
        'WITHDRAWN',
      ]),
      note: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body as { status: string; note?: string };

    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: { status: status as never },
      include: {
        job: { include: { company: true } },
        student: { include: { user: true } },
      },
    });

    const statusCopy: Record<string, string> = {
      UNDER_REVIEW: 'Your application is under review',
      SHORTLISTED: '🎉 You have been shortlisted',
      INTERVIEW_SCHEDULED: 'Interview scheduled',
      INTERVIEWED: 'Interview completed — awaiting result',
      OFFERED: '🏆 Offer rolled out',
      REJECTED: 'Application not shortlisted this time',
    };

    await prisma.notification.create({
      data: {
        userId: application.student.userId,
        title: `${statusCopy[status] ?? 'Status updated'} — ${application.job.company.name}`,
        body: note ?? `${application.job.title} · status is now ${status.replace(/_/g, ' ').toLowerCase()}`,
        type: 'PLACEMENT',
        link: '/applications',
      },
    });

    if (status === 'OFFERED') {
      await prisma.student.update({
        where: { id: application.studentId },
        data: { placementStatus: 'IN_PROCESS' },
      });
    }

    return ok(res, { id: application.id, status: application.status });
  }),
);

/** POST /api/v1/applications/:id/interviews — schedule a round */
applicationsRouter.post(
  '/:id/interviews',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  validate(
    z.object({
      round: z.coerce.number().int().min(1).default(1),
      name: z.string().default('Technical Round'),
      scheduledAt: z.string(),
      durationMins: z.coerce.number().int().min(15).max(240).default(45),
      mode: z.enum(['ONLINE', 'IN_PERSON', 'TELEPHONIC']).default('ONLINE'),
      meetingLink: z.string().optional(),
      interviewer: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { student: { include: { user: true } }, job: { include: { company: true } } },
    });
    if (!application) throw AppError.notFound('Application not found');

    const interview = await prisma.interview.create({
      data: {
        applicationId: application.id,
        round: Number(body.round),
        name: String(body.name),
        scheduledAt: new Date(String(body.scheduledAt)),
        durationMins: Number(body.durationMins),
        mode: body.mode as never,
        meetingLink: body.meetingLink as string | undefined,
        interviewer: body.interviewer as string | undefined,
      },
    });

    await prisma.application.update({
      where: { id: application.id },
      data: { status: 'INTERVIEW_SCHEDULED' },
    });

    await prisma.notification.create({
      data: {
        userId: application.student.userId,
        title: `Interview scheduled — ${application.job.company.name}`,
        body: `${interview.name} on ${interview.scheduledAt.toDateString()} (${interview.mode.toLowerCase()})`,
        type: 'PLACEMENT',
        link: '/applications',
      },
    });

    return created(res, interview);
  }),
);

/** PATCH /api/v1/applications/interviews/:id — record outcome */
applicationsRouter.patch(
  '/interviews/:id',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  validate(
    z.object({
      result: z.enum(['PENDING', 'CLEARED', 'FAILED', 'NO_SHOW']).optional(),
      feedback: z.string().optional(),
      score: z.coerce.number().int().min(0).max(100).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const interview = await prisma.interview.update({
      where: { id: req.params.id },
      data: req.body,
    });

    if (req.body && (req.body as { result?: string }).result === 'CLEARED') {
      await prisma.application.update({
        where: { id: interview.applicationId },
        data: { status: 'INTERVIEWED' },
      });
    }
    return ok(res, interview);
  }),
);

/** POST /api/v1/applications/:id/offer — roll out an offer */
applicationsRouter.post(
  '/:id/offer',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(
    z.object({
      ctc: z.coerce.number().min(0),
      stipendPerMonth: z.coerce.number().int().optional(),
      location: z.string().optional(),
      joiningDate: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { job: { include: { company: true } }, student: true },
    });
    if (!application) throw AppError.notFound('Application not found');

    const [offer] = await prisma.$transaction([
      prisma.offer.create({
        data: {
          applicationId: application.id,
          studentId: application.studentId,
          companyName: application.job.company.name,
          role: application.job.title,
          ctc: Number(body.ctc),
          stipendPerMonth: body.stipendPerMonth as number | undefined,
          location: (body.location as string) ?? application.job.location,
          joiningDate: body.joiningDate ? new Date(String(body.joiningDate)) : undefined,
        },
      }),
      prisma.application.update({ where: { id: application.id }, data: { status: 'OFFERED' } }),
      prisma.student.update({ where: { id: application.studentId }, data: { placementStatus: 'PLACED' } }),
    ]);

    await prisma.notification.create({
      data: {
        userId: application.student.userId,
        title: `🏆 Offer from ${application.job.company.name}`,
        body: `${application.job.title} · ₹${Number(body.ctc).toFixed(1)} LPA. Accept or decline from your dashboard.`,
        type: 'PLACEMENT',
        link: '/applications',
      },
    });

    return created(res, offer);
  }),
);

/** PATCH /api/v1/applications/offers/:id — student accepts/declines */
applicationsRouter.patch(
  '/offers/:id',
  validate(z.object({ accepted: z.boolean(), declinedReason: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { accepted, declinedReason } = req.body as { accepted: boolean; declinedReason?: string };

    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) throw AppError.notFound('Offer not found');
    if (req.user!.role === 'STUDENT' && req.user!.studentId !== offer.studentId) {
      throw AppError.forbidden();
    }

    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: { accepted, declinedReason },
    });

    await prisma.student.update({
      where: { id: offer.studentId },
      data: { placementStatus: accepted ? 'PLACED' : 'IN_PROCESS' },
    });

    return ok(res, updated);
  }),
);

/** DELETE /api/v1/applications/:id — withdraw before shortlisting */
applicationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const application = await prisma.application.findUnique({ where: { id: req.params.id } });
    if (!application) throw AppError.notFound('Application not found');
    if (req.user!.role === 'STUDENT' && req.user!.studentId !== application.studentId) {
      throw AppError.forbidden();
    }
    if (['OFFERED', 'INTERVIEWED'].includes(application.status)) {
      throw AppError.conflict('This application has progressed too far to withdraw — contact the placement cell');
    }

    await prisma.application.update({ where: { id: application.id }, data: { status: 'WITHDRAWN' } });
    return ok(res, { withdrawn: true });
  }),
);
