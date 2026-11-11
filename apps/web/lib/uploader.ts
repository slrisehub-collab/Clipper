'use client';
// Resumable multipart uploader. Works with both storage drivers: the server hands out
// a URL per part (a signed local endpoint, or an S3 presigned URL) and the browser PUTs
// the bytes there. If the page is closed mid-upload, choosing the same file again resumes
// from the parts the server already has.
import { api, ClientError } from './client';

export interface UploadProgress { loaded: number; total: number; speed: number; resumed: boolean }
interface InitResponse { uploadId: string; videoId: string; projectId: string; partSize: number; partCount: number }
interface StatusResponse { status: string; partSize: number; partCount: number; size: number; videoId: string; parts: { partNumber: number; size: number; etag: string }[] }

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 6;

const storeKey = (f: File) => `cf-upload:${f.name}:${f.size}:${f.lastModified}`;
function readStore(f: File): { uploadId: string; projectId: string } | null {
  try { return JSON.parse(localStorage.getItem(storeKey(f)) ?? 'null'); } catch { return null; }
}
function writeStore(f: File, v: { uploadId: string; projectId: string } | null) {
  try { v ? localStorage.setItem(storeKey(f), JSON.stringify(v)) : localStorage.removeItem(storeKey(f)); } catch { /* storage blocked */ }
}

export class UploadCanceled extends Error { constructor() { super('Upload cancelled.'); } }

export class ChunkedUpload {
  private xhrs = new Set<XMLHttpRequest>();
  private canceled = false;
  private uploadId: string | null = null;
  private partLoaded = new Map<number, number>();
  private baseLoaded = 0;
  private startedAt = 0;
  private resumed = false;

  constructor(private file: File, private onProgress: (p: UploadProgress) => void) {}

  get id() { return this.uploadId; }

  async start(): Promise<{ videoId: string; projectId: string }> {
    this.startedAt = Date.now();
    let partSize: number, partCount: number, videoId: string, projectId: string;
    const done = new Map<number, string>();

    const saved = readStore(this.file);
    let status: StatusResponse | null = null;
    if (saved) {
      try { status = await api<StatusResponse>(`/api/uploads/${saved.uploadId}`); } catch { status = null; }
    }
    if (saved && status && status.status === 'active' && status.size === this.file.size) {
      this.uploadId = saved.uploadId;
      ({ partSize, partCount, videoId } = status);
      projectId = saved.projectId;
      for (const p of status.parts) {
        const expected = p.partNumber === partCount ? this.file.size - partSize * (partCount - 1) : partSize;
        if (p.size === expected) { done.set(p.partNumber, p.etag); this.baseLoaded += p.size; }
      }
      this.resumed = done.size > 0;
    } else {
      writeStore(this.file, null);
      const init = await api<InitResponse>('/api/uploads', { body: { fileName: this.file.name, size: this.file.size, mimeType: this.file.type } });
      ({ partSize, partCount, videoId, projectId, uploadId: this.uploadId } = init);
      writeStore(this.file, { uploadId: init.uploadId, projectId });
    }
    this.emit();

    const pending: number[] = [];
    for (let n = 1; n <= partCount; n++) if (!done.has(n)) pending.push(n);
    const urls = new Map<number, string>();

    const sign = async (nums: number[]) => {
      const r = await api<{ urls: Record<string, string> }>(`/api/uploads/${this.uploadId}/sign`, { body: { parts: nums } });
      for (const [k, v] of Object.entries(r.urls)) urls.set(Number(k), v);
    };

    const worker = async () => {
      while (pending.length) {
        if (this.canceled) throw new UploadCanceled();
        const n = pending.shift()!;
        if (!urls.has(n)) await sign([n, ...pending.slice(0, 19).filter((x) => !urls.has(x))]);
        const start = (n - 1) * partSize;
        const blob = this.file.slice(start, Math.min(this.file.size, start + partSize));
        let attempt = 0;
        while (true) {
          try {
            const etag = await this.putPart(n, urls.get(n)!, blob);
            done.set(n, etag);
            this.baseLoaded += blob.size;
            this.partLoaded.delete(n);
            this.emit();
            break;
          } catch (e) {
            this.partLoaded.delete(n);
            if (this.canceled) throw new UploadCanceled();
            attempt++;
            if (attempt >= MAX_ATTEMPTS) throw e;
            if (typeof navigator !== 'undefined' && !navigator.onLine) await waitOnline();
            await sleep(Math.min(15000, 1000 * 2 ** attempt));
            if ((e as ClientError).status === 403) urls.delete(n);
            if (!urls.has(n)) await sign([n]);
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, pending.length)) }, worker));
    if (this.canceled) throw new UploadCanceled();

    const parts = [...done.entries()].map(([partNumber, etag]) => ({ partNumber, etag }));
    const r = await api<{ videoId: string }>(`/api/uploads/${this.uploadId}/complete`, { body: { parts } });
    writeStore(this.file, null);
    return { videoId: r.videoId ?? videoId, projectId };
  }

  private putPart(n: number, url: string, blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.xhrs.add(xhr);
      xhr.open('PUT', url);
      xhr.upload.onprogress = (ev) => { this.partLoaded.set(n, ev.loaded); this.emit(); };
      xhr.onload = () => {
        this.xhrs.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          let etag = xhr.getResponseHeader('ETag') ?? '';
          if (!etag) { try { etag = JSON.parse(xhr.responseText).etag; } catch { /* ignore */ } }
          resolve(etag);
        } else {
          let msg = `Part ${n} failed (${xhr.status}).`;
          try { msg = JSON.parse(xhr.responseText).error ?? msg; } catch { /* ignore */ }
          reject(new ClientError(msg, xhr.status));
        }
      };
      xhr.onerror = () => { this.xhrs.delete(xhr); reject(new ClientError('Network error while uploading.', 0)); };
      xhr.onabort = () => { this.xhrs.delete(xhr); reject(new UploadCanceled()); };
      xhr.send(blob);
    });
  }

  private lastEmit = 0;
  private emit() {
    const now = Date.now();
    if (now - this.lastEmit < 120) return;
    this.lastEmit = now;
    let inflight = 0;
    for (const v of this.partLoaded.values()) inflight += v;
    const loaded = Math.min(this.file.size, this.baseLoaded + inflight);
    const secs = Math.max(0.5, (now - this.startedAt) / 1000);
    this.onProgress({ loaded, total: this.file.size, speed: loaded / secs, resumed: this.resumed });
  }

  /** Stop uploading and discard what was sent. */
  async cancel() {
    this.canceled = true;
    for (const x of this.xhrs) x.abort();
    writeStore(this.file, null);
    if (this.uploadId) await api(`/api/uploads/${this.uploadId}`, { method: 'DELETE' }).catch(() => {});
  }

  /** Stop without discarding, so choosing the same file later resumes. */
  pause() {
    this.canceled = true;
    for (const x of this.xhrs) x.abort();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitOnline = () => new Promise<void>((r) => window.addEventListener('online', () => r(), { once: true }));
