import { z } from 'zod';
import { one, query } from '@clipforge/core/db';
import { withUser, body, json, limit, ApiError } from '@/lib/api';
import { cookies } from 'next/headers';
import { sha256 } from '@clipforge/core/signing';
import { hashPassword, verifyPassword, SESSION_COOKIE } from '@/lib/auth';

export const POST = withUser(async (req, user) => {
  await limit(`pw:${user.id}`, 5, 900);
  const { current, next } = await body(req, z.object({ current: z.string().max(200), next: z.string().min(8, 'Use at least 8 characters.').max(200) }));
  const row = await one<{ password_hash: string }>('select password_hash from users where id = $1', [user.id]);
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new ApiError(401, 'Current password is incorrect.');
  await query('update users set password_hash = $2, updated_at = now() where id = $1', [user.id, await hashPassword(next)]);
  // Sign out other devices.
  const current_token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  await query('delete from sessions where user_id = $1 and token_hash <> $2', [user.id, sha256(current_token)]);
  return json({ ok: true });
});
