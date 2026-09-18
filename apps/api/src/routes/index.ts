import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { studentsRouter } from '../modules/students/students.routes.js';
import { departmentsRouter } from '../modules/departments/departments.routes.js';
import { coursesRouter } from '../modules/courses/courses.routes.js';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { companiesRouter } from '../modules/placements/companies.routes.js';
import { jobsRouter } from '../modules/placements/jobs.routes.js';
import { applicationsRouter } from '../modules/placements/applications.routes.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';

export const apiRouter = Router();

const routes: [string, Router][] = [
  ['auth', authRouter],
  ['students', studentsRouter],
  ['departments', departmentsRouter],
  ['courses', coursesRouter],
  ['attendance', attendanceRouter],
  ['companies', companiesRouter],
  ['jobs', jobsRouter],
  ['applications', applicationsRouter],
  ['analytics', analyticsRouter],
  ['ai', aiRouter],
  ['notifications', notificationsRouter],
];

for (const [path, router] of routes) {
  apiRouter.use(`/${path}`, router);
}

/** Machine-readable route index — handy for the docs page and smoke tests. */
apiRouter.get('/', (_req, res) => {
  res.json({
    service: 'CampusFlow API',
    version: '1.0.0',
    endpoints: {
      auth: ['POST /auth/login', 'POST /auth/register', 'GET /auth/me', 'POST /auth/change-password'],
      students: ['GET /students', 'GET /students/:id', 'POST /students', 'PATCH /students/:id'],
      departments: ['GET /departments', 'POST /departments', 'GET /departments/:code/faculty'],
      courses: ['GET /courses', 'POST /courses', 'GET /courses/:id', 'POST /courses/:id/enroll', 'PATCH /courses/:id/grades'],
      attendance: [
        'POST /attendance/sessions',
        'GET /attendance/sessions',
        'GET /attendance/overview',
        'GET /attendance/student/:id',
      ],
      companies: ['GET /companies', 'POST /companies', 'GET /companies/:id'],
      jobs: ['GET /jobs', 'POST /jobs', 'GET /jobs/:id', 'PATCH /jobs/:id', 'GET /jobs/:id/matches', 'POST /jobs/:id/applications/bulk'],
      applications: [
        'GET /applications',
        'GET /applications/pipeline',
        'POST /applications',
        'PATCH /applications/:id/status',
        'POST /applications/:id/interviews',
        'PATCH /applications/interviews/:id',
        'POST /applications/:id/offer',
        'PATCH /applications/offers/:id',
      ],
      analytics: ['GET /analytics/overview', 'GET /analytics/student/:id'],
      ai: [
        'GET /ai/health',
        'POST /ai/sync-index',
        'POST /ai/chat',
        'POST /ai/resume/ats-score',
        'POST /ai/resume/parse',
        'GET /ai/recommendations',
        'POST /ai/interview-prep',
        'POST /ai/jobs/:id/shortlist',
        'GET /ai/insights',
      ],
      notifications: ['GET /notifications', 'PATCH /notifications/read'],
    },
  });
});
