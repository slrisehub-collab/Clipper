import { z } from 'zod';
import { one, query } from '@clipforge/core/db';
import { enqueueClip } from '@clipforge/core/queue';
import { getUserPlan, processingUsedSeconds } from '@clipforge/core/limits';
import { availableQualities, planSegments, PlanError, type ClipConfig } from '@clipforge/core/plan';
import type { JobRow } from '@clipforge/core/types';
import { withUser, body, json, limit, ApiError } from '@/lib/api';
import { getVideo, jobPublic } from '@/lib/data';

const range = z.object({ start: z.number().min(0), end: z.number().positive() });
const configSchema = z.object({
  method: z.enum(['duration', 'count', 'interval', 'custom']),
  segmentSeconds: z.number().min(1).max(24 * 3600).optional(),
  count: z.number().int().min(1).max(5000).optional(),
  ranges: z.array(range).max(1000).optional(),
  format: z.enum(['mp4', 'webm']),
  quality: z.enum(['original', '1080', '720', '480']),
  aspect: z.enum(['original', '16:9', '9:16', '1:1']),
  aspectMode: z.enum(['crop', 'fit']),
  keepAudio: z.boolean(),
  cutMode: z.enum(['precise', 'fast']),
});

const schema = z.object({
  videoId: z.string().uuid(),
  config: configSchema,
  idempotencyKey: z.string().min(8).max(100),
});

export const POST = withUser(async (req, user) => {
  await limit(`job-create:${user.id}`, 60, 3600);
  const { videoId, config, idempotencyKey } = await body(req, schema);

  // Same key from a double-click or a network retry returns the original job.
  const dup = await one<JobRow>('select * from jobs where user_id = $1 and idempotency_key = $2', [user.id, idempotencyKey]);
  if (dup) return json({ job: jobPublic(dup) });

  const video = await getVideo(user.id, videoId);
  if (video.status !== 'ready' || !video.duration_sec) throw new ApiError(409, 'The video is not ready yet.');
  const cfg = config as ClipConfig;
  if (!availableQualities(video.width, video.height).includes(cfg.quality)) {
    throw new ApiError(400, `This video is ${video.width}×${video.height}, so ${cfg.quality}p can't be produced without upscaling.`);
  }
  let segments;
  try { segments = planSegments(cfg, video.duration_sec); } catch (e) {
    if (e instanceof PlanError) throw new ApiError(400, e.message);
    throw e;
  }
  const plan = await getUserPlan(user.id);
  if (segments.length > plan.max_clips_per_job) throw new ApiError(400, `That would create ${segments.length} clips. Your ${plan.name} plan allows up to ${plan.max_clips_per_job} per job. Use a longer clip duration.`);

  const seconds = segments.reduce((a, s) => a + (s.end - s.start), 0);
  const used = await processingUsedSeconds(user.id);
  const reserved = await one<{ s: number }>(`select coalesce(sum(duration_sec), 0) as s from (select (select sum((x->>'end')::float - (x->>'start')::float) from jsonb_array_elements(segments) x) as duration_sec from jobs where user_id = $1 and status in ('waiting','processing')) t`, [user.id]);
  const remaining = plan.monthly_processing_minutes * 60 - used - Number(reserved?.s ?? 0);
  if (seconds > remaining) {
    throw new ApiError(402, `This job needs ${Math.ceil(seconds / 60)} processing minutes and you have ${Math.max(0, Math.floor(remaining / 60))} left this month on the ${plan.name} plan.`);
  }
  const active = await one<{ n: number }>(`select count(*)::int as n from jobs where user_id = $1 and status in ('waiting','processing')`, [user.id]);
  if ((active?.n ?? 0) >= (plan.id === 'free' ? 2 : 10)) throw new ApiError(429, 'You already have jobs in the queue. Wait for them to finish first.');

  const job = await one<JobRow>(
    `insert into jobs (user_id, project_id, video_id, config, segments, idempotency_key, total_clips)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (user_id, idempotency_key) do nothing returning *`,
    [user.id, video.project_id, video.id, JSON.stringify(cfg), JSON.stringify(segments), idempotencyKey, segments.length],
  );
  if (!job) {
    const again = await one<JobRow>('select * from jobs where user_id = $1 and idempotency_key = $2', [user.id, idempotencyKey]);
    return json({ job: jobPublic(again!) });
  }
  await query('update projects set updated_at = now() where id = $1', [video.project_id]);
  await enqueueClip({ jobId: job.id, userId: user.id }, plan.queue_priority);
  return json({ job: jobPublic(job) }, 201);
});
