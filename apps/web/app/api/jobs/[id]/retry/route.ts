import { query } from '@clipforge/core/db';
import { enqueueClip } from '@clipforge/core/queue';
import { getUserPlan } from '@clipforge/core/limits';
import { withUser, json, limit, ApiError } from '@/lib/api';
import { getJob, jobPublic } from '@/lib/data';

/** Re-queue a failed or cancelled job. Clips already produced are kept and skipped. */
export const POST = withUser<{ id: string }>(async (_req, user, { id }) => {
  await limit(`job-retry:${user.id}`, 30, 3600);
  const job = await getJob(user.id, id);
  if (job.status !== 'failed' && job.status !== 'canceled') throw new ApiError(409, 'Only failed or cancelled jobs can be retried.');
  const updated = await query(
    `update jobs set status = 'waiting', cancel_requested = false, error = null, eta_sec = null, finished_at = null, updated_at = now()
     where id = $1 and status in ('failed','canceled') returning id`, [id],
  );
  if (!updated.length) throw new ApiError(409, 'This job is already being retried.');
  const plan = await getUserPlan(user.id);
  await enqueueClip({ jobId: id, userId: user.id }, plan.queue_priority);
  return json({ job: jobPublic(await getJob(user.id, id)) });
});
