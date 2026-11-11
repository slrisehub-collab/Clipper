import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { usageSummary } from '@clipforge/core/limits';
import { storage } from '@clipforge/core/storage';
import { CANCEL_CHANNEL, redis } from '@clipforge/core/queue';
import { withUser, body, json, ApiError } from '@/lib/api';
import { destroySession, verifyPassword } from '@/lib/auth';
import { one } from '@clipforge/core/db';

export const GET = withUser(async (_req, user) => {
  return json({ user: { id: user.id, email: user.email, name: user.display_name, role: user.role, plan: user.plan_id }, usage: await usageSummary(user.id) });
});

export const PATCH = withUser(async (req, user) => {
  const { name } = await body(req, z.object({ name: z.string().trim().max(80) }));
  await query('update users set display_name = $2, updated_at = now() where id = $1', [user.id, name || null]);
  return json({ ok: true });
});

/** Deletes the account and all stored files. Requires the password. */
export const DELETE = withUser(async (req, user) => {
  const { password } = await body(req, z.object({ password: z.string().max(200) }));
  const row = await one<{ password_hash: string }>('select password_hash from users where id = $1', [user.id]);
  if (!row || !(await verifyPassword(password, row.password_hash))) throw new ApiError(401, 'Password is incorrect.');
  const active = await query<{ id: string }>(`update jobs set cancel_requested = true where user_id = $1 and status in ('waiting','processing') returning id`, [user.id]);
  for (const j of active) await redis().publish(CANCEL_CHANNEL, j.id).catch(() => {});
  await storage().deletePrefix(`users/${user.id}/`).catch(() => {});
  await query('delete from users where id = $1', [user.id]);
  await destroySession();
  return json({ ok: true });
});
