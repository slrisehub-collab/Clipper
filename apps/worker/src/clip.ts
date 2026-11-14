import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { one, query, logError } from '@clipforge/core/db';
import { config } from '@clipforge/core/config';
import { storage, localStorageDriver, keys } from '@clipforge/core/storage';
import { addProcessingSeconds } from '@clipforge/core/limits';
import { needsTransform, outputSize, type Segment } from '@clipforge/core/plan';
import type { JobRow, VideoRow } from '@clipforge/core/types';
import { ffmpegWithProgress, keyframes, probe, thumbnail, FfmpegError } from './ffmpeg';
import { buildClipArgs, snapToKeyframes, startsOnKeyframe } from '@clipforge/core/encode';

/** Running FFmpeg processes by job id, so a cancel message can stop them immediately. */
export const running = new Map<string, ChildProcess>();
const canceled = new Set<string>();

export function requestKill(jobId: string) {
  canceled.add(jobId);
  running.get(jobId)?.kill('SIGKILL');
}

class Canceled extends Error {}

async function isCancelRequested(jobId: string) {
  if (canceled.has(jobId)) return true;
  const r = await one<{ cancel_requested: boolean }>('select cancel_requested from jobs where id = $1', [jobId]);
  return !r || r.cancel_requested;
}

/** Gets a local path for the source video: the stored file itself for the local driver, a temp copy for S3. */
export async function localSourcePath(video: VideoRow, workDir: string): Promise<string> {
  if (storage().name === 'local') return localStorageDriver().absolutePath(video.storage_key!);
  const ext = path.extname(video.storage_key!) || '.mp4';
  const p = path.join(workDir, `source${ext}`);
  await storage().getToFile(video.storage_key!, p);
  return p;
}

