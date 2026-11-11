import fsp from 'node:fs/promises';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '@clipforge/core/config';
import { QUEUES, CANCEL_CHANNEL, getQueue, type ClipJobData, type ExportJobData, type MediaJobData } from '@clipforge/core/queue';
import { pool, query } from '@clipforge/core/db';
import { processClipJob, requestKill } from './clip';
import { processMediaJob } from './media';
import { processExportJob } from './export';
import { runMaintenance } from './maintenance';

async function main() {
  await fsp.mkdir(config.tmpDir, { recursive: true });
  if (config.storageDriver === 'local') await fsp.mkdir(config.storageDir, { recursive: true });
  await query('select 1');

  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const common = { connection, lockDuration: 60_000, stalledInterval: 30_000, maxStalledCount: 2 };

  const workers = [
    new Worker<ClipJobData>(QUEUES.clip, async (job: Job<ClipJobData>) => processClipJob(job.data.jobId), { ...common, concurrency: config.workerConcurrency }),
    new Worker<MediaJobData>(QUEUES.media, async (job) => processMediaJob(job.data.kind, job.data.videoId), { ...common, concurrency: 2 }),
    new Worker<ExportJobData>(QUEUES.export, async (job) => processExportJob(job.data.exportId), { ...common, concurrency: 1 }),
    new Worker(QUEUES.maintenance, async () => runMaintenance(), { connection, concurrency: 1 }),
  ];
  for (const w of workers) {
    w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
    w.on('error', (err) => console.error(`[${w.name}]`, err.message));
  }

  // Hourly cleanup.
  await getQueue(QUEUES.maintenance).upsertJobScheduler('hourly-cleanup', { every: 3600_000 }, { name: 'cleanup' });

  // Cancellation: the API publishes a job id; kill its FFmpeg process right away.
  const sub = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  await sub.subscribe(CANCEL_CHANNEL);
  sub.on('message', (_ch, jobId) => requestKill(jobId));

  console.log(`ClipForge worker ready (storage: ${config.storageDriver}, clip concurrency: ${config.workerConcurrency})`);

  const shutdown = async () => {
    console.log('Shutting down worker…');
    await Promise.allSettled(workers.map((w) => w.close()));
    await sub.quit().catch(() => {});
    await connection.quit().catch(() => {});
    await pool().end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Worker failed to start:', e);
  process.exit(1);
});
