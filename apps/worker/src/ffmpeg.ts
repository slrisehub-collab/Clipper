import { spawn, type ChildProcess } from 'node:child_process';
import { config } from '@clipforge/core/config';

export interface ProbeResult {
  duration: number;
  sizeBytes: number | null;
  formatName: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  rotation: number;
  title: string | null;
}

export class FfmpegError extends Error {
  constructor(message: string, public stderr = '') { super(message); }
}

function run(cmd: string, args: string[], opts: { onStdout?: (s: string) => void; onSpawn?: (c: ChildProcess) => void; timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    opts.onSpawn?.(child);
    let stdout = '';
    let stderr = '';
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : null;
    child.stdout.on('data', (d) => {
      const s = d.toString();
      if (opts.onStdout) opts.onStdout(s); else stdout += s;
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-8000); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(new FfmpegError(`Could not start ${cmd}: ${e.message}`)); });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new FfmpegError(signal ? `${cmd} was stopped (${signal})` : `${cmd} exited with code ${code}`, stderr));
    });
  });
}

const num = (v: unknown) => (v === undefined || v === null || v === '' || v === 'N/A' ? null : Number(v));

function parseRate(r?: string): number | null {
  if (!r || r === '0/0') return null;
  const [a, b] = r.split('/').map(Number);
  return b ? Math.round((a / b) * 1000) / 1000 : a || null;
}

export async function probe(file: string): Promise<ProbeResult> {
  let out: string;
  try {
    ({ stdout: out } = await run(config.ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 120_000 }));
  } catch (e) {
    throw new FfmpegError('This file could not be read as a video. It may be damaged or in an unsupported format.', (e as FfmpegError).stderr);
  }
  const j = JSON.parse(out);
  const streams: any[] = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new FfmpegError('No video track was found in this file.');
  const duration = num(j.format?.duration) ?? num(v.duration);
  if (!duration || duration <= 0) throw new FfmpegError('The video duration could not be determined.');
  let rotation = 0;
  const sd = (v.side_data_list ?? []).find((x: any) => x.rotation !== undefined);
  if (sd) rotation = Number(sd.rotation);
  else if (v.tags?.rotate) rotation = Number(v.tags.rotate);
  let width = num(v.width);
  let height = num(v.height);
  // FFmpeg auto-rotates on decode, so report display dimensions.
  if (Math.abs(rotation) % 180 === 90 && width && height) [width, height] = [height, width];
  return {
    duration,
    sizeBytes: num(j.format?.size),
    formatName: j.format?.format_name ?? '',
    width, height,
    fps: parseRate(v.avg_frame_rate) ?? parseRate(v.r_frame_rate),
    videoCodec: v.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    hasAudio: !!a,
    rotation,
    title: j.format?.tags?.title ?? null,
  };
}

/** Keyframe timestamps (seconds) of the first video stream, read from packet flags (fast, no decode). */
export async function keyframes(file: string): Promise<number[]> {
  const { stdout } = await run(config.ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file], { timeoutMs: 10 * 60_000 });
  const out: number[] = [];
  for (const line of stdout.split('\n')) {
    const [t, flags] = line.split(',');
    if (flags?.includes('K')) { const n = Number(t); if (Number.isFinite(n)) out.push(n); }
  }
  return out.sort((a, b) => a - b);
}

export async function thumbnail(input: string, atSec: number, output: string, width = 480) {
  await run(config.ffmpegPath, ['-hide_banner', '-nostdin', '-y', '-ss', atSec.toFixed(3), '-i', input, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', output], { timeoutMs: 60_000 });
}

/** Run ffmpeg with -progress output; calls onTime with seconds of output written. */
export function ffmpegWithProgress(args: string[], onTime: (sec: number) => void, onSpawn?: (c: ChildProcess) => void) {
  let buf = '';
  const threads = config.ffmpegThreads ? ['-threads', String(config.ffmpegThreads)] : [];
  return run(config.ffmpegPath, ['-hide_banner', '-nostdin', '-y', ...args.slice(0, -1), ...threads, '-progress', 'pipe:1', '-nostats', args[args.length - 1]], {
    onSpawn,
    onStdout: (s) => {
      buf += s;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) {
        const m = l.match(/^out_time_(?:us|ms)=(\d+)/);
        if (m) onTime(Number(m[1]) / 1e6);
      }
    },
  });
}
