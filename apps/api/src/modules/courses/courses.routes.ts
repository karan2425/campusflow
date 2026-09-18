import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok, paginated, parsePagination } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

/** GET /api/v1/courses */
coursesRouter.get(
  '/',
  validate(
    z.object({
      department: z.string().optional(),
      semester: z.coerce.number().optional(),
      q: z.string().optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { department, semester, q } = req.query as { department?: string; semester?: number; q?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>, 50);

    const where = {
      ...(department ? { department: { code: department } } : {}),
      ...(semester ? { semester } : {}),
      ...(q
        ? { OR: [{ code: { contains: q, mode: 'insensitive' as const } }, { title: { contains: q, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [total, courses] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: [{ semester: 'asc' }, { code: 'asc' }],
        skip,
        take,
        include: {
          department: { select: { code: true, name: true } },
          faculty: { include: { user: { select: { name: true } } } },
          _count: { select: { enrollments: true, sessions: true } },
        },
      }),
    ]);

    return paginated(res, {
      items: courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        credits: c.credits,
        semester: c.semester,
        department: c.department.code,
        departmentName: c.department.name,
        faculty: c.faculty?.user.name ?? 'Unassigned',
        enrolled: c._count.enrollments,
        sessions: c._count.sessions,
        description: c.description,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  }),
);

/** POST /api/v1/courses */
coursesRouter.post(
  '/',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(
    z.object({
      code: z.string().min(3),
      title: z.string().min(3),
      credits: z.coerce.number().int().min(1).max(6).default(3),
      semester: z.coerce.number().int().min(1).max(12),
      departmentCode: z.string(),
      facultyId: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      code: string;
      title: string;
      credits: number;
      semester: number;
      departmentCode: string;
      facultyId?: string;
      description?: string;
    };
    const department = await prisma.department.findUnique({ where: { code: body.departmentCode } });
    if (!department) throw AppError.badRequest(`Unknown department "${body.departmentCode}"`);

    const course = await prisma.course.create({
      data: {
        code: body.code.toUpperCase(),
        title: body.title,
        credits: body.credits,
        semester: body.semester,
        departmentId: department.id,
        facultyId: body.facultyId,
        description: body.description,
      },
    });
    return created(res, course);
  }),
);

/** GET /api/v1/courses/:id — roster + attendance health */
coursesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        department: true,
        faculty: { include: { user: { select: { name: true, email: true } } } },
        sessions: { orderBy: { date: 'desc' }, take: 10, include: { _count: { select: { records: true } } } },
        enrollments: {
          include: {
            student: { include: { user: { select: { name: true, email: true } }, department: true } },
          },
          orderBy: { student: { rollNo: 'asc' } },
        },
      },
    });
    if (!course) throw AppError.notFound('Course not found');

    const attendanceByStudent = await prisma.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      where: { session: { courseId: course.id } },
      _count: { status: true },
    });

    return ok(res, {
      id: course.id,
      code: course.code,
      title: course.title,
      credits: course.credits,
      semester: course.semester,
      description: course.description,
      department: course.department.name,
      departmentCode: course.department.code,
      faculty: course.faculty?.user.name ?? 'Unassigned',
      facultyEmail: course.faculty?.user.email ?? null,
      recentSessions: course.sessions.map((s) => ({
        id: s.id,
        date: s.date,
        topic: s.topic,
        records: s._count.records,
      })),
      roster: course.enrollments.map((e) => {
        const recs = attendanceByStudent.filter((a) => a.studentId === e.studentId);
        const present = recs.reduce(
          (sum, r) => (r.status === 'PRESENT' || r.status === 'LATE' ? sum + r._count.status : sum),
          0,
        );
        const marked = recs.reduce((sum, r) => sum + r._count.status, 0);
        return {
          enrollmentId: e.id,
          studentId: e.student.id,
          name: e.student.user.name,
          email: e.student.user.email,
          rollNo: e.student.rollNo,
          cgpa: e.student.cgpa,
          grade: e.grade,
          marks: e.marks,
          status: e.status,
          attendancePct: marked ? Math.round((present / marked) * 1000) / 10 : null,
        };
      }),
    });
  }),
);

/** POST /api/v1/courses/:id/enroll */
coursesRouter.post(
  '/:id/enroll',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  validate(z.object({ studentIds: z.array(z.string()).min(1) })),
  asyncHandler(async (req, res) => {
    const { studentIds } = req.body as { studentIds: string[] };
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw AppError.notFound('Course not found');

    const result = await prisma.enrollment.createMany({
      data: studentIds.map((studentId) => ({ studentId, courseId: course.id })),
      skipDuplicates: true,
    });

    return created(res, { enrolled: result.count, course: course.code });
  }),
);

/** PATCH /api/v1/courses/:id/grades — bulk grade entry */
coursesRouter.patch(
  '/:id/grades',
  requireRole('ADMIN', 'FACULTY', 'PLACEMENT_OFFICER'),
  validate(
    z.object({
      entries: z
        .array(
          z.object({
            studentId: z.string(),
            grade: z.string().max(3).optional(),
            marks: z.coerce.number().int().min(0).max(100).optional(),
          }),
        )
        .min(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { entries } = req.body as { entries: { studentId: string; grade?: string; marks?: number }[] };

    await prisma.$transaction(
      entries.map((e) =>
        prisma.enrollment.update({
          where: { studentId_courseId: { studentId: e.studentId, courseId: req.params.id } },
          data: { grade: e.grade, marks: e.marks },
        }),
      ),
    );

    return ok(res, { updated: entries.length });
  }),
);
