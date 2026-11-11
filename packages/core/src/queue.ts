import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';

export const QUEUES = {
  media: 'clipforge-media',      // URL import + probing uploaded sources
  clip: 'clipforge-clip',        // FFmpeg clipping jobs
  export: 'clipforge-export',    // ZIP building
  maintenance: 'clipforge-maint' // periodic cleanup
} as const;

export type MediaJobData = { kind: 'import' | 'probe'; videoId: string; userId: string };
export type ClipJobData = { jobId: string; userId: string };
export type ExportJobData = { exportId: string; userId: string };

const g = globalThis as unknown as { __cfRedis?: IORedis; __cfQueues?: Record<string, Queue> };

export function redis(): IORedis {
  if (!g.__cfRedis) g.__cfRedis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  return g.__cfRedis;
}

export function getQueue(name: string): Queue {
  g.__cfQueues ??= {};
  if (!g.__cfQueues[name]) {
    g.__cfQueues[name] = new Queue(name, {
      connection: redis(),
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }
  return g.__cfQueues[name];
}

export async function enqueueMedia(data: MediaJobData) {
  // jobId = video+kind makes repeated calls idempotent while a job is pending.
  await getQueue(QUEUES.media).add(data.kind, data, { jobId: `${data.kind}-${data.videoId}`, attempts: 2, backoff: { type: 'exponential', delay: 5000 } });
}

export async function enqueueClip(data: ClipJobData, priority: number) {
  // A distinct BullMQ id per enqueue so a retry is never swallowed by a finished job with the same id.
  // Duplicate submissions are prevented in the database (idempotency key + status checks), not here.
  await getQueue(QUEUES.clip).add('clip', data, { jobId: `clip-${data.jobId}-${Date.now()}`, priority, attempts: 1 });
}

export async function enqueueExport(data: ExportJobData) {
  await getQueue(QUEUES.export).add('zip', data, { jobId: `zip-${data.exportId}`, attempts: 2, backoff: { type: 'fixed', delay: 3000 } });
}

/** Channel used to tell the worker to kill a running FFmpeg process. */
export const CANCEL_CHANNEL = 'clipforge:cancel';
