import type { ClipConfig, Segment } from './plan';

export type JobStatus = 'waiting' | 'processing' | 'completed' | 'failed' | 'canceled';
export type VideoStatus = 'pending' | 'uploading' | 'importing' | 'probing' | 'ready' | 'failed';

export interface PlanRow {
  id: string;
  name: string;
  price_cents_monthly: number;
  max_source_duration_sec: number;
  max_upload_bytes: number;
  monthly_processing_minutes: number;
  storage_bytes: number;
  max_clips_per_job: number;
  queue_priority: number;
  allow_batch: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  plan_id: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
}

export interface VideoRow {
  id: string;
  user_id: string;
  project_id: string;
  source_type: 'upload' | 'url';
  source_url: string | null;
  original_name: string | null;
  title: string | null;
  status: VideoStatus;
  error: string | null;
  storage_key: string | null;
  thumb_key: string | null;
  size_bytes: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  has_audio: boolean | null;
  container: string | null;
  created_at: string;
}

export interface JobRow {
  id: string;
  user_id: string;
  project_id: string;
  video_id: string;
  status: JobStatus;
  config: ClipConfig;
  segments: Segment[];
  total_clips: number;
  completed_clips: number;
  current_clip: number | null;
  progress: number;
  eta_sec: number | null;
  error: string | null;
  attempts: number;
  cancel_requested: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ClipRow {
  id: string;
  user_id: string;
  project_id: string;
  job_id: string;
  idx: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  storage_key: string;
  thumb_key: string | null;
  size_bytes: number;
  format: string;
  width: number | null;
  height: number | null;
  method: 'copy' | 'encode';
  saved: boolean;
  share_token: string | null;
  created_at: string;
}
