import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { randomToken } from '@clipforge/core/signing';
import { withUser, json, body } from '@/lib/api';
import { getClip } from '@/lib/data';

/** Turn a public share link on or off. Turning it off revokes the old link permanently. */
export const POST = withUser<{ id: string }>(async (req, user, { id }) => {
  const { enabled } = await body(req, z.object({ enabled: z.boolean() }));
  const clip = await getClip(user.id, id);
  const token = enabled ? clip.share_token ?? randomToken(18) : null;
  await query('update clips set share_token = $3 where id = $1 and user_id = $2', [id, user.id, token]);
  return json({ shared: !!token, url: token ? `${config.appUrl}/s/${token}` : null });
});
