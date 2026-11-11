import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { one, query, logError } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { storage, keys } from '@clipforge/core/storage';
import { getUserPlan, storageUsed } from '@clipforge/core/limits';
import { safeFetch, UrlRejected } from '@clipforge/core/ssrf';
import { formatBytes } from '@clipforge/core/format';
import { formatDuration } from '@clipforge/core/plan';
import type { VideoRow } from '@clipforge/core/types';
import { probe, thumbnail, FfmpegError } from './ffmpeg';
import { localSourcePath } from './clip';

class UserFacing extends Error {}

async function fail(videoId: string, message: string) {
  await query(`update videos set status = 'failed', error = $2, updated_at = now() where id = $1`, [videoId, message]);
}

/** Probe a stored source video, validate it against plan limits and make a thumbnail. */
async function probeAndFinish(video: VideoRow, workDir: string) {
  await query(`update videos set status = 'probing', updated_at = now() where id = $1`, [video.id]);
  const plan = await getUserPlan(video.user_id);
  const src = await localSourcePath(video, workDir);
  const info = await probe(src);
  if (info.duration > plan.max_source_duration_sec) {
    throw new UserFacing(`This video is ${formatDuration(info.duration)} long. Your ${plan.name} plan accepts videos up to ${formatDuration(plan.max_source_duration_sec)}.`);
  }
  const size = (await storage().size(video.storage_key!)) ?? info.sizeBytes ?? 0;
  const thumbFile = path.join(workDir, 'thumb.jpg');
  await thumbnail(src, Math.min(info.duration * 0.1, 5), thumbFile, 640).catch(() => null);
  let thumbKey: string | null = null;
  if (await fsp.stat(thumbFile).then(() => true, () => false)) {
    thumbKey = keys.sourceThumb(video.user_id, video.id);
    await storage().putFile(thumbKey, thumbFile, 'image/jpeg');
  }
  await query(
    `update videos set status = 'ready', error = null, duration_sec = $2, width = $3, height = $4, fps = $5, video_codec = $6, audio_codec = $7,
       has_audio = $8, container = $9, size_bytes = $10, thumb_key = $11, title = coalesce(title, $12), updated_at = now() where id = $1`,
    [video.id, info.duration, info.width, info.height, info.fps, info.videoCodec, info.audioCodec, info.hasAudio, info.formatName, size, thumbKey, info.title],
  );
}

async function importFromUrl(video: VideoRow, workDir: string) {
  const plan = await getUserPlan(video.user_id);
  const free = plan.storage_bytes - (await storageUsed(video.user_id));
  const maxBytes = Math.min(plan.max_upload_bytes, Math.max(0, free));
  const { res, finalUrl } = await safeFetch(video.source_url!, { signal: AbortSignal.timeout(2 * 60 * 60_000) });
  if (res.status >= 400) throw new UserFacing(`The server returned an error (${res.status}) when downloading the video.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared && declared > maxBytes) throw new UserFacing(`This file is ${formatBytes(declared)}. You can import up to ${formatBytes(maxBytes)} with your current plan and free storage.`);
  if (!res.body) throw new UserFacing('The server sent an empty response.');

  const extMatch = finalUrl.pathname.match(/\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|ts|3gp)$/i);
  const ext = (extMatch?.[1] ?? 'mp4').toLowerCase();
  const tmp = path.join(workDir, `download.${ext}`);
  let received = 0;
  let lastReport = 0;
  const body = Readable.fromWeb(res.body as any);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > maxBytes) body.destroy(new UserFacing(`The download exceeded ${formatBytes(maxBytes)}, the limit for your plan and free storage.`));
    const now = Date.now();
    if (now - lastReport > 2000) {
      lastReport = now;
      void query('update videos set size_bytes = $2, updated_at = now() where id = $1', [video.id, received]);
    }
  });
  await pipeline(body, fs.createWriteStream(tmp));

  // Verify it really is a video before keeping it.
  await probe(tmp);
  const key = keys.source(video.user_id, video.id, ext);
  const size = await storage().putFile(key, tmp, res.headers.get('content-type') ?? 'video/mp4');
  await query('update videos set storage_key = $2, size_bytes = $3, updated_at = now() where id = $1', [video.id, key, size]);
  return { ...video, storage_key: key };
}

export async function processMediaJob(kind: 'import' | 'probe', videoId: string) {
  const video = await one<VideoRow>('select * from videos where id = $1', [videoId]);
  if (!video || video.status === 'ready') return;
  const workDir = path.join(config.tmpDir, `media-${videoId}`);
  await fsp.mkdir(workDir, { recursive: true });
  try {
    let v = video;
    if (kind === 'import') {
      await query(`update videos set status = 'importing', error = null, updated_at = now() where id = $1`, [videoId]);
      v = await importFromUrl(video, workDir);
    }
    await probeAndFinish(v, workDir);
  } catch (e) {
    const known = e instanceof UserFacing || e instanceof UrlRejected || e instanceof FfmpegError;
    await fail(videoId, known ? (e as Error).message : 'Something went wrong while preparing this video. Please try again.');
    if (!known) await logError('worker', `media-${kind}`, e, { userId: video.user_id });
    // Remove a stored source that failed validation so it doesn't count against storage.
    if (video.storage_key || kind === 'import') {
      const latest = await one<VideoRow>('select storage_key from videos where id = $1', [videoId]);
      if (latest?.storage_key) {
        await storage().deletePrefix(keys.videoPrefix(video.user_id, videoId)).catch(() => {});
        await query('update videos set storage_key = null, size_bytes = null where id = $1', [videoId]);
      }
    }
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}
