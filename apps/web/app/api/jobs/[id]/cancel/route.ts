import { query } from '@clipforge/core/db';
import { redis, CANCEL_CHANNEL } from '@clipforge/core/queue';
import { withUser, json, ApiError } from '@/lib/api';
import { getJob, jobPublic } from '@/lib/data';

export const POST = withUser<{ id: string }>(async (_req, user, { id }) => {
  const job = await getJob(user.id, id);
  if (job.status !== 'waiting' && job.status !== 'processing') throw new ApiError(409, 'This job has already finished.');
  if (job.status === 'waiting') {
    // Not started: mark it cancelled; the worker skips cancelled jobs when it picks them up.
    await query(`update jobs set status = 'canceled', cancel_requested = true, finished_at = now(), updated_at = now() where id = $1 and status = 'waiting'`, [id]);
  } else {
    await query('update jobs set cancel_requested = true, updated_at = now() where id = $1', [id]);
  }
  await redis().publish(CANCEL_CHANNEL, id);
  return json({ job: jobPublic(await getJob(user.id, id)) });
});
