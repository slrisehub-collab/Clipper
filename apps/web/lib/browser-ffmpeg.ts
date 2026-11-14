'use client';
// FFmpeg compiled to WebAssembly, running in a Web Worker inside the visitor's browser.
// Used by the no-server "browser mode": the video file never leaves the device.
import { FFmpeg, type FFFSType } from '@ffmpeg/ffmpeg';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let logListener: ((line: string) => void) | null = null;

const abs = (p: string) => new URL(p, window.location.origin).href;

/** Loads the engine once (about 32 MB, cached by the browser afterwards). */
export function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg();
      ff.on('log', ({ message }) => logListener?.(message));
      await ff.load({
        classWorkerURL: abs('/ffmpeg/worker.js'),
        coreURL: abs('/ffmpeg/ffmpeg-core.js'),
        wasmURL: abs('/ffmpeg/ffmpeg-core.wasm'),
      });
      instance = ff;
      return ff;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** Hard-stops whatever is running. The next call to getFFmpeg() starts a fresh engine. */
export function terminateFFmpeg() {
  try { instance?.terminate(); } catch { /* already gone */ }
  instance = null;
  loading = null;
}

async function withLogs<T>(fn: () => Promise<T>, onLine: (line: string) => void): Promise<T> {
  logListener = onLine;
  try { return await fn(); } finally { logListener = null; }
}

const MOUNT = '/input';

/** Makes the File readable by FFmpeg without copying it into memory. Returns its path. */
export async function mountFile(file: File): Promise<string> {
  const ff = await getFFmpeg();
  try { await ff.unmount(MOUNT); } catch { /* not mounted */ }
  try { await ff.createDir(MOUNT); } catch { /* exists */ }
  // WORKERFS reads the File lazily, so even multi-gigabyte videos are not copied into memory.
  await ff.mount('WORKERFS' as FFFSType, { files: [file] }, MOUNT);
  return `${MOUNT}/${file.name}`;
}

export interface BrowserProbe {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  fps: number | null;
}

/** Reads duration, size and codecs from FFmpeg's own description of the input. */
export async function probeFile(path: string): Promise<BrowserProbe> {
  const ff = await getFFmpeg();
  const lines: string[] = [];
  await withLogs(() => ff.exec(['-hide_banner', '-i', path]), (l) => lines.push(l));
  const text = lines.join('\n');
  const d = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = text.match(/Stream #\d+:\d+[^:]*: Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})/);
  const a = text.match(/Stream #\d+:\d+[^:]*: Audio: (\w+)/);
  const fps = text.match(/, (\d+(?:\.\d+)?) fps/);
  if (!v) throw new Error('No video track was found. The file may be damaged or in a format the browser engine cannot read.');
  if (!d) throw new Error('The video duration could not be read.');
  let width = Number(v[2]);
  let height = Number(v[3]);
  const rot = text.match(/rotation of (-?\d+(?:\.\d+)?) degrees/);
  if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) [width, height] = [height, width];
  return {
    duration: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]),
    width, height,
    videoCodec: v[1],
    audioCodec: a?.[1] ?? null,
    hasAudio: !!a,
    fps: fps ? Number(fps[1]) : null,
  };
}

/** Runs one FFmpeg command, reporting progress as seconds of output written. */
export async function run(args: string[], onTime?: (sec: number) => void): Promise<void> {
  const ff = await getFFmpeg();
  const tail: string[] = [];
  const code = await withLogs(() => ff.exec(args), (l) => {
    tail.push(l);
    if (tail.length > 20) tail.shift();
    const t = l.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (t && onTime) onTime(Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]));
  });
  if (code !== 0) {
    const reason = tail.filter((l) => /error|invalid|failed/i.test(l)).slice(-2).join(' ');
    throw new Error(`FFmpeg could not process this clip${reason ? `: ${reason}` : '.'}`);
  }
}

export async function readAndDelete(path: string): Promise<Uint8Array> {
  const ff = await getFFmpeg();
  const data = (await ff.readFile(path)) as Uint8Array;
  await ff.deleteFile(path).catch(() => {});
  return data;
}
