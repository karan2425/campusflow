import { createApp } from './app.js';
import { env } from './env.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`\n  🎓 CampusFlow API`);
  console.log(`  ├─ REST      http://localhost:${env.PORT}/api/v1`);
  console.log(`  ├─ Health    http://localhost:${env.PORT}/health`);
  console.log(`  ├─ AI service ${env.AI_SERVICE_URL}`);
  console.log(`  └─ Mode      ${env.NODE_ENV}\n`);
});

/** Fail loudly instead of leaking a connection pool on every nodemon restart. */
async function shutdown(signal: string) {
  console.log(`\n[api] ${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection:', reason);
});
