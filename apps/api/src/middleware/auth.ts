import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../lib/http.js';
import { TOKEN_COOKIE, verifyToken, type TokenPayload } from '../lib/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${TOKEN_COOKIE}=`));
    if (match) return decodeURIComponent(match.slice(TOKEN_COOKIE.length + 1));
  }
  return null;
}

/** Populates req.user when a valid token is present; never rejects on its own. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(AppError.unauthorized());
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden(`Requires one of: ${roles.join(', ')}`));
    }
    next();
  };
}

/** Students may only read/write their own records unless staff. */
export function assertStudentScope(req: Request, studentId: string) {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  if (user.role === 'STUDENT' && user.studentId !== studentId) {
    throw AppError.forbidden('Students can only access their own records');
  }
}
