import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, ok } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

/**
 * GET /api/v1/analytics/overview — placement season dashboard.
 * Staff only: institute-wide CTC and placement-rate data should not be
 * accessible to an individual student account.
 */
analyticsRouter.get(
  '/overview',
  requireRole('ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'),
  asyncHandler(async (req, res) => {
    const batch = req.query.batch ? Number(req.query.batch) : undefined;

    const studentWhere = batch ? { batch } : {};

    const [
      totalStudents,
      placementsByStatus,
      offers,
      activeJobs,
      totalJobs,
      applications,
      companies,
      interviews,
      departments,
    ] = await Promise.all([
      prisma.student.count({ where: studentWhere }),
      prisma.student.groupBy({ by: ['placementStatus'], where: studentWhere, _count: { placementStatus: true } }),
      prisma.offer.findMany({
        where: batch ? { student: { batch } } : {},
        include: {
          student: { include: { department: { select: { code: true, name: true } } } },
        },
      }),
      prisma.jobPosting.count({ where: { status: 'OPEN', deadline: { gte: new Date() } } }),
      prisma.jobPosting.count(),
      prisma.application.findMany({
        where: batch ? { student: { batch } } : {},
        select: { status: true, appliedAt: true, matchScore: true, atsScore: true },
      }),
      prisma.company.count(),
      prisma.interview.count(),
      prisma.department.findMany({ include: { _count: { select: { students: true } } } }),
    ]);

    const placedCount = placementsByStatus.find((p) => p.placementStatus === 'PLACED')?._count.placementStatus ?? 0;
    const ctcs = offers.map((o) => o.ctc);
    const acceptedOffers = offers.filter((o) => o.accepted);

    // Placement rate per department (uses enrolled headcount as denominator).
    const deptStats = departments.map((d) => {
      const deptOffers = offers.filter((o) => o.student.department.code === d.code);
      const placed = new Set(deptOffers.map((o) => o.studentId)).size;
      const headcount = d._count.students;
      return {
        code: d.code,
        name: d.name,
        students: headcount,
        placed,
        placementRate: headcount ? Math.round((placed / headcount) * 1000) / 10 : 0,
        avgCtc: deptOffers.length
          ? Math.round((deptOffers.reduce((s, o) => s + o.ctc, 0) / deptOffers.length) * 10) / 10
          : 0,
        highestCtc: deptOffers.length ? Math.max(...deptOffers.map((o) => o.ctc)) : 0,
      };
    });

    // Company-wise hiring leaderboard.
    const recruiterMap = new Map<string, { offers: number; accepted: number; ctcs: number[]; role: string }>();
    for (const o of offers) {
      const entry = recruiterMap.get(o.companyName) ?? { offers: 0, accepted: 0, ctcs: [], role: o.role };
      entry.offers += 1;
      if (o.accepted) entry.accepted += 1;
      entry.ctcs.push(o.ctc);
      recruiterMap.set(o.companyName, entry);
    }
    const topRecruiters = Array.from(recruiterMap.entries())
      .map(([name, v]) => ({
        company: name,
        offers: v.offers,
        accepted: v.accepted,
        avgCtc: Math.round((v.ctcs.reduce((s, c) => s + c, 0) / v.ctcs.length) * 10) / 10,
        highestCtc: Math.max(...v.ctcs),
      }))
      .sort((a, b) => b.offers - a.offers)
      .slice(0, 8);

    // 8-month offer trend for the area chart.
    const now = new Date();
    const trend = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
      const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      const inMonth = offers.filter(
        (o) => o.offerDate.getFullYear() === d.getFullYear() && o.offerDate.getMonth() === d.getMonth(),
      );
      return {
        label,
        offers: inMonth.length,
        applications: applications.filter(
          (a) => a.appliedAt.getFullYear() === d.getFullYear() && a.appliedAt.getMonth() === d.getMonth(),
        ).length,
      };
    });

    const funnelOrder = [
      'APPLIED',
      'UNDER_REVIEW',
      'SHORTLISTED',
      'INTERVIEW_SCHEDULED',
      'INTERVIEWED',
      'OFFERED',
    ] as const;

    const scored = applications.filter((a) => a.matchScore !== null);

    return ok(res, {
      batch: batch ?? 'all',
      headline: {
        totalStudents,
        placed: placedCount,
        placementRate: totalStudents ? Math.round((placedCount / totalStudents) * 1000) / 10 : 0,
        avgCtc: ctcs.length ? Math.round((ctcs.reduce((s, c) => s + c, 0) / ctcs.length) * 10) / 10 : 0,
        medianCtc: ctcs.length
          ? Math.round([...ctcs].sort((a, b) => a - b)[Math.floor(ctcs.length / 2)] * 10) / 10
          : 0,
        highestCtc: ctcs.length ? Math.max(...ctcs) : 0,
        totalOffers: offers.length,
        acceptedOffers: acceptedOffers.length,
        activeJobs,
        totalJobs,
        companies,
        applications: applications.length,
        interviews,
        avgApplicationsPerStudent: totalStudents
          ? Math.round((applications.length / totalStudents) * 10) / 10
          : 0,
        avgMatchScore: scored.length
          ? Math.round((scored.reduce((s, a) => s + (a.matchScore ?? 0), 0) / scored.length) * 10) / 10
          : 0,
      },
      byStatus: placementsByStatus.map((p) => ({ status: p.placementStatus, count: p._count.placementStatus })),
      funnel: funnelOrder.map((status) => ({
        status,
        count: applications.filter((a) => a.status === status).length,
      })),
      byDepartment: deptStats.sort((a, b) => b.placementRate - a.placementRate),
      topRecruiters,
      trend,
      ctcBands: [
        { band: '< 5 LPA', count: ctcs.filter((c) => c < 5).length },
        { band: '5–10 LPA', count: ctcs.filter((c) => c >= 5 && c < 10).length },
        { band: '10–20 LPA', count: ctcs.filter((c) => c >= 10 && c < 20).length },
        { band: '20–30 LPA', count: ctcs.filter((c) => c >= 20 && c < 30).length },
        { band: '30+ LPA', count: ctcs.filter((c) => c >= 30).length },
      ],
    });
  }),
);

