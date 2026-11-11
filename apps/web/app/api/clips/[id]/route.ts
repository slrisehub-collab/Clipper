import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { storage } from '@clipforge/core/storage';
import { withUser, json, body } from '@/lib/api';
import { getClip } from '@/lib/data';

export const PATCH = withUser<{ id: string }>(async (req, user, { id }) => {
  const { saved } = await body(req, z.object({ saved: z.boolean() }));
  await getClip(user.id, id);
  await query('update clips set saved = $3 where id = $1 and user_id = $2', [id, user.id, saved]);
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  const clip = await getClip(user.id, id);
  await storage().delete(clip.storage_key).catch(() => {});
  if (clip.thumb_key) await storage().delete(clip.thumb_key).catch(() => {});
  await query('delete from clips where id = $1 and user_id = $2', [id, user.id]);
  return json({ ok: true });
});
