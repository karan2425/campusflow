import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

/** GET /api/v1/departments — with headcounts, fuels filter dropdowns */
departmentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { students: true, courses: true, faculty: true } } },
    });

    const placements = await prisma.student.groupBy({
      by: ['departmentId', 'placementStatus'],
      _count: { placementStatus: true },
    });

    return ok(
      res,
      departments.map((d) => {
        const placed = placements.find((p) => p.departmentId === d.id && p.placementStatus === 'PLACED');
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          hodName: d.hodName,
          students: d._count.students,
          courses: d._count.courses,
          faculty: d._count.faculty,
          placed: placed?._count.placementStatus ?? 0,
        };
      }),
    );
  }),
);

/** POST /api/v1/departments */
departmentsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate(z.object({ code: z.string().min(2).max(8), name: z.string().min(3), hodName: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.create({ data: req.body });
    return created(res, dept);
  }),
);

/** GET /api/v1/departments/:code/faculty */
departmentsRouter.get(
  '/:code/faculty',
  asyncHandler(async (req, res) => {
    const department = await prisma.department.findUnique({
      where: { code: req.params.code },
      include: { faculty: { include: { user: { select: { name: true, email: true } }, courses: true } } },
    });
    if (!department) throw AppError.notFound('Department not found');

    return ok(
      res,
      department.faculty.map((f) => ({
        id: f.id,
        name: f.user.name,
        email: f.user.email,
        designation: f.designation,
        employeeCode: f.employeeCode,
        specialization: f.specialization,
        courses: f.courses.map((c) => ({ code: c.code, title: c.title })),
      })),
    );
  }),
);
