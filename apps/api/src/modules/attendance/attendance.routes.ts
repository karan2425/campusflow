import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

const sessionSchema = z.object({
  courseId: z.string(),
  date: z.string().datetime().or(z.string()),
  topic: z.string().optional(),
  records: z
    .array(
      z.object({
        studentId: z.string(),
        status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

/** POST /api/v1/attendance/sessions — mark a class in one call */
attendanceRouter.post(
  '/sessions',
  requireRole('ADMIN', 'FACULTY', 'PLACEMENT_OFFICER'),
  validate(sessionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof sessionSchema>;
    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course) throw AppError.notFound('Course not found');

    const session = await prisma.attendanceSession.create({
      data: {
        courseId: body.courseId,
        date: new Date(body.date),
        topic: body.topic,
        takenById: req.user!.sub,
        records: {
          create: body.records.map((r) => ({ studentId: r.studentId, status: r.status, note: r.note })),
        },
      },
      include: { _count: { select: { records: true } } },
    });

    const present = body.records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;

    // Low-attendance (>35% absences in this course) triggers a student alert.
    const absentees = body.records.filter((r) => r.status === 'ABSENT').map((r) => r.studentId);
    if (absentees.length) {
      const alerts = await prisma.attendanceRecord.groupBy({
        by: ['studentId'],
        where: { studentId: { in: absentees }, session: { courseId: course.id } },
        _count: { status: true },
      });
      const totalInCourse = await prisma.attendanceSession.count({ where: { courseId: course.id } });
      const atRisk = alerts.filter((a) => totalInCourse > 3 && a._count.status / totalInCourse >= 0.35);

      if (atRisk.length) {
        const students = await prisma.student.findMany({
          where: { id: { in: atRisk.map((a) => a.studentId) } },
          select: { id: true, userId: true, rollNo: true },
        });
        await prisma.notification.createMany({
          data: students.map((s) => ({
            userId: s.userId,
            title: `Low attendance in ${course.code}`,
            body: `Your attendance in ${course.title} is below the 65% threshold. Please meet your faculty advisor.`,
            type: 'ACADEMIC' as const,
            link: '/attendance',
          })),
        });
      }
    }

    return created(res, {
      sessionId: session.id,
      marked: session._count.records,
      present,
      attendancePct: Math.round((present / body.records.length) * 1000) / 10,
    });
  }),
);

/** GET /api/v1/attendance/sessions?courseId= */
attendanceRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const { courseId, limit } = req.query as { courseId?: string; limit?: string };
    const sessions = await prisma.attendanceSession.findMany({
      where: courseId ? { courseId } : {},
      orderBy: { date: 'desc' },
      take: Math.min(100, Number(limit ?? 20) || 20),
      include: {
        course: { select: { code: true, title: true } },
        records: { select: { studentId: true, status: true } },
      },
    });

    return ok(
      res,
      sessions.map((s) => {
        const present = s.records.filter((r) => r.status === 'PRESENT').length;
        const late = s.records.filter((r) => r.status === 'LATE').length;
        return {
          id: s.id,
          date: s.date,
          topic: s.topic,
          courseCode: s.course.code,
          courseTitle: s.course.title,
          total: s.records.length,
          present,
          late,
          absent: s.records.length - present - late - s.records.filter((r) => r.status === 'EXCUSED').length,
        };
      }),
    );
  }),
);

/** GET /api/v1/attendance/overview — defaulters + per-course health */
attendanceRouter.get(
  '/overview',
  requireRole('ADMIN', 'FACULTY', 'PLACEMENT_OFFICER'),
  asyncHandler(async (_req, res) => {
    const courses = await prisma.course.findMany({
      select: { id: true, code: true, title: true, semester: true, department: { select: { code: true } } },
    });

    const totals = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const perCourse = await Promise.all(
      courses.map(async (c) => {
        const [sessions, records] = await Promise.all([
          prisma.attendanceSession.count({ where: { courseId: c.id } }),
          prisma.attendanceRecord.groupBy({
            by: ['status'],
            where: { session: { courseId: c.id } },
            _count: { status: true },
          }),
        ]);
        const present = records
          .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
          .reduce((s, r) => s + r._count.status, 0);
        const marked = records.reduce((s, r) => s + r._count.status, 0);
        const enrolled = await prisma.enrollment.count({ where: { courseId: c.id } });
        return {
          courseId: c.id,
          code: c.code,
          title: c.title,
          semester: c.semester,
          department: c.department.code,
          sessions,
          enrolled,
          attendancePct: marked ? Math.round((present / marked) * 1000) / 10 : null,
        };
      }),
    );

    // Students whose overall attendance is below 65% are flagged as defaulters.
    const perStudent = await prisma.attendanceRecord.groupBy({
      by: ['studentId'],
      _count: { status: true },
    });
    const presentPerStudent = await prisma.attendanceRecord.groupBy({
      by: ['studentId'],
      where: { status: { in: ['PRESENT', 'LATE'] } },
      _count: { status: true },
    });

    const defaulterIds = perStudent
      .map((s) => {
        const present = presentPerStudent.find((p) => p.studentId === s.studentId)?._count.status ?? 0;
        return { studentId: s.studentId, pct: (present / s._count.status) * 100, marked: s._count.status };
      })
      .filter((s) => s.marked >= 5 && s.pct < 65)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 15);

    const defaulters = await prisma.student.findMany({
      where: { id: { in: defaulterIds.map((d) => d.studentId) } },
      include: { user: { select: { name: true, email: true } }, department: { select: { code: true } } },
    });

    const totalMarked = totals.reduce((s, t) => s + t._count.status, 0);
    const totalPresent = totals
      .filter((t) => t.status === 'PRESENT' || t.status === 'LATE')
      .reduce((s, t) => s + t._count.status, 0);

    return ok(res, {
      overallPct: totalMarked ? Math.round((totalPresent / totalMarked) * 1000) / 10 : 0,
      totalMarked,
      breakdown: totals.map((t) => ({ status: t.status, count: t._count.status })),
      courses: perCourse.filter((c) => c.sessions > 0),
      defaulters: defaulterIds.map((d) => {
        const s = defaulters.find((x) => x.id === d.studentId)!;
        return {
          studentId: d.studentId,
          name: s.user.name,
          rollNo: s.rollNo,
          department: s.department.code,
          attendancePct: Math.round(d.pct * 10) / 10,
        };
      }),
    });
  }),
);

/** GET /api/v1/attendance/student/:id — per-course breakdown for one student */
attendanceRouter.get(
  '/student/:id',
  asyncHandler(async (req, res) => {
    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: req.params.id },
      include: { session: { include: { course: { select: { id: true, code: true, title: true } } } } },
    });

    const byCourse = new Map<string, { code: string; title: string; present: number; total: number }>();
    for (const r of records) {
      const key = r.session.course.id;
      const entry = byCourse.get(key) ?? {
        code: r.session.course.code,
        title: r.session.course.title,
        present: 0,
        total: 0,
      };
      entry.total += 1;
      if (r.status === 'PRESENT' || r.status === 'LATE') entry.present += 1;
      byCourse.set(key, entry);
    }

    return ok(
      res,
      Array.from(byCourse.entries()).map(([courseId, v]) => ({
        courseId,
        ...v,
        pct: v.total ? Math.round((v.present / v.total) * 1000) / 10 : 0,
      })),
    );
  }),
);
