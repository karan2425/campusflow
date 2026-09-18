/**
 * Wire-format contracts for the CampusFlow REST API.
 *
 * Every Express handler responds with one of these envelopes (see
 * apps/api/src/lib/http.ts) and the web client unwraps them in
 * apps/web/src/lib/api.ts.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    /** Present on VALIDATION_ERROR: one entry per rejected field. */
    details?: Array<{ path: string; message: string }> | unknown;
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export function isApiFailure(body: unknown): body is ApiFailure {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ApiFailure).error?.message === 'string'
  );
}

/** Type guard for the success envelope, handy when proxying raw responses. */
export function isApiSuccess<T>(body: unknown): body is ApiSuccess<T> {
  return typeof body === 'object' && body !== null && (body as ApiSuccess<T>).success === true;
}

/** Stable machine-readable error codes emitted by the API. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Roles recognised across the platform. */
export const ROLES = ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] as const;
export type Role = (typeof ROLES)[number];

/** Roles allowed to view institute-wide analytics and candidate pools. */
export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'];

export function isStaffRole(role: Role | undefined | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
