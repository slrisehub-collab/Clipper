import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { redis, CANCEL_CHANNEL } from '@clipforge/core/queue';
import { withUser, json, body } from '@/lib/api';
import { deleteProject, getProject, projectDetail } from '@/lib/data';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => json(await projectDetail(user.id, id)));

export const PATCH = withUser<{ id: string }>(async (req, user, { id }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1, 'Name cannot be empty.').max(120) }));
  await getProject(user.id, id);
  await query('update projects set name = $3, updated_at = now() where id = $1 and user_id = $2', [id, user.id, name]);
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  const active = await query<{ id: string }>(`select id from jobs where project_id = $1 and user_id = $2 and status in ('waiting','processing')`, [id, user.id]);
  for (const j of active) await redis().publish(CANCEL_CHANNEL, j.id).catch(() => {});
  await deleteProject(user.id, id);
  return json({ ok: true });
});
