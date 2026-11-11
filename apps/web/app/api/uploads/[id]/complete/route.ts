import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { storage } from '@clipforge/core/storage';
import { enqueueMedia } from '@clipforge/core/queue';
import { withUser, json, body, assertUuid, ApiError } from '@/lib/api';
import { getUpload } from '@/lib/uploads';

const schema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().max(200) })).optional() });

export const POST = withUser<{ id: string }>(async (req, user, { id }) => {
  assertUuid(id);
  const { parts: clientParts } = await body(req, schema);
  const u = await getUpload(user.id, id);
  if (u.status === 'completed') return json({ videoId: u.video_id });
  if (u.status !== 'active') throw new ApiError(409, 'This upload was cancelled.');
  const ref = { uploadId: u.id, storageKey: u.storage_key, driverUploadId: u.driver_upload_id };
  const have = await storage().listParts(ref);
  const byNum = new Map(have.map((p) => [p.partNumber, p]));
  const missing: number[] = [];
  for (let n = 1; n <= u.part_count; n++) if (!byNum.has(n)) missing.push(n);
  if (missing.length) throw new ApiError(409, `Upload incomplete: ${missing.length} part(s) missing.`, 'missing_parts');
  const total = have.filter((p) => p.partNumber <= u.part_count).reduce((a, p) => a + p.size, 0);
  if (total !== u.size_bytes) throw new ApiError(409, 'Uploaded size does not match the file. Please upload again.');
  const etags = new Map((clientParts ?? []).map((p) => [p.partNumber, p.etag]));
  await storage().completeMultipart(ref, [...byNum.values()].filter((p) => p.partNumber <= u.part_count).map((p) => ({ partNumber: p.partNumber, etag: etags.get(p.partNumber) ?? p.etag })));
  await query(`update uploads set status = 'completed', updated_at = now() where id = $1`, [id]);
  await query(`update videos set status = 'probing', updated_at = now() where id = $1`, [u.video_id]);
  await enqueueMedia({ kind: 'probe', videoId: u.video_id, userId: user.id });
  return json({ videoId: u.video_id });
});
