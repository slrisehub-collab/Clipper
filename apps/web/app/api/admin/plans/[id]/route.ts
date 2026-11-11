import { z } from 'zod';
import { query } from '@clipforge/core/db';
import { withAdmin, json, body, ApiError } from '@/lib/api';

const GB = 1024 ** 3;
const schema = z.object({
  name: z.string().trim().min(1).max(40),
  priceCentsMonthly: z.number().int().min(0).max(1_000_000),
  maxSourceDurationMin: z.number().int().min(1).max(24 * 60),
  maxUploadGb: z.number().min(0.01).max(1000),
  monthlyProcessingMinutes: z.number().int().min(0).max(1_000_000),
  storageGb: z.number().min(0.01).max(100_000),
  maxClipsPerJob: z.number().int().min(1).max(10_000),
  queuePriority: z.number().int().min(1).max(100),
  allowBatch: z.boolean(),
});

export const PATCH = withAdmin<{ id: string }>(async (req, _admin, { id }) => {
  const p = await body(req, schema);
  const r = await query(
    `update plans set name = $2, price_cents_monthly = $3, max_source_duration_sec = $4, max_upload_bytes = $5, monthly_processing_minutes = $6,
       storage_bytes = $7, max_clips_per_job = $8, queue_priority = $9, allow_batch = $10, updated_at = now() where id = $1 returning id`,
    [id, p.name, p.priceCentsMonthly, p.maxSourceDurationMin * 60, Math.round(p.maxUploadGb * GB), p.monthlyProcessingMinutes,
      Math.round(p.storageGb * GB), p.maxClipsPerJob, p.queuePriority, p.allowBatch],
  );
  if (!r.length) throw new ApiError(404, 'Plan not found.');
  return json({ ok: true });
});
