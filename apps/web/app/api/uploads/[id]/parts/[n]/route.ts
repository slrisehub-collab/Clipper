import { Readable, Transform } from 'node:stream';
import type { NextRequest } from 'next/server';
import { localStorageDriver } from '@clipforge/core/storage';
import { verify } from '@clipforge/core/signing';
import { query } from '@clipforge/core/db';
import { withUser, json, assertUuid, ApiError } from '@/lib/api';
import { getUpload } from '@/lib/uploads';

export const runtime = 'nodejs';

/** Receives one part of a multipart upload (local storage driver only; S3 uploads go straight to the bucket). */
export const PUT = withUser<{ id: string; n: string }>(async (req: NextRequest, user, { id, n }) => {
  assertUuid(id);
  const partNumber = Number(n);
  const e = Number(req.nextUrl.searchParams.get('e'));
  const s = req.nextUrl.searchParams.get('s') ?? '';
  if (!Number.isInteger(partNumber) || partNumber < 1) throw new ApiError(400, 'Invalid part number.');
  if (!e || e < Date.now() / 1000 || !verify(['part', id, partNumber, e], s)) throw new ApiError(403, 'Upload link expired. Retrying will fetch a new one.');
  const u = await getUpload(user.id, id);
  if (u.status !== 'active') throw new ApiError(409, 'This upload is no longer active.');
  if (partNumber > u.part_count) throw new ApiError(400, 'Invalid part number.');
  const expected = partNumber === u.part_count ? u.size_bytes - u.part_size * (u.part_count - 1) : u.part_size;
  if (!req.body) throw new ApiError(400, 'Empty body.');

  let seen = 0;
  const guard = new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen > expected) return cb(new ApiError(413, 'Part is larger than expected.'));
      cb(null, chunk);
    },
  });
  const stream = Readable.fromWeb(req.body as any).pipe(guard);
  const part = await localStorageDriver().writePart(id, partNumber, stream);
  if (part.size !== expected) throw new ApiError(400, `Part ${partNumber} was incomplete (${part.size} of ${expected} bytes). It will be retried.`);
  await query('update uploads set updated_at = now() where id = $1', [id]);
  return json({ etag: part.etag, size: part.size });
});
