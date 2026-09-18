import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/** GET /api/v1/notifications */
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.sub, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Number(req.query.limit ?? 30) || 30),
    });
    const unread = await prisma.notification.count({ where: { userId: req.user!.sub, read: false } });

    return ok(res, { notifications, unread });
  }),
);

/** PATCH /api/v1/notifications/read */
notificationsRouter.patch(
  '/read',
  validate(z.object({ ids: z.array(z.string()).optional(), all: z.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    const { ids, all } = req.body as { ids?: string[]; all: boolean };

    const result = await prisma.notification.updateMany({
      where: {
        userId: req.user!.sub,
        ...(all ? {} : { id: { in: ids ?? [] } }),
      },
      data: { read: true },
    });

    return ok(res, { updated: result.count });
  }),
);
