'use client';
import { useRef, useState } from 'react';
import { FileVideo, Link2, UploadCloud, X } from 'lucide-react';
import { formatBytes } from '@clipforge/core/format';
import { Alert, Button, Input, Progress, Segmented } from '../ui';
import { api } from '@/lib/client';
import { ChunkedUpload, UploadCanceled, type UploadProgress } from '@/lib/uploader';
import { cn } from '@/lib/cn';

const ACCEPT = '.mp4,.m4v,.mov,.webm,.mkv,.avi,.mpeg,.mpg,.3gp,.ts,video/*';
const EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|ts)$/i;

export interface PlanLimits { maxUploadBytes: number; storageFree: number; maxDurationSec: number; planName: string }

export function SourcePicker({ limits, onReady }: { limits: PlanLimits; onReady: (videoId: string) => void }) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  return (
    <div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upload', label: <span className="flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5" />Upload a file</span> },
          { value: 'url', label: <span className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Paste a link</span> },
        ]}
      />
      <div className="mt-5">{tab === 'upload' ? <UploadBox limits={limits} onReady={onReady} /> : <UrlBox onReady={onReady} />}</div>
    </div>
  );
}

function UploadBox({ limits, onReady }: { limits: PlanLimits; onReady: (videoId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<ChunkedUpload | null>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  async function begin(f: File) {
    setError(null);
    if (!EXT.test(f.name)) return setError(`"${f.name}" isn't a supported video file. Use MP4, MOV, WebM or MKV.`);
    if (f.size > limits.maxUploadBytes) return setError(`This file is ${formatBytes(f.size)}. Your ${limits.planName} plan allows uploads up to ${formatBytes(limits.maxUploadBytes)}.`);
    if (f.size > limits.storageFree) return setError(`Not enough storage. This file needs ${formatBytes(f.size)} and you have ${formatBytes(limits.storageFree)} free.`);
    setFile(f);
    setProgress({ loaded: 0, total: f.size, speed: 0, resumed: false });
    const up = new ChunkedUpload(f, (p) => { setProgress(p); if (p.loaded >= p.total) setFinishing(true); });
    uploadRef.current = up;
    try {
      const { videoId } = await up.start();
      onReady(videoId);
    } catch (e) {
      if (e instanceof UploadCanceled) return;
      setError(`${(e as Error).message} Choose the same file again to resume from where it stopped.`);
      setFinishing(false);
      setProgress(null);
      setFile(null);
    }
  }

  async function cancel() {
    await uploadRef.current?.cancel();
    uploadRef.current = null;
    setFile(null);
    setProgress(null);
    setFinishing(false);
  }

  if (file && progress) {
    const pct = progress.total ? progress.loaded / progress.total : 0;
    const eta = progress.speed > 0 ? Math.round((progress.total - progress.loaded) / progress.speed) : null;
    return (
      <div className="rounded-xl border border-white/[0.08] bg-ink-900/60 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-volt-400/10 text-volt-300"><FileVideo className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-mist-50">{file.name}</div>
            <div className="mt-0.5 text-[12px] tabular-nums text-mist-400">
              {finishing ? 'Upload complete. Finalising…' : `${formatBytes(progress.loaded)} of ${formatBytes(progress.total)} · ${formatBytes(progress.speed)}/s${eta !== null && eta > 0 ? ` · about ${eta > 90 ? `${Math.round(eta / 60)} min` : `${eta}s`} left` : ''}`}
            </div>
            {progress.resumed && !finishing && <div className="mt-1 text-[12px] text-volt-300">Resuming your earlier upload of this file.</div>}
          </div>
          {!finishing && <Button variant="ghost" size="sm" onClick={cancel}><X className="h-3.5 w-3.5" />Cancel</Button>}
        </div>
        <Progress value={pct} className="mt-4" />
        <div className="mt-1.5 text-right text-[12px] tabular-nums text-mist-400">{Math.floor(pct * 100)}%</div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void begin(f); }}
        className={cn(
          'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          drag ? 'border-volt-400 bg-volt-400/[0.06]' : 'border-ink-600 bg-ink-900/40 hover:border-mist-400/50 hover:bg-white/[0.02]',
        )}
      >
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-volt-400/10 text-volt-300"><UploadCloud className="h-6 w-6" /></div>
        <div className="mt-4 text-[15px] font-medium text-mist-50">Drag a video here, or <span className="text-volt-300">browse your files</span></div>
        <div className="mt-1 text-[13px] text-mist-400">MP4, MOV, WebM or MKV · up to {formatBytes(limits.maxUploadBytes)}</div>
      </button>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void begin(f); }} />
      {error && <Alert className="mt-4">{error}</Alert>}
    </div>
  );
}

function UrlBox({ onReady }: { onReady: (videoId: string) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ videoId: string }>('/api/imports', { body: { url: url.trim() } });
      onReady(r.videoId);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste your video link here..." className="h-12 pl-9 text-[15px]" inputMode="url" autoComplete="off" spellCheck={false} />
        </div>
        <Button type="submit" size="lg" loading={busy} disabled={!url.trim()}>Fetch video</Button>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-mist-400">
        Paste a direct link to a video file, such as a link ending in .mp4 from your own website or cloud storage. Links to YouTube, TikTok, Instagram, Facebook, X and streaming services can&apos;t be imported; download your own video from the platform and upload the file instead.
      </p>
      {error && <Alert className="mt-4">{error}</Alert>}
    </form>
  );
}
