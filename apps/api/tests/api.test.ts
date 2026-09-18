import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

/**
 * Integration tests — run against a real PostgreSQL database.
 * Set DATABASE_URL to a throwaway database before running `npm test`.
 */
const app = createApp();
let token = '';
let studentId = '';

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@campusflow.dev', password: process.env.SEED_DEFAULT_PASSWORD ?? 'Password@123' });
  token = res.body?.data?.token ?? '';
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health & discovery', () => {
  it('reports service health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('exposes the route index', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.jobs.length).toBeGreaterThan(0);
  });
});

describe('auth', () => {
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@campusflow.dev', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validates payloads', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in a seeded admin', async () => {
    expect(token, 'seed the database with npm run db:seed first').toBeTruthy();
  });

  it('returns the session profile', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('ADMIN');
  });

  it('blocks unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/v1/students');
    expect(res.status).toBe(401);
  });
});

describe('students & analytics', () => {
  it('lists students with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/students?pageSize=5').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
    studentId = res.body.data[0]?.id ?? '';
  });

  it('filters by CGPA', async () => {
    const res = await request(app).get('/api/v1/students?minCgpa=9').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const s of res.body.data) expect(s.cgpa).toBeGreaterThanOrEqual(9);
  });

  it('computes placement analytics', async () => {
    const res = await request(app).get('/api/v1/analytics/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.headline).toHaveProperty('placementRate');
    expect(res.body.data.byDepartment.length).toBeGreaterThan(0);
  });

  it('returns a student 360 profile', async () => {
    if (!studentId) return;
    const res = await request(app).get(`/api/v1/students/${studentId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('attendance');
  });
});

describe('placements', () => {
  it('lists open job postings', async () => {
    const res = await request(app).get('/api/v1/jobs?status=OPEN').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const j of res.body.data) expect(j.status).toBe('OPEN');
  });

  it('rejects a job creation with an invalid payload', async () => {
    const res = await request(app).post('/api/v1/jobs').set('Authorization', `Bearer ${token}`).send({ title: 'x' });
    expect(res.status).toBe(422);
  });

  it('returns the pipeline board shape', async () => {
    const res = await request(app).get('/api/v1/applications/pipeline').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.columns.map((c: { status: string }) => c.status)).toContain('OFFERED');
  });
});

describe('ai', () => {
  it('reports AI service status without throwing', async () => {
    const res = await request(app).get('/api/v1/ai/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('reachable');
  });
});
