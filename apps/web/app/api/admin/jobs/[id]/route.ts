import { query } from '@clipforge/core/db';
import { redis, CANCEL_CHANNEL } from '@clipforge/core/queue';
import { withAdmin, json, assertUuid } from '@/lib/api';

/** Admin force-cancel of any user's job. */
export const DELETE = withAdmin<{ id: string }>(async (_req, _admin, { id }) => {
  assertUuid(id);
  await query(`update jobs set cancel_requested = true, updated_at = now() where id = $1 and status in ('waiting','processing')`, [id]);
  await query(`update jobs set status = 'canceled', finished_at = now() where id = $1 and status = 'waiting'`, [id]);
  await redis().publish(CANCEL_CHANNEL, id);
  return json({ ok: true });
});