/** GET /api/v1/analytics/student/:id — personal placement readiness */
analyticsRouter.get(
  '/student/:id',
  asyncHandler(async (req, res) => {
    const studentId = req.params.id;
    const user = req.user!;
    if (user.role === 'STUDENT' && user.studentId !== studentId) {
      return ok(res, { error: 'forbidden' }, 200);
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        department: true,
        applications: { include: { job: { include: { company: true } }, interviews: true } },
        offers: true,
        enrollments: { include: { course: true } },
      },
    });
    if (!student) return ok(res, null);

    const attendance = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { status: true },
    });
    const marked = attendance.reduce((s, a) => s + a._count.status, 0);
    const present = attendance
      .filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
      .reduce((s, a) => s + a._count.status, 0);
    const attendancePct = marked ? Math.round((present / marked) * 1000) / 10 : 0;

    const scores = student.applications.filter((a) => a.matchScore !== null).map((a) => a.matchScore!);
    const avgMatch = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : 0;

    // Resume completeness drives part of the readiness score.
    const profileChecks = [
      { label: 'Resume uploaded', done: Boolean(student.resumeText || student.resumeUrl) },
      { label: '5+ skills listed', done: student.skills.length >= 5 },
      { label: 'CGPA above 7.0', done: student.cgpa >= 7 },
      { label: 'GitHub / LinkedIn linked', done: Boolean(student.githubUrl || student.linkedinUrl) },
      { label: 'Attendance above 75%', done: attendancePct >= 75 },
      { label: 'About section filled', done: Boolean(student.about) },
    ];
    const readiness = Math.round((profileChecks.filter((c) => c.done).length / profileChecks.length) * 100);

    return ok(res, {
      studentId,
      name: student.user.name,
      rollNo: student.rollNo,
      department: student.department.code,
      batch: student.batch,
      cgpa: student.cgpa,
      backlogs: student.backlogs,
      placementStatus: student.placementStatus,
      attendancePct,
      readiness,
      profileChecks,
      stats: {
        applications: student.applications.length,
        activeApplications: student.applications.filter(
          (a) => !['REJECTED', 'WITHDRAWN', 'OFFERED'].includes(a.status),
        ).length,
        interviews: student.applications.reduce((s, a) => s + a.interviews.length, 0),
        shortlisted: student.applications.filter((a) => a.status === 'SHORTLISTED').length,
        offers: student.offers.length,
        avgMatchScore: avgMatch,
        bestMatchScore: scores.length ? Math.max(...scores) : 0,
      },
      timeline: student.applications
        .flatMap((a) => [
          {
            type: 'application' as const,
            label: `Applied to ${a.job.company.name} — ${a.job.title}`,
            date: a.appliedAt,
            status: a.status,
          },
          ...a.interviews.map((i) => ({
            type: 'interview' as const,
            label: `${i.name} · ${a.job.company.name}`,
            date: i.scheduledAt,
            status: i.result,
          })),
        ])
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 12),
      offers: student.offers.map((o) => ({
        id: o.id,
        company: o.companyName,
        role: o.role,
        ctc: o.ctc,
        accepted: o.accepted,
        offerDate: o.offerDate,
      })),
    });
  }),
);
