// Pure clip planning. Shared by the browser (timeline preview) and the worker
// (actual cutting), so what the user previews is exactly what gets produced.

export type ClipMethod = 'duration' | 'count' | 'interval' | 'custom';
export type OutputFormat = 'mp4' | 'webm';
export type Quality = 'original' | '1080' | '720' | '480';
export type Aspect = 'original' | '16:9' | '9:16' | '1:1';
export type AspectMode = 'crop' | 'fit';
export type CutMode = 'precise' | 'fast';

export interface Segment {
  start: number; // seconds
  end: number;   // seconds
}

export interface ClipConfig {
  method: ClipMethod;
  /** seconds per clip, for 'duration' and 'interval' */
  segmentSeconds?: number;
  /** number of clips, for 'count' */
  count?: number;
  /** explicit ranges, for 'custom' */
  ranges?: Segment[];
  format: OutputFormat;
  quality: Quality;
  aspect: Aspect;
  aspectMode: AspectMode;
  keepAudio: boolean;
  cutMode: CutMode;
}

export const DURATION_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120, 180, 300, 600];
export const INTERVAL_PRESETS = [15, 30, 60, 120, 300];

export const MIN_SEGMENT_SECONDS = 1;
/** Remainders shorter than this are floating-point noise, not a real clip. */
const EPSILON = 0.05;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export class PlanError extends Error {}

/** Split [0, duration) into consecutive segments of `len` seconds. The last one holds the remainder. */
export function splitByLength(duration: number, len: number): Segment[] {
  if (!(duration > 0)) throw new PlanError('The video duration is unknown.');
  if (!(len >= MIN_SEGMENT_SECONDS)) throw new PlanError(`Clip length must be at least ${MIN_SEGMENT_SECONDS} second.`);
  const out: Segment[] = [];
  let i = 0;
  while (true) {
    const start = round3(i * len);
    if (duration - start <= EPSILON) break;
    const end = round3(Math.min(duration, (i + 1) * len));
    out.push({ start, end });
    i++;
  }
  return out;
}

export function splitByCount(duration: number, count: number): Segment[] {
  if (!(duration > 0)) throw new PlanError('The video duration is unknown.');
  if (!Number.isInteger(count) || count < 1) throw new PlanError('Number of clips must be a whole number of 1 or more.');
  const len = duration / count;
  if (len < MIN_SEGMENT_SECONDS) throw new PlanError(`That would make clips shorter than ${MIN_SEGMENT_SECONDS} second.`);
  const out: Segment[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ start: round3(i * len), end: i === count - 1 ? round3(duration) : round3((i + 1) * len) });
  }
  return out;
}

export function validateRanges(duration: number, ranges: Segment[]): Segment[] {
  if (!ranges.length) throw new PlanError('Add at least one clip range.');
  return ranges.map((r, i) => {
    const n = i + 1;
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) throw new PlanError(`Clip ${n}: enter valid start and end times.`);
    if (r.start < 0) throw new PlanError(`Clip ${n}: start cannot be negative.`);
    if (r.end <= r.start) throw new PlanError(`Clip ${n}: end must be after start.`);
    if (r.start >= duration) throw new PlanError(`Clip ${n}: starts after the video ends (${formatTimestamp(duration)}).`);
    if (r.end - r.start < MIN_SEGMENT_SECONDS) throw new PlanError(`Clip ${n}: must be at least ${MIN_SEGMENT_SECONDS} second long.`);
    return { start: round3(r.start), end: round3(Math.min(r.end, duration)) };
  });
}

export function planSegments(config: Pick<ClipConfig, 'method' | 'segmentSeconds' | 'count' | 'ranges'>, duration: number): Segment[] {
  switch (config.method) {
    case 'duration':
    case 'interval':
      return splitByLength(duration, Number(config.segmentSeconds));
    case 'count':
      return splitByCount(duration, Number(config.count));
    case 'custom':
      return validateRanges(duration, config.ranges ?? []);
    default:
      throw new PlanError('Unknown clipping method.');
  }
}

/** "1:02:03.5", "02:03", "123", "1m30s", "90s" → seconds. Returns NaN when unparseable. */
export function parseTimestamp(input: string): number {
  const s = input.trim().toLowerCase();
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const hms = s.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3) return NaN;
  if (!parts.every((p, i) => (i === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p))) return NaN;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return NaN;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatTimestamp(sec: number, withMs = false): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const totalMs = Math.round(sec * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return withMs && ms ? `${base}.${String(Math.floor(ms / 100))}` : base;
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '–';
  if (sec < 60) return `${Math.round(sec * 10) / 10}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ---------- output geometry ----------

const QUALITY_SHORT_SIDE: Record<Exclude<Quality, 'original'>, number> = { '1080': 1080, '720': 720, '480': 480 };
const ASPECT_RATIO: Record<Exclude<Aspect, 'original'>, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

/** Quality options that can be produced without upscaling. Based on the short side so vertical video works too. */
export function availableQualities(width?: number | null, height?: number | null): Quality[] {
  const short = width && height ? Math.min(width, height) : 0;
  const q: Quality[] = ['original'];
  for (const k of ['1080', '720', '480'] as const) if (short >= QUALITY_SHORT_SIDE[k]) q.push(k);
  return q;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output frame size for given source dims and settings. */
export function outputSize(srcW: number, srcH: number, quality: Quality, aspect: Aspect): { width: number; height: number } {
  const targetRatio = aspect === 'original' ? srcW / srcH : ASPECT_RATIO[aspect];
  // Short side of the output: either the requested quality or the source's own short side
  // (when changing aspect at original quality, keep the source short side so we don't upscale).
  const srcShort = Math.min(srcW, srcH);
  const short = quality === 'original' ? srcShort : Math.min(QUALITY_SHORT_SIDE[quality], srcShort);
  if (aspect === 'original' && quality === 'original') return { width: even(srcW), height: even(srcH) };
  if (targetRatio >= 1) return { width: even(short * targetRatio), height: even(short) };
  return { width: even(short), height: even(short / targetRatio) };
}

/** Whether the settings require a re-encode regardless of cut accuracy. */
export function needsTransform(
  c: Pick<ClipConfig, 'quality' | 'aspect' | 'format' | 'keepAudio'>,
  srcVideoCodec?: string | null,
  srcAudioCodec?: string | null,
): boolean {
  if (c.quality !== 'original' || c.aspect !== 'original') return true;
  const v = (srcVideoCodec ?? '').toLowerCase();
  const a = (srcAudioCodec ?? '').toLowerCase();
  const videoOk = c.format === 'mp4' ? ['h264', 'hevc'].includes(v) : ['vp8', 'vp9', 'av1'].includes(v);
  const audioOk = !c.keepAudio || !a || (c.format === 'mp4' ? ['aac', 'mp3'].includes(a) : ['opus', 'vorbis'].includes(a));
  return !(videoOk && audioOk);
}
