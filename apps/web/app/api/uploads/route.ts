import { z } from 'zod';
import { one, tx } from '@clipforge/core/db';
import { storage, keys } from '@clipforge/core/storage';
import { getUserPlan, storageUsed } from '@clipforge/core/limits';
import { formatBytes } from '@clipforge/core/format';
import { withUser, body, json, limit, ApiError } from '@/lib/api';
import { ALLOWED_EXT } from '@/lib/uploads';

const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().max(100).optional().default(''),
});

const MB = 1024 * 1024;

export const POST = withUser(async (req, user) => {
  await limit(`upload-init:${user.id}`, 30, 3600);
  const { fileName, size, mimeType } = await body(req, schema);
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.includes(ext) || (mimeType && !mimeType.startsWith('video/') && mimeType !== 'application/octet-stream')) {
    throw new ApiError(400, `"${fileName}" is not a supported video file. Use MP4, MOV, WebM or MKV.`);
  }
  const plan = await getUserPlan(user.id);
  if (size > plan.max_upload_bytes) throw new ApiError(413, `This file is ${formatBytes(size)}. Your ${plan.name} plan allows uploads up to ${formatBytes(plan.max_upload_bytes)}.`);
  const used = await storageUsed(user.id);
  if (used + size > plan.storage_bytes) throw new ApiError(413, `Not enough storage. You have ${formatBytes(Math.max(0, plan.storage_bytes - used))} free. Delete old projects or upgrade.`);

  // S3 allows at most 10,000 parts of at least 5 MB.
  const partSize = Math.max(8 * MB, Math.ceil(size / 9000 / MB) * MB);
  const partCount = Math.ceil(size / partSize);
  const projectName = fileName.replace(/\.[^.]+$/, '').slice(0, 120) || 'Untitled project';

  const created = await tx(async (c) => {
    const p = (await c.query('insert into projects (user_id, name) values ($1, $2) returning id', [user.id, projectName])).rows[0];
    const v = (await c.query(
      `insert into videos (user_id, project_id, source_type, original_name, title, status, size_bytes) values ($1, $2, 'upload', $3, $4, 'uploading', $5) returning id`,
      [user.id, p.id, fileName, projectName, size],
    )).rows[0];
    const key = keys.source(user.id, v.id, ext);
    await c.query('update videos set storage_key = $2 where id = $1', [v.id, key]);
    const driverUploadId = await storage().createMultipart(key, mimeType || 'video/mp4');
    const u = (await c.query(
      `insert into uploads (user_id, video_id, storage_key, driver_upload_id, file_name, size_bytes, mime_type, part_size, part_count) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [user.id, v.id, key, driverUploadId, fileName, size, mimeType || null, partSize, partCount],
    )).rows[0];
    return { uploadId: u.id as string, videoId: v.id as string, projectId: p.id as string };
  });
  return json({ ...created, partSize, partCount }, 201);
});
