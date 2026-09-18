import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, asyncHandler, created, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

/** GET /api/v1/companies — with hiring stats */
companiesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
      orderBy: { name: 'asc' },
      include: {
        jobs: {
          select: { id: true, title: true, status: true, ctcMax: true, deadline: true, openings: true },
        },
        _count: { select: { jobs: true } },
      },
    });

    const offers = await prisma.offer.groupBy({
      by: ['companyName'],
      _count: { companyName: true },
      _avg: { ctc: true },
    });

    return ok(
      res,
      companies.map((c) => {
        const stats = offers.find((o) => o.companyName === c.name);
        return {
          id: c.id,
          name: c.name,
          website: c.website,
          industry: c.industry,
          tier: c.tier,
          hqCity: c.hqCity,
          hrName: c.hrName,
          hrEmail: c.hrEmail,
          description: c.description,
          openJobs: c.jobs.filter((j) => j.status === 'OPEN').length,
          totalJobs: c._count.jobs,
          offersMade: stats?._count.companyName ?? 0,
          avgCtc: stats?._avg.ctc ? Math.round(stats._avg.ctc * 10) / 10 : null,
          jobs: c.jobs.slice(0, 5),
        };
      }),
    );
  }),
);

/** POST /api/v1/companies */
companiesRouter.post(
  '/',
  requireRole('ADMIN', 'PLACEMENT_OFFICER'),
  validate(
    z.object({
      name: z.string().min(2),
      website: z.string().url().optional(),
      industry: z.string().optional(),
      tier: z.string().optional(),
      hqCity: z.string().optional(),
      hrName: z.string().optional(),
      hrEmail: z.string().email().optional(),
      description: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.create({ data: req.body });
    return created(res, company);
  }),
);

/** GET /api/v1/companies/:id */
companiesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        jobs: {
          include: { _count: { select: { applications: true } } },
          orderBy: { postedAt: 'desc' },
        },
      },
    });
    if (!company) throw AppError.notFound('Company not found');

    const offers = await prisma.offer.findMany({ where: { companyName: company.name } });

    return ok(res, {
      ...company,
      offersMade: offers.length,
      acceptedOffers: offers.filter((o) => o.accepted).length,
      highestCtc: offers.length ? Math.max(...offers.map((o) => o.ctc)) : null,
      jobs: company.jobs.map((j) => ({
        ...j,
        applicantCount: j._count.applications,
      })),
    });
  }),
);
