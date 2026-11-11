import { one } from '@clipforge/core/db';
import { storage } from '@clipforge/core/storage';
import { withUser, json, assertUuid, ApiError } from '@/lib/api';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  const e = await one<{ id: string; status: string; progress: number; storage_key: string | null; size_bytes: number | null; error: string | null; clip_ids: string[] }>(
    'select * from exports where id = $1 and user_id = $2', [id, user.id],
  );
  if (!e) throw new ApiError(404, 'Export not found.');
  const url = e.status === 'completed' && e.storage_key ? await storage().signedUrl(e.storage_key, { expiresIn: 3600, downloadName: `clipforge-${e.id.slice(0, 8)}.zip` }) : null;
  return json({ id: e.id, status: e.status, progress: e.progress, sizeBytes: e.size_bytes, error: e.error, clipCount: e.clip_ids.length, url });
});
