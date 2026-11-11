import 'server-only';
import { one } from '@clipforge/core/db';
import { ApiError } from './api';

export const ALLOWED_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', '3gp', 'ts'];

export async function getUpload(userId: string, id: string) {
  const u = await one<{ id: string; user_id: string; video_id: string; storage_key: string; driver_upload_id: string | null; size_bytes: number; part_size: number; part_count: number; status: string }>(
    'select * from uploads where id = $1 and user_id = $2', [id, userId],
  );
  if (!u) throw new ApiError(404, 'Upload not found.');
  return u;
}
