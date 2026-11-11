import { NextResponse } from 'next/server';
import { storage } from '@clipforge/core/storage';
import { slugify } from '@clipforge/core/format';
import { one } from '@clipforge/core/db';
import { withUser } from '@/lib/api';
import { getClip } from '@/lib/data';

/** Redirects to a short-lived signed URL that downloads the clip as an attachment. */
export const GET = withUser<{ id: string }>(async (req, user, { id }) => {
  const clip = await getClip(user.id, id);
  const p = await one<{ name: string }>('select name from projects where id = $1', [clip.project_id]);
  const name = `${slugify(p?.name ?? 'clip')}-clip-${String(clip.idx).padStart(3, '0')}.${clip.format}`;
  const url = await storage().signedUrl(clip.storage_key, { expiresIn: 600, downloadName: name });
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), 302);
});
