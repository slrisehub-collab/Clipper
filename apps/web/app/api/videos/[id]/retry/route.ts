import { query } from '@clipforge/core/db';
import { enqueueMedia, getQueue, QUEUES } from '@clipforge/core/queue';
import { withUser, json, limit, ApiError } from '@/lib/api';
import { getVideo } from '@/lib/data';

/** Retry a failed import (URL) or re-probe. Uploads whose file was rejected must be uploaded again. */
export const POST = withUser<{ id: string }>(async (_req, user, { id }) => {
  await limit(`video-retry:${user.id}`, 20, 3600);
  const v = await getVideo(user.id, id);
  if (v.status !== 'failed') throw new ApiError(409, 'Only failed videos can be retried.');
  const kind = v.source_type === 'url' ? 'import' : 'probe';
  if (kind === 'probe' && !v.storage_key) throw new ApiError(409, 'The uploaded file was removed. Please upload it again.');
  // Clear any finished BullMQ job with the same id so the retry is accepted.
  await getQueue(QUEUES.media).remove(`${kind}-${v.id}`).catch(() => {});
  await query(`update videos set status = $2, error = null, updated_at = now() where id = $1`, [v.id, kind === 'import' ? 'importing' : 'probing']);
  await enqueueMedia({ kind, videoId: v.id, userId: user.id });
  return json({ ok: true });
});
