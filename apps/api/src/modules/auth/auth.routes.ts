import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { TOKEN_COOKIE, tokenForUser } from '../../lib/jwt.js';
import { env } from '../../env.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters'),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT']).default('STUDENT'),
  // Student onboarding fields
  rollNo: z.string().optional(),
  departmentCode: z.string().optional(),
  batch: z.coerce.number().int().min(2000).max(2100).optional(),
  phone: z.string().optional(),
});

/** POST /api/v1/auth/login */
authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { student: true, faculty: true },
    });

    if (!user || !user.isActive) throw AppError.unauthorized('Invalid email or password');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw AppError.unauthorized('Invalid email or password');

    const token = tokenForUser(user);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    res.cookie?.(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return ok(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        studentId: user.student?.id ?? null,
        departmentId: user.student?.departmentId ?? user.faculty?.departmentId ?? null,
      },
    });
  }),
);

/** POST /api/v1/auth/register — student self-registration or admin-created staff */
authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof registerSchema>;
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw AppError.conflict('An account with this email already exists');

    const staffRoles = ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'];
    if (staffRoles.includes(body.role)) {
      throw AppError.forbidden('Staff accounts must be created by an administrator');
    }
    if (!body.rollNo || !body.departmentCode || !body.batch) {
      throw AppError.badRequest('Students must supply rollNo, departmentCode and batch');
    }

    const department = await prisma.department.findUnique({ where: { code: body.departmentCode } });
    if (!department) throw AppError.badRequest(`Unknown department code "${body.departmentCode}"`);

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: body.name,
        role: 'STUDENT',
        phone: body.phone,
        student: {
          create: {
            rollNo: body.rollNo,
            departmentId: department.id,
            batch: body.batch,
          },
        },
      },
      include: { student: true },
    });

    return created(res, {
      token: tokenForUser(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, studentId: user.student?.id },
    });
  }),
);

/** GET /api/v1/auth/me — full session profile, drives the web app shell */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: {
        student: { include: { department: true } },
        faculty: { include: { department: true } },
      },
    });
    if (!user) throw AppError.unauthorized('Session no longer valid');

    const unread = await prisma.notification.count({ where: { userId: user.id, read: false } });

    return ok(res, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
      unreadNotifications: unread,
      student: user.student
        ? {
            id: user.student.id,
            rollNo: user.student.rollNo,
            batch: user.student.batch,
            cgpa: user.student.cgpa,
            backlogs: user.student.backlogs,
            skills: user.student.skills,
            placementStatus: user.student.placementStatus,
            department: user.student.department.name,
            departmentCode: user.student.department.code,
          }
        : null,
      faculty: user.faculty
        ? {
            id: user.faculty.id,
            designation: user.faculty.designation,
            department: user.faculty.department.name,
          }
        : null,
    });
  }),
);

/** POST /api/v1/auth/change-password */
authRouter.post(
  '/change-password',
  requireAuth,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw AppError.unauthorized();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw AppError.badRequest('Current password is incorrect');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return ok(res, { updated: true });
  }),
);

/** POST /api/v1/auth/logout */
authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    res.clearCookie?.(TOKEN_COOKIE);
    return ok(res, { loggedOut: true });
  }),
);
