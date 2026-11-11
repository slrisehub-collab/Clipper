import 'server-only';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one, query } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { randomToken, sha256 } from '@clipforge/core/signing';
import type { UserRow } from '@clipforge/core/types';

export const SESSION_COOKIE = 'cf_session';
const SESSION_DAYS = 30;

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 12); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export async function createSession(userId: string, userAgent: string | null) {
  const token = randomToken(32);
  await query(
    `insert into sessions (user_id, token_hash, user_agent, expires_at) values ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
    [userId, sha256(token), userAgent?.slice(0, 300) ?? null],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query('delete from sessions where token_hash = $1', [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Current user, or null. Suspended users are treated as signed out. */
export async function currentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const u = await one<UserRow>(
    `select u.id, u.email, u.display_name, u.role, u.plan_id, u.suspended_at, u.suspended_reason, u.created_at
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  if (!u || u.suspended_at) return null;
  return u;
}

/** For server components: redirect to login when signed out. */
export async function requireUser(): Promise<UserRow> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireAdmin(): Promise<UserRow> {
  const u = await requireUser();
  if (u.role !== 'admin') redirect('/app');
  return u;
}
