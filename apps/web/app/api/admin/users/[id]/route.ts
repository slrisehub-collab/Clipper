import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { redis, CANCEL_CHANNEL } from '@clipforge/core/queue';
import { withAdmin, json, body, assertUuid, ApiError } from '@/lib/api';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal('unsuspend') }),
  z.object({ action: z.literal('plan'), planId: z.string().max(40) }),
  z.object({ action: z.literal('role'), role: z.enum(['user', 'admin']) }),
]);

export const POST = withAdmin<{ id: string }>(async (req, admin, { id }) => {
  assertUuid(id);
  const input = await body(req, schema);
  if (id === admin.id && (input.action === 'suspend' || input.action === 'role')) throw new ApiError(400, "You can't change your own role or suspend yourself.");
  switch (input.action) {
    case 'suspend': {
      await query('update users set suspended_at = now(), suspended_reason = $2, updated_at = now() where id = $1', [id, input.reason || null]);
      await query('delete from sessions where user_id = $1', [id]);
      const jobs = await query<{ id: string }>(`update jobs set cancel_requested = true where user_id = $1 and status in ('waiting','processing') returning id`, [id]);
      for (const j of jobs) await redis().publish(CANCEL_CHANNEL, j.id).catch(() => {});
      break;
    }
    case 'unsuspend':
      await query('update users set suspended_at = null, suspended_reason = null, updated_at = now() where id = $1', [id]);
      break;
    case 'plan': {
      const r = await query('update users set plan_id = $2, updated_at = now() where id = $1 and exists (select 1 from plans where id = $2) returning id', [id, input.planId]);
      if (!r.length) throw new ApiError(400, 'Unknown plan.');
      break;
    }
    case 'role':
      await query('update users set role = $2, updated_at = now() where id = $1', [id, input.role]);
      break;
  }
  return json({ ok: true });
});
