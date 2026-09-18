/**
 * Container entrypoint helper: only seeds when the database has no users yet,
 * so `docker compose up` on an existing volume never wipes real data.
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const prisma = new PrismaClient();

try {
  const users = await prisma.user.count();

  if (users > 0) {
    console.log(`[seed] database already has ${users} users — skipping seed`);
  } else {
    console.log('[seed] empty database detected — running seed');
    execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
  }
} catch (error) {
  console.error('[seed] check failed:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
