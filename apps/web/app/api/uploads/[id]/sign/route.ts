import { z } from 'zod';
import { storage } from '@clipforge/core/storage';
import { withUser, json, body, assertUuid, ApiError } from '@/lib/api';
import { getUpload } from '@/lib/uploads';

/** Returns upload URLs for the requested part numbers (S3 presigned, or signed local endpoints). */
export const POST = withUser<{ id: string }>(async (req, user, { id }) => {
  assertUuid(id);
  const { parts } = await body(req, z.object({ parts: z.array(z.number().int().min(1)).min(1).max(100) }));
  const u = await getUpload(user.id, id);
  if (u.status !== 'active') throw new ApiError(409, 'This upload is no longer active.');
  if (parts.some((n) => n > u.part_count)) throw new ApiError(400, 'Invalid part number.');
  const ref = { uploadId: u.id, storageKey: u.storage_key, driverUploadId: u.driver_upload_id };
  const urls: Record<number, string> = {};
  for (const n of parts) urls[n] = await storage().partUploadUrl(ref, n, 3600);
  return json({ urls });
});
