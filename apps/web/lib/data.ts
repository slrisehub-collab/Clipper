import 'server-only';
// Every read here is scoped by user_id. This is the single place where ownership
// is enforced for data, so a user can never load another user's rows by guessing an id.
import { one, query } from '@clipforge/core/db';
import { storage } from '@clipforge/core/storage';
import type { ClipRow, JobRow, VideoRow } from '@clipforge/core/types';
import { slugify } from '@clipforge/core/format';
import { ApiError, assertUuid } from './api';

export interface ProjectRow { id: string; user_id: string; name: string; created_at: string; updated_at: string }

export async function getProject(userId: string, id: string) {
  assertUuid(id);
  const p = await one<ProjectRow>('select * from projects where id = $1 and user_id = $2', [id, userId]);
  if (!p) throw new ApiError(404, 'Project not found.');
  return p;
}

export async function getVideo(userId: string, id: string) {
  assertUuid(id);
  const v = await one<VideoRow>('select * from videos where id = $1 and user_id = $2', [id, userId]);
  if (!v) throw new ApiError(404, 'Video not found.');
  return v;
}

export async function getJob(userId: string, id: string) {
  assertUuid(id);
  const j = await one<JobRow>('select * from jobs where id = $1 and user_id = $2', [id, userId]);
  if (!j) throw new ApiError(404, 'Job not found.');
  return j;
}

export async function getClip(userId: string, id: string) {
  assertUuid(id);
  const c = await one<ClipRow>('select * from clips where id = $1 and user_id = $2', [id, userId]);
  if (!c) throw new ApiError(404, 'Clip not found.');
  return c;
}

/** Signed URL helpers. Only called after an ownership check. */
export async function thumbUrl(key: string | null) {
  return key ? storage().signedUrl(key, { expiresIn: 6 * 3600 }) : null;
}

export async function videoPublic(v: VideoRow) {
  return {
    id: v.id,
    projectId: v.project_id,
    sourceType: v.source_type,
    sourceUrl: v.source_url,
    title: v.title ?? v.original_name ?? 'Untitled video',
    originalName: v.original_name,
    status: v.status,
    error: v.error,
    sizeBytes: v.size_bytes,
    duration: v.duration_sec,
    width: v.width,
    height: v.height,
    fps: v.fps,
    videoCodec: v.video_codec,
    audioCodec: v.audio_codec,
    hasAudio: v.has_audio,
    thumbUrl: await thumbUrl(v.thumb_key),
    previewUrl: v.status === 'ready' && v.storage_key ? await storage().signedUrl(v.storage_key, { expiresIn: 6 * 3600 }) : null,
    createdAt: v.created_at,
  };
}
export type VideoPublic = Awaited<ReturnType<typeof videoPublic>>;

export function jobPublic(j: JobRow) {
  return {
    id: j.id,
    projectId: j.project_id,
    videoId: j.video_id,
    status: j.status,
    config: j.config,
    segments: j.segments,
    totalClips: j.total_clips,
    completedClips: j.completed_clips,
    currentClip: j.current_clip,
    progress: j.progress,
    etaSec: j.eta_sec,
    error: j.error,
    attempts: j.attempts,
    cancelRequested: j.cancel_requested,
    startedAt: j.started_at,
    finishedAt: j.finished_at,
    createdAt: j.created_at,
  };
}
export type JobPublic = ReturnType<typeof jobPublic>;

export async function clipPublic(c: ClipRow, projectName: string) {
  const name = `${slugify(projectName)}-clip-${String(c.idx).padStart(3, '0')}.${c.format}`;
  return {
    id: c.id,
    jobId: c.job_id,
    projectId: c.project_id,
    idx: c.idx,
    start: c.start_sec,
    end: c.end_sec,
    duration: c.duration_sec,
    sizeBytes: c.size_bytes,
    format: c.format,
    width: c.width,
    height: c.height,
    method: c.method,
    saved: c.saved,
    shared: !!c.share_token,
    shareToken: c.share_token,
    fileName: name,
    thumbUrl: await thumbUrl(c.thumb_key),
    playUrl: await storage().signedUrl(c.storage_key, { expiresIn: 6 * 3600 }),
    downloadUrl: await storage().signedUrl(c.storage_key, { expiresIn: 6 * 3600, downloadName: name }),
  };
}
export type ClipPublic = Awaited<ReturnType<typeof clipPublic>>;