export async function processClipJob(jobId: string) {
  const job = await one<JobRow>('select * from jobs where id = $1', [jobId]);
  if (!job) return; // deleted
  if (job.status === 'completed' || job.status === 'canceled') return;
  if (job.cancel_requested) {
    await query(`update jobs set status = 'canceled', finished_at = now(), updated_at = now() where id = $1`, [jobId]);
    return;
  }
  const video = await one<VideoRow>('select * from videos where id = $1', [job.video_id]);
  if (!video || video.status !== 'ready' || !video.storage_key) {
    await query(`update jobs set status = 'failed', error = 'The source video is not available.', finished_at = now(), updated_at = now() where id = $1`, [jobId]);
    return;
  }

  await query(
    `update jobs set status = 'processing', attempts = attempts + 1, error = null, started_at = coalesce(started_at, now()), finished_at = null, updated_at = now() where id = $1`,
    [jobId],
  );

  const workDir = path.join(config.tmpDir, `job-${jobId}`);
  await fsp.mkdir(workDir, { recursive: true });
  canceled.delete(jobId);

  try {
    const cfg = job.config;
    const src = await localSourcePath(video, workDir);
    const info = await probe(src);
    const srcInfo = { width: info.width ?? video.width ?? 1280, height: info.height ?? video.height ?? 720, hasAudio: info.hasAudio };
    const transform = needsTransform(cfg, info.videoCodec, info.audioCodec);

    let segments: Segment[] = job.segments;
    let kfs: number[] = [];
    if (!transform) {
      kfs = await keyframes(src);
      if (cfg.cutMode === 'fast') {
        // Fast mode: cut only on keyframes, so every clip is a lossless stream copy.
        segments = snapToKeyframes(job.segments, kfs, info.duration);
        if (segments.length !== job.segments.length || segments.some((s, i) => s.start !== job.segments[i].start || s.end !== job.segments[i].end)) {
          await query('update jobs set segments = $2, total_clips = $3, updated_at = now() where id = $1', [jobId, JSON.stringify(segments), segments.length]);
        }
      }
    }

    // Resume: skip clips already produced by an earlier attempt.
    const done = new Set((await query<{ idx: number }>('select idx from clips where job_id = $1', [jobId])).map((r) => r.idx));
    const totalSec = segments.reduce((a, s) => a + (s.end - s.start), 0);
    let doneSec = segments.reduce((a, s, i) => a + (done.has(i + 1) ? s.end - s.start : 0), 0);
    const t0 = Date.now();
    const sec0 = doneSec;
    let lastWrite = 0;

    const report = async (currentIdx: number, partial: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastWrite < 1000) return;
      lastWrite = now;
      const processed = doneSec + partial;
      const rate = (processed - sec0) / Math.max(0.001, (now - t0) / 1000); // source seconds per wall second
      const eta = rate > 0 && processed - sec0 > 1 ? Math.round((totalSec - processed) / rate) : null;
      await query(
        'update jobs set progress = $2, current_clip = $3, completed_clips = $4, eta_sec = $5, updated_at = now() where id = $1',
        [jobId, Math.min(0.999, processed / totalSec), currentIdx, done.size, eta],
      );
    };

    const ext = cfg.format;
    const out = outputSize(srcInfo.width, srcInfo.height, cfg.quality, cfg.aspect);

    for (let i = 0; i < segments.length; i++) {
      const idx = i + 1;
      if (done.has(idx)) continue;
      if (await isCancelRequested(jobId)) throw new Canceled();
      const seg = segments[i];
      const segDur = seg.end - seg.start;
      const copy = !transform && (cfg.cutMode === 'fast' || startsOnKeyframe(kfs, seg.start, info.fps));
      const outFile = path.join(workDir, `clip-${idx}.${ext}`);
      const thumbFile = path.join(workDir, `clip-${idx}.jpg`);

      await report(idx, 0, true);
      try {
        await ffmpegWithProgress(
          buildClipArgs({ input: src, output: outFile, segment: seg, cfg, src: srcInfo, copy }),
          (t) => { void report(idx, Math.min(segDur, t)); },
          (child) => running.set(jobId, child),
        );
      } catch (e) {
        if (canceled.has(jobId) || (await isCancelRequested(jobId))) throw new Canceled();
        throw e;
      } finally {
        running.delete(jobId);
      }

      const clipInfo = await probe(outFile);
      await thumbnail(outFile, Math.min(1, clipInfo.duration / 2), thumbFile).catch(() => null);
      const clipKey = keys.clip(job.user_id, jobId, idx, ext);
      const thumbKey = keys.clipThumb(job.user_id, jobId, idx);
      const size = await storage().putFile(clipKey, outFile, ext === 'mp4' ? 'video/mp4' : 'video/webm');
      const hasThumb = await fsp.stat(thumbFile).then(() => true, () => false);
      if (hasThumb) await storage().putFile(thumbKey, thumbFile, 'image/jpeg');

      await query(
        `insert into clips (user_id, project_id, job_id, idx, start_sec, end_sec, duration_sec, storage_key, thumb_key, size_bytes, format, width, height, method)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (job_id, idx) do update set storage_key = excluded.storage_key, thumb_key = excluded.thumb_key, size_bytes = excluded.size_bytes, duration_sec = excluded.duration_sec`,
        [job.user_id, job.project_id, jobId, idx, seg.start, seg.end, clipInfo.duration, clipKey, hasThumb ? thumbKey : null, size, ext,
          copy ? srcInfo.width : out.width, copy ? srcInfo.height : out.height, copy ? 'copy' : 'encode'],
      );
      done.add(idx);
      doneSec += segDur;
      await report(idx, 0, true);
      await fsp.rm(outFile, { force: true });
      await fsp.rm(thumbFile, { force: true });
    }

    await query(
      `update jobs set status = 'completed', progress = 1, completed_clips = $2, current_clip = null, eta_sec = 0, source_seconds = $3, finished_at = now(), updated_at = now() where id = $1`,
      [jobId, done.size, totalSec],
    );
    await query('update projects set updated_at = now() where id = $1', [job.project_id]);
    await addProcessingSeconds(job.user_id, totalSec);
  } catch (e) {
    if (e instanceof Canceled) {
      await query(`update jobs set status = 'canceled', current_clip = null, eta_sec = null, finished_at = now(), updated_at = now() where id = $1`, [jobId]);
      return;
    }
    const msg = e instanceof FfmpegError
      ? `${e.message}${e.stderr ? `: ${e.stderr.trim().split('\n').slice(-2).join(' ')}` : ''}`
      : e instanceof Error ? e.message : String(e);
    await query(`update jobs set status = 'failed', error = $2, current_clip = null, eta_sec = null, finished_at = now(), updated_at = now() where id = $1`, [jobId, friendly(msg)]);
    await logError('worker', 'clip-job', e, { userId: job.user_id, jobId, details: { stderr: (e as FfmpegError).stderr?.slice(-2000) } });
  } finally {
    canceled.delete(jobId);
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

function friendly(msg: string): string {
  if (/No space left/i.test(msg)) return 'The processing server ran out of disk space. Please retry shortly.';
  if (/Invalid data found|moov atom not found/i.test(msg)) return 'The source video appears to be damaged and could not be cut.';
  return msg.slice(0, 500);
}
