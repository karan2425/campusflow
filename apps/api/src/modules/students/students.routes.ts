import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok, paginated, parsePagination } from '../../lib/http.js';
import { assertStudentScope, requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const studentsRouter = Router();
studentsRouter.use(requireAuth);

const listQuerySchema = z.object({
  q: z.string().optional(),
  department: z.string().optional(),
  batch: z.coerce.number().int().optional(),
  placementStatus: z.string().optional(),
  minCgpa: z.coerce.number().optional(),
  maxBacklogs: z.coerce.number().int().optional(),
  skill: z.string().optional(),
  sort: z.enum(['cgpa', 'name', 'recent', 'coding']).default('name'),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  rollNo: z.string().min(2),
  departmentCode: z.string(),
  batch: z.coerce.number().int(),
  currentSemester: z.coerce.number().int().min(1).max(12).optional(),
  cgpa: z.coerce.number().min(0).max(10).optional(),
  backlogs: z.coerce.number().int().min(0).optional(),
  skills: z.array(z.string()).optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  cgpa: z.coerce.number().min(0).max(10).optional(),
  backlogs: z.coerce.number().int().min(0).optional(),
  skills: z.array(z.string()).optional(),
  about: z.string().max(2000).optional(),
  resumeText: z.string().optional(),
  resumeUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  linkedinUrl: z.string().optional(),
  city: z.string().optional(),
  codingScore: z.coerce.number().int().min(0).max(1000).optional(),
  githubScore: z.coerce.number().int().min(0).max(1000).optional(),
  currentSemester: z.coerce.number().int().min(1).max(12).optional(),
  placementStatus: z
    .enum(['NOT_ELIGIBLE', 'ELIGIBLE', 'IN_PROCESS', 'PLACED', 'OPTED_OUT'])
    .optional(),
  verified: z.boolean().optional(),
});

/** GET /api/v1/students — searchable, filterable directory used by every dashboard */
studentsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);

    const where: Prisma.StudentWhereInput = {
      ...(q.department ? { department: { code: q.department } } : {}),
      ...(q.batch ? { batch: q.batch } : {}),
      ...(q.placementStatus ? { placementStatus: q.placementStatus as never } : {}),
      ...(q.minCgpa ? { cgpa: { gte: q.minCgpa } } : {}),
      ...(q.maxBacklogs !== undefined ? { backlogs: { lte: q.maxBacklogs } } : {}),
      ...(q.skill ? { skills: { has: q.skill } } : {}),
      ...(q.q
        ? {
            OR: [
              { rollNo: { contains: q.q, mode: 'insensitive' } },
              { user: { name: { contains: q.q, mode: 'insensitive' } } },
              { user: { email: { contains: q.q, mode: 'insensitive' } } },
              { skills: { has: q.q } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.StudentOrderByWithRelationInput =
      q.sort === 'cgpa'
        ? { cgpa: 'desc' }
        : q.sort === 'recent'
          ? { createdAt: 'desc' }
          : q.sort === 'coding'
            ? { codingScore: 'desc' }
            : { user: { name: 'asc' } };

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
          department: { select: { code: true, name: true } },
          _count: { select: { applications: true } },
        },
      }),
    ]);

    return paginated(res, {
      items: students.map((s) => ({
        id: s.id,
        name: s.user.name,
        email: s.user.email,
        phone: s.user.phone,
        avatarUrl: s.user.avatarUrl,
        rollNo: s.rollNo,
        department: s.department.code,
        departmentName: s.department.name,
        batch: s.batch,
        currentSemester: s.currentSemester,
        cgpa: s.cgpa,
        backlogs: s.backlogs,
        skills: s.skills,
        placementStatus: s.placementStatus,
        verified: s.verified,
        codingScore: s.codingScore,
        githubScore: s.githubScore,
        applications: s._count.applications,
        city: s.city,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

/** GET /api/v1/students/:id — full 360° profile */
studentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    assertStudentScope(req, req.params.id);

    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, email: true, phone: true, avatarUrl: true, lastLoginAt: true } },
        department: true,
        enrollments: { include: { course: { include: { faculty: { include: { user: true } } } } } },
        applications: {
          include: {
            job: { include: { company: true } },
            interviews: { orderBy: { scheduledAt: 'asc' } },
            offers: true,
          },
          orderBy: { appliedAt: 'desc' },
        },
        offers: true,
        _count: { select: { attendance: true } },
      },
    });
    if (!student) throw AppError.notFound('Student not found');

    const attendance = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { studentId: student.id },
      _count: { status: true },
    });

    const present = attendance.find((a) => a.status === 'PRESENT')?._count.status ?? 0;
    const late = attendance.find((a) => a.status === 'LATE')?._count.status ?? 0;
    const totalSessions = attendance.reduce((sum, a) => sum + a._count.status, 0);

    return ok(res, {
      id: student.id,
      name: student.user.name,
      email: student.user.email,
      phone: student.user.phone,
      avatarUrl: student.user.avatarUrl,
      rollNo: student.rollNo,
      department: student.department.name,
      departmentCode: student.department.code,
      batch: student.batch,
      currentSemester: student.currentSemester,
      cgpa: student.cgpa,
      backlogs: student.backlogs,
      skills: student.skills,
      about: student.about,
      city: student.city,
      resumeUrl: student.resumeUrl,
      hasResumeText: Boolean(student.resumeText),
      githubUrl: student.githubUrl,
      linkedinUrl: student.linkedinUrl,
      codingScore: student.codingScore,
      githubScore: student.githubScore,
      placementStatus: student.placementStatus,
      verified: student.verified,
      attendance: {
        totalSessions,
        present,
        late,
        percentage: totalSessions ? Math.round(((present + late) / totalSessions) * 1000) / 10 : 0,
        breakdown: attendance.map((a) => ({ status: a.status, count: a._count.status })),
      },
      courses: student.enrollments.map((e) => ({
        id: e.course.id,
        code: e.course.code,
        title: e.course.title,
        credits: e.course.credits,
        semester: e.course.semester,
        status: e.status,
        grade: e.grade,
        marks: e.marks,
        faculty: e.course.faculty?.user.name ?? null,
      })),
      applications: student.applications.map((a) => ({
        id: a.id,
        status: a.status,
        appliedAt: a.appliedAt,
        matchScore: a.matchScore,
        atsScore: a.atsScore,
        job: {
          id: a.job.id,
          title: a.job.title,
          company: a.job.company.name,
          ctcMax: a.job.ctcMax,
          type: a.job.type,
        },
        interviews: a.interviews.map((i) => ({
          id: i.id,
          round: i.round,
          name: i.name,
          scheduledAt: i.scheduledAt,
          result: i.result,
          mode: i.mode,
        })),
        offer: a.offers[0]
          ? { ctc: a.offers[0].ctc, accepted: a.offers[0].accepted, location: a.offers[0].location }
          : null,
      })),
    });
  }),
);

