// Builds FFmpeg arguments for a single clip. Pure, so it can be unit tested.
import { outputSize, type ClipConfig, type Segment } from './plan';

export interface SourceInfo {
  width: number;
  height: number;
  hasAudio: boolean;
}

export function videoFilter(cfg: Pick<ClipConfig, 'quality' | 'aspect' | 'aspectMode'>, src: SourceInfo): string {
  const { width: W, height: H } = outputSize(src.width, src.height, cfg.quality, cfg.aspect);
  if (cfg.aspect === 'original') {
    // Same shape; scale (or just make dimensions even, which x264/vp9 with yuv420p require).
    return `scale=${W}:${H}:flags=lanczos,setsar=1`;
  }
  if (cfg.aspectMode === 'crop') {
    // Fill the frame and trim the overflow from the centre. No stretching.
    return `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1`;
  }
  // Fit: whole picture visible, padded with black bars.
  return `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}

export function buildClipArgs(opts: {
  input: string;
  output: string;
  segment: Segment;
  cfg: ClipConfig;
  src: SourceInfo;
  copy: boolean;
  /** x264 speed preset; the browser build uses 'ultrafast' because it is single-threaded */
  preset?: string;
}): string[] {
  const { input, output, segment, cfg, src, copy, preset = 'veryfast' } = opts;
  const dur = Math.max(0.001, segment.end - segment.start);
  const args = ['-ss', segment.start.toFixed(3), '-i', input, '-t', dur.toFixed(3), '-map', '0:v:0'];
  const audio = cfg.keepAudio && src.hasAudio;
  if (audio) args.push('-map', '0:a:0?');
  else args.push('-an');
  args.push('-map_metadata', '-1', '-sn', '-dn');

  if (copy) {
    args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
  } else {
    args.push('-vf', videoFilter(cfg, src));
    if (cfg.format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', preset, '-crf', cfg.quality === 'original' ? '18' : '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high');
      if (audio) args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
    } else {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', cfg.quality === 'original' ? '30' : '33', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-pix_fmt', 'yuv420p');
      if (audio) args.push('-c:a', 'libopus', '-b:a', '128k', '-ac', '2');
    }
  }
  if (cfg.format === 'mp4') args.push('-movflags', '+faststart');
  args.push('-f', cfg.format === 'mp4' ? 'mp4' : 'webm', output);
  return args;
}

/** Index of the keyframe closest to t, or -1. */
export function nearestKeyframe(kfs: number[], t: number): number {
  if (!kfs.length) return -1;
  let lo = 0, hi = kfs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid] < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(kfs[lo - 1] - t) <= Math.abs(kfs[lo] - t)) return lo - 1;
  return lo;
}

/** For fast mode: move each internal boundary to the nearest keyframe so stream-copied clips stay contiguous. */
export function snapToKeyframes(segments: Segment[], kfs: number[], duration: number): Segment[] {
  if (!kfs.length) return segments;
  const snap = (t: number) => {
    if (t <= 0) return 0;
    if (t >= duration) return duration;
    return kfs[nearestKeyframe(kfs, t)];
  };
  const out: Segment[] = [];
  for (const s of segments) {
    const start = snap(s.start);
    const end = s.end >= duration - 0.001 ? duration : snap(s.end);
    if (end - start >= 0.1) out.push({ start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000 });
  }
  return out;
}

/** In precise mode a segment can be stream-copied only if it starts on (or within one frame of) a keyframe. */
export function startsOnKeyframe(kfs: number[], start: number, fps: number | null): boolean {
  if (start <= 0.001) return true;
  const i = nearestKeyframe(kfs, start);
  if (i < 0) return false;
  const tol = fps && fps > 0 ? 0.5 / fps : 0.02;
  return Math.abs(kfs[i] - start) <= tol;
}
