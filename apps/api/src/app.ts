import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { apiRouter } from './routes/index.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  // Behind Vercel / nginx / Render — required for correct client IPs in rate limits.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin/server-side requests have no Origin header.
        if (!origin) return cb(null, true);
        if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
        // Sandbox/preview hosts are allowed so live previews work.
        if (/https:\/\/[a-z0-9-]+\.(e2b\.app|vercel\.app)$/i.test(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: env.isProd ? 200 : 2000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => req.path === '/health' || req.path === '/api/health',
    }),
  );

  app.use(authenticate);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'campusflow-api',
      version: '1.0.0',
      env: env.NODE_ENV,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
