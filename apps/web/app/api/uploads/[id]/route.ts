import { query } from '@clipforge/core/db';
import { storage } from '@clipforge/core/storage';
import { withUser, json, assertUuid } from '@/lib/api';
import { deleteProject } from '@/lib/data';
import { getUpload } from '@/lib/uploads';

/** Status for resuming: which parts the server already has. */
export const GET = withUser<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  const u = await getUpload(user.id, id);
  const parts = u.status === 'active' ? await storage().listParts({ uploadId: u.id, storageKey: u.storage_key, driverUploadId: u.driver_upload_id }) : [];
  return json({ status: u.status, partSize: u.part_size, partCount: u.part_count, size: u.size_bytes, videoId: u.video_id, parts });
});

/** Cancel an in-progress upload and remove its project. */
export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  assertUuid(id);
  const u = await getUpload(user.id, id);
  if (u.status === 'active') {
    await storage().abortMultipart({ uploadId: u.id, storageKey: u.storage_key, driverUploadId: u.driver_upload_id });
    await query(`update uploads set status = 'aborted', updated_at = now() where id = $1`, [u.id]);
    const v = await query<{ project_id: string }>('select project_id from videos where id = $1', [u.video_id]);
    if (v[0]) await deleteProject(user.id, v[0].project_id);
  }
  return json({ ok: true });
});