export async function projectDetail(userId: string, projectId: string) {
  const project = await getProject(userId, projectId);
  const [video, jobs, clips] = await Promise.all([
    one<VideoRow>('select * from videos where project_id = $1 and user_id = $2 order by created_at limit 1', [projectId, userId]),
    query<JobRow>('select * from jobs where project_id = $1 and user_id = $2 order by created_at desc', [projectId, userId]),
    query<ClipRow>('select c.* from clips c join jobs j on j.id = c.job_id where c.project_id = $1 and c.user_id = $2 order by j.created_at desc, c.idx asc', [projectId, userId]),
  ]);
  return {
    project: { id: project.id, name: project.name, createdAt: project.created_at, updatedAt: project.updated_at },
    video: video ? await videoPublic(video) : null,
    jobs: jobs.map(jobPublic),
    clips: await Promise.all(clips.map((c) => clipPublic(c, project.name))),
  };
}
export type ProjectDetail = Awaited<ReturnType<typeof projectDetail>>;

export async function listProjects(userId: string, opts: { limit?: number; search?: string } = {}) {
  const rows = await query<ProjectRow & {
    video_status: string | null; duration_sec: number | null; thumb_key: string | null; size_bytes: number | null; source_type: string | null;
    clip_count: number; job_count: number; last_job_status: string | null;
  }>(
    `select p.*, v.status as video_status, v.duration_sec, v.thumb_key, v.size_bytes, v.source_type,
            (select count(*)::int from clips c where c.project_id = p.id) as clip_count,
            (select count(*)::int from jobs j where j.project_id = p.id) as job_count,
            (select status from jobs j where j.project_id = p.id order by created_at desc limit 1) as last_job_status
       from projects p left join lateral (select * from videos v where v.project_id = p.id order by created_at limit 1) v on true
      where p.user_id = $1 and ($2::text is null or p.name ilike '%' || $2 || '%')
      order by p.updated_at desc limit $3`,
    [userId, opts.search?.trim() || null, opts.limit ?? 100],
  );
  return Promise.all(rows.map(async (r) => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
    videoStatus: r.video_status,
    duration: r.duration_sec,
    sizeBytes: r.size_bytes,
    sourceType: r.source_type,
    clipCount: r.clip_count,
    jobCount: r.job_count,
    lastJobStatus: r.last_job_status,
    thumbUrl: await thumbUrl(r.thumb_key),
  })));
}
export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];

/** Deletes a project and every stored file belonging to it. */
export async function deleteProject(userId: string, projectId: string) {
  await getProject(userId, projectId);
  const [videos, jobs, exps] = await Promise.all([
    query<{ id: string }>('select id from videos where project_id = $1 and user_id = $2', [projectId, userId]),
    query<{ id: string; status: string }>('select id, status from jobs where project_id = $1 and user_id = $2', [projectId, userId]),
    query<{ storage_key: string | null }>('select storage_key from exports where project_id = $1 and user_id = $2', [projectId, userId]),
  ]);
  // Ask running jobs to stop first.
  await query(`update jobs set cancel_requested = true where project_id = $1 and status in ('waiting','processing')`, [projectId]);
  const s = storage();
  await Promise.all([
    ...videos.map((v) => s.deletePrefix(`users/${userId}/videos/${v.id}/`)),
    ...jobs.map((j) => s.deletePrefix(`users/${userId}/jobs/${j.id}/`)),
    ...exps.filter((e) => e.storage_key).map((e) => s.delete(e.storage_key!)),
  ].map((p) => p.catch(() => {})));
  await query('delete from projects where id = $1 and user_id = $2', [projectId, userId]);
}
