import { z } from 'zod';
import { tx } from '@clipforge/core/db';
import { enqueueMedia } from '@clipforge/core/queue';
import { inspectRemoteVideo, UrlRejected } from '@clipforge/core/ssrf';
import { getUserPlan, storageUsed } from '@clipforge/core/limits';
import { formatBytes } from '@clipforge/core/format';
import { withUser, body, json, limit, ApiError } from '@/lib/api';

/** Validate a pasted link and, if it is a direct video file, queue the import. */
export const POST = withUser(async (req, user) => {
  await limit(`import:${user.id}`, 20, 3600);
  const { url, check } = await body(req, z.object({ url: z.string().trim().min(1).max(2048), check: z.boolean().optional() }));
  let info;
  try {
    info = await inspectRemoteVideo(url);
  } catch (e) {
    if (e instanceof UrlRejected) throw new ApiError(422, e.message, 'url_rejected');
    throw e;
  }
  const plan = await getUserPlan(user.id);
  if (info.size && info.size > plan.max_upload_bytes) {
    throw new ApiError(413, `This file is ${formatBytes(info.size)}. Your ${plan.name} plan allows up to ${formatBytes(plan.max_upload_bytes)}.`);
  }
  const free = plan.storage_bytes - (await storageUsed(user.id));
  if (info.size && info.size > free) throw new ApiError(413, `Not enough storage: this file is ${formatBytes(info.size)} and you have ${formatBytes(Math.max(0, free))} free.`);
  if (check) return json({ ok: true, info });

  const name = info.fileName.replace(/\.[^.]+$/, '').slice(0, 120) || 'Imported video';
  const ids = await tx(async (c) => {
    const p = (await c.query('insert into projects (user_id, name) values ($1, $2) returning id', [user.id, name])).rows[0];
    const v = (await c.query(
      `insert into videos (user_id, project_id, source_type, source_url, original_name, title, status, size_bytes) values ($1,$2,'url',$3,$4,$5,'importing',$6) returning id`,
      [user.id, p.id, info.url, info.fileName, name, info.size],
    )).rows[0];
    return { projectId: p.id as string, videoId: v.id as string };
  });
  await enqueueMedia({ kind: 'import', videoId: ids.videoId, userId: user.id });
  return json({ ...ids, info }, 201);
});
