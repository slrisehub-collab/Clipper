import { z } from 'zod';
import { one, query } from '@clipforge/core/db';
import { enqueueExport } from '@clipforge/core/queue';
import { getUserPlan } from '@clipforge/core/limits';
import { withUser, json, body, limit, ApiError } from '@/lib/api';
import { getProject } from '@/lib/data';

/** Start building a ZIP of all clips in a project, or of selected clips. */
export const POST = withUser(async (req, user) => {
  await limit(`export:${user.id}`, 30, 3600);
  const { projectId, clipIds, jobId } = await body(req, z.object({
    projectId: z.string().uuid(),
    clipIds: z.array(z.string().uuid()).max(5000).optional(),
    jobId: z.string().uuid().optional(),
  }));
  await getProject(user.id, projectId);
  const plan = await getUserPlan(user.id);
  if (!plan.allow_batch) throw new ApiError(402, 'ZIP downloads are available on the Pro plan.');
  const rows = await query<{ id: string }>(
    `select id from clips where project_id = $1 and user_id = $2 and ($3::uuid[] is null or id = any($3::uuid[])) and ($4::uuid is null or job_id = $4) order by job_id, idx`,
    [projectId, user.id, clipIds ?? null, jobId ?? null],
  );
  if (!rows.length) throw new ApiError(400, 'There are no clips to download.');
  const exp = await one<{ id: string }>('insert into exports (user_id, project_id, clip_ids) values ($1, $2, $3) returning id', [user.id, projectId, rows.map((r) => r.id)]);
  await enqueueExport({ exportId: exp!.id, userId: user.id });
  return json({ exportId: exp!.id, clipCount: rows.length }, 201);
});