/** POST /api/v1/students — placement cell onboarding */
studentsRouter.post(
  '/',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const bcrypt = await import('bcryptjs');
    const department = await prisma.department.findUnique({ where: { code: body.departmentCode } });
    if (!department) throw AppError.badRequest(`Unknown department code "${body.departmentCode}"`);

    const email = body.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw AppError.conflict('A user with this email already exists');
    }

    const student = await prisma.student.create({
      data: {
        rollNo: body.rollNo,
        department: { connect: { id: department.id } },
        batch: body.batch,
        currentSemester: body.currentSemester ?? 1,
        cgpa: body.cgpa ?? 0,
        backlogs: body.backlogs ?? 0,
        skills: body.skills ?? [],
        city: body.city,
        user: {
          create: {
            email,
            name: body.name,
            role: 'STUDENT' as const,
            phone: body.phone,
            passwordHash: await bcrypt.hash(body.password ?? 'Password@123', 10),
          },
        },
      },
      include: { user: true, department: true },
    });

    return created(res, { id: student.id, rollNo: student.rollNo, email: student.user.email });
  }),
);

/** PATCH /api/v1/students/:id — students self-serve; staff can edit anyone */
studentsRouter.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    assertStudentScope(req, req.params.id);
    const body = req.body as z.infer<typeof updateSchema>;
    const isStaff = req.user!.role !== 'STUDENT';

    const existing = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Student not found');

    const { name, phone, placementStatus, verified, ...profileFields } = body;

    // Only staff may flip placement status / verification flags.
    const staffOnly = isStaff ? { placementStatus, verified } : {};

    // Name and phone live on User, everything else on Student.
    const userUpdate: Prisma.UserUpdateInput = {};
    if (name !== undefined) userUpdate.name = name;
    if (phone !== undefined) userUpdate.phone = phone;

    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: {
        ...(profileFields as Prisma.StudentUpdateInput),
        ...staffOnly,
        ...(Object.keys(userUpdate).length ? { user: { update: userUpdate } } : {}),
      },
      include: { user: true },
    });

    return ok(res, { id: updated.id, updatedAt: updated.updatedAt });
  }),
);
