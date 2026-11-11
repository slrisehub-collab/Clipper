import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { logError } from '@clipforge/core/db';
import { rateLimit } from '@clipforge/core/ratelimit';
import type { UserRow } from '@clipforge/core/types';
import { currentUser } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export const notFound = () => new ApiError(404, 'Not found.');

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/** Rejects cross-site state-changing requests (CSRF defence on top of SameSite=Lax cookies). */
function checkOrigin(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin fetches from older browsers / non-browser clients carry the cookie only if they have it
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    if (new URL(origin).host !== host) throw new ApiError(403, 'Cross-site request blocked.');
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, 'Cross-site request blocked.');
  }
}

export async function limit(bucket: string, max: number, windowSec: number) {
  const r = await rateLimit(bucket, max, windowSec);
  if (!r.ok) throw new ApiError(429, 'Too many requests. Please wait a moment and try again.');
}

type Ctx<P> = { params: Promise<P> };

function handleError(e: unknown, req: NextRequest, user?: UserRow | null) {
  if (e instanceof ApiError) return json({ error: e.message, code: e.code }, e.status);
  if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? 'Invalid request.' }, 400);
  void logError('api', `${req.method} ${req.nextUrl.pathname}`, e, { userId: user?.id });
  return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
}

/** Wraps a route handler that needs a signed-in user. */
export function withUser<P = Record<string, string>>(fn: (req: NextRequest, user: UserRow, params: P) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    let user: UserRow | null = null;
    try {
      checkOrigin(req);
      user = await currentUser();
      if (!user) throw new ApiError(401, 'Please sign in.');
      return await fn(req, user, await ctx.params);
    } catch (e) {
      return handleError(e, req, user);
    }
  };
}

export function withAdmin<P = Record<string, string>>(fn: (req: NextRequest, user: UserRow, params: P) => Promise<Response>) {
  return withUser<P>(async (req, user, params) => {
    if (user.role !== 'admin') throw new ApiError(403, 'Admins only.');
    return fn(req, user, params);
  });
}

export function withPublic<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      checkOrigin(req);
      return await fn(req, await ctx.params);
    } catch (e) {
      return handleError(e, req);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, 'Invalid JSON body.'); }
  return schema.parse(raw);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string) {
  if (!UUID_RE.test(id)) throw notFound();
}
