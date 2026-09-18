import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../env.js';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
  studentId?: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export const TOKEN_COOKIE = 'cf_token';

/** Access token for a user; students carry their profile id for scoped queries. */
export function tokenForUser(user: {
  id: string;
  email: string;
  role: Role;
  name: string;
  student?: { id: string } | null;
}): string {
  return signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    studentId: user.student?.id,
  });
}
