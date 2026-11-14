'use client';
// Browser mode: the whole clipping workflow runs on the visitor's device with FFmpeg
// compiled to WebAssembly. No account, no upload, no server.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckSquare, Clock, Download, FileVideo, Film, Hash, Link2, Lock, Play, Plus, Scissors, Square, Timer, Trash2, UploadCloud, X, Zap } from 'lucide-react';
import { downloadZip } from 'client-zip';
import {
  availableQualities, DURATION_PRESETS, INTERVAL_PRESETS, formatDuration, formatTimestamp, needsTransform, parseTimestamp, planSegments,
  type Aspect, type AspectMode, type ClipConfig, type ClipMethod, type CutMode, type OutputFormat, type Quality, type Segment,
} from '@clipforge/core/plan';
import { buildClipArgs } from '@clipforge/core/encode';
import { formatBytes, slugify } from '@clipforge/core/format';
import { Alert, Badge, Button, Card, Dialog, Input, Label, Progress, Segmented, Select, Stat } from './ui';
import { DurationPicker, Field, StepTitle, TimeField } from './workspace/workspace';
import { SegmentList, Timeline } from './workspace/timeline';
import { useToast } from './toast';
import { getFFmpeg, mountFile, probeFile, readAndDelete, run, terminateFFmpeg, type BrowserProbe } from '@/lib/browser-ffmpeg';
import { cn } from '@/lib/cn';

type Unit = 's' | 'min';
interface RangeInput { start: string; end: string }
interface Clip { idx: number; start: number; end: number; blob: Blob; url: string; thumb: string | null; name: string; method: 'copy' | 'encode' }

const METHODS: { value: ClipMethod; label: string; icon: typeof Clock; hint: string }[] = [
  { value: 'duration', label: 'Equal duration', icon: Timer, hint: 'Every clip is the same length' },
  { value: 'custom', label: 'Custom times', icon: Scissors, hint: 'Pick exact start and end points' },
  { value: 'count', label: 'Number of clips', icon: Hash, hint: 'Divide into N equal clips' },
  { value: 'interval', label: 'Regular intervals', icon: Clock, hint: 'Cut every N seconds or minutes' },
];

const EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|ts)$/i;

export function BrowserClipper({ serverAvailable }: { serverAvailable: boolean }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [srcPath, setSrcPath] = useState<string | null>(null);
  const [info, setInfo] = useState<BrowserProbe | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<'pick' | 'loading' | 'configure' | 'processing' | 'done'>('pick');
  const [engineMsg, setEngineMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  const [method, setMethod] = useState<ClipMethod>('duration');
  const [durValue, setDurValue] = useState('60');
  const [durUnit, setDurUnit] = useState<Unit>('s');
  const [count, setCount] = useState('10');
  const [intValue, setIntValue] = useState('60');
  const [intUnit, setIntUnit] = useState<Unit>('s');
  const [ranges, setRanges] = useState<RangeInput[]>([{ start: '00:00', end: '01:30' }]);
  const [format, setFormat] = useState<OutputFormat>('mp4');
  const [quality, setQuality] = useState<Quality>('original');
  const [aspect, setAspect] = useState<Aspect>('original');
  const [aspectMode, setAspectMode] = useState<AspectMode>('crop');
  const [keepAudio, setKeepAudio] = useState(true);
  const [cutMode, setCutMode] = useState<CutMode>('fast');

  const [clips, setClips] = useState<Clip[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: 0, frac: 0, eta: null as number | null });
  const cancelRef = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<Clip | null>(null);
  const [zipping, setZipping] = useState(false);

  const config: ClipConfig = useMemo(() => {
    const toSec = (v: string, u: Unit) => Number(v) * (u === 'min' ? 60 : 1);
    return {
      method,
      segmentSeconds: method === 'duration' ? toSec(durValue, durUnit) : method === 'interval' ? toSec(intValue, intUnit) : undefined,
      count: method === 'count' ? Number(count) : undefined,
      ranges: method === 'custom' ? ranges.map((r) => ({ start: parseTimestamp(r.start), end: parseTimestamp(r.end) })) : undefined,
      format, quality, aspect, aspectMode, keepAudio, cutMode,
    };
  }, [method, durValue, durUnit, intValue, intUnit, count, ranges, format, quality, aspect, aspectMode, keepAudio, cutMode]);

  const plan = useMemo<{ segments: Segment[]; error: string | null }>(() => {
    if (!info) return { segments: [], error: null };
    try { return { segments: planSegments(config, info.duration), error: null }; } catch (e) { return { segments: [], error: (e as Error).message }; }
  }, [config, info]);

  const qualities = availableQualities(info?.width, info?.height);
  const canCopy = !!info && !needsTransform(config, info.videoCodec, info.audioCodec);
  useEffect(() => { if (!canCopy && cutMode === 'fast') setCutMode('precise'); }, [canCopy, cutMode]);
  useEffect(() => { if (info && !qualities.includes(quality)) setQuality('original'); }, [info, qualities, quality]);

  // Clips only exist in this tab; warn before the user navigates away and loses them.
  useEffect(() => {
    if (!clips.length && stage !== 'processing') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [clips.length, stage]);

  async function openFile(f: File) {
    setError(null);
    if (!EXT.test(f.name)) return setError(`"${f.name}" isn't a supported video file. Use MP4, MOV, WebM or MKV.`);
    clearClips();
    setFile(f);
    setStage('loading');
    try {
      setEngineMsg('Loading the video engine (about 32 MB the first time, then cached)…');
      await getFFmpeg();
      setEngineMsg('Reading video details…');
      const p = await mountFile(f);
      const meta = await probeFile(p);
      setSrcPath(p);
      setInfo(meta);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(f));
      setCutMode(!needsTransform({ ...config, quality: 'original', aspect: 'original' }, meta.videoCodec, meta.audioCodec) ? 'fast' : 'precise');
      setStage('configure');
    } catch (e) {
      console.error('Could not open video', e);
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
      setError(msg || 'This file could not be opened. Try a different browser, or check the file plays on your computer.');
      setStage('pick');
      setFile(null);
    }
  }

  async function openUrl(url: string) {
    setError(null);
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      return setError("That link can't be read from the browser. The website hosting the video doesn't allow it (CORS), or the link is wrong. Download the video and choose the file instead.");
    }
    if (!res.ok) return setError(`The link returned an error (${res.status}).`);
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return setError('That link opens a web page, not a video file. YouTube, TikTok, Instagram and similar sites cannot be imported; download your own video and choose the file instead.');
    const blob = await res.blob();
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'video.mp4');
    await openFile(new File([blob], EXT.test(name) ? name : `${name}.mp4`, { type: blob.type }));
  }

  function clearClips() {
    for (const c of clips) { URL.revokeObjectURL(c.url); if (c.thumb) URL.revokeObjectURL(c.thumb); }
    setClips([]);
    setSelected(new Set());
  }

  async function generate() {
    if (!info || !srcPath || !file || plan.error || !plan.segments.length) return;
    clearClips();
    cancelRef.current = false;
    setStage('processing');
    const segs = plan.segments;
    const total = segs.reduce((a, s) => a + s.end - s.start, 0);
    const base = slugify(file.name.replace(/\.[^.]+$/, ''));
    const copy = cfgCopy();
    const t0 = Date.now();
    let doneSec = 0;
    setProgress({ done: 0, total: segs.length, current: 1, frac: 0, eta: null });
    try {
      for (let i = 0; i < segs.length; i++) {
        if (cancelRef.current) break;
        const s = segs[i];
        const len = s.end - s.start;
        const out = `/clip-${i + 1}.${format}`;
        await run(
          buildClipArgs({ input: srcPath, output: out, segment: s, cfg: config, src: { width: info.width, height: info.height, hasAudio: info.hasAudio }, copy, preset: 'ultrafast' }),
          (t) => {
            const processed = doneSec + Math.min(len, t);
            const rate = processed / Math.max(0.5, (Date.now() - t0) / 1000);
            setProgress({ done: i, total: segs.length, current: i + 1, frac: processed / total, eta: rate > 0 && processed > 2 ? Math.round((total - processed) / rate) : null });
          },
        );
        const data = await readAndDelete(out);
        const blob = new Blob([data as BlobPart], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
        let thumb: string | null = null;
        try {
          await run(['-ss', (s.start + Math.min(1, len / 2)).toFixed(2), '-i', srcPath, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', '/thumb.jpg']);
          thumb = URL.createObjectURL(new Blob([(await readAndDelete('/thumb.jpg')) as BlobPart], { type: 'image/jpeg' }));
        } catch { /* thumbnails are optional */ }
        const clip: Clip = { idx: i + 1, start: s.start, end: s.end, blob, url: URL.createObjectURL(blob), thumb, name: `${base}-clip-${String(i + 1).padStart(3, '0')}.${format}`, method: copy ? 'copy' : 'encode' };
        setClips((c) => [...c, clip]);
        doneSec += len;
        setProgress((p) => ({ ...p, done: i + 1, frac: doneSec / total }));
      }
      setStage('done');
      if (cancelRef.current) toast('Stopped. The clips already made are kept below.', 'info');
      else toast(`All ${segs.length} clips are ready.`, 'success');
    } catch (e) {
      if (cancelRef.current) { setStage('done'); return; }
      setError((e as Error).message);
      setStage('done');
    }
  }

  function cfgCopy() { return canCopy && cutMode === 'fast'; }

  async function cancel() {
    cancelRef.current = true;
    terminateFFmpeg(); // stops the clip being encoded right now
    // The engine restarts on demand; re-mount the file so the user can run again.
    if (file) {
      try { const p = await mountFile(file); setSrcPath(p); } catch { /* user can re-pick */ }
    }
  }

  async function zip(which: Clip[]) {
    if (!which.length) return;
    setZipping(true);
    try {
      const blob = await downloadZip(which.map((c) => ({ name: c.name, input: c.blob, lastModified: new Date() }))).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slugify(file?.name.replace(/\.[^.]+$/, '') ?? 'clips')}-clips.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e) {
      toast(`The ZIP couldn't be created: ${(e as Error).message}. Download the clips one by one instead.`, 'error');
    } finally {
      setZipping(false);
    }
  }

  function removeClip(c: Clip) {
    URL.revokeObjectURL(c.url);
    if (c.thumb) URL.revokeObjectURL(c.thumb);
    setClips((cs) => cs.filter((x) => x !== c));
  }

  function reset() {
    if (stage === 'processing') return;
    clearClips();
    setFile(null); setInfo(null); setSrcPath(null); setStage('pick'); setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  // ------------------------------------------------------------------ pick
  if (stage === 'pick' || stage === 'loading') {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-5 sm:p-8">
          <StepTitle n={1} title="Choose your video" description="It's processed right here in your browser. Nothing is uploaded." />
          <div className="mt-6">
            {stage === 'loading' ? (
              <div className="rounded-xl border border-white/[0.08] bg-ink-900/60 p-5">
                <div className="flex items-center gap-3">
                  <FileVideo className="h-5 w-5 text-volt-300" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-mist-50">{file?.name}</div><div className="text-[12px] text-mist-400">{engineMsg}</div></div>
                </div>
                <Progress value={0} indeterminate className="mt-4" />
              </div>
            ) : (
              <PickBox onFile={openFile} onUrl={openUrl} />
            )}
            {error && <Alert className="mt-4">{error}</Alert>}
          </div>
          <div className="mt-6 grid gap-3 border-t border-white/[0.06] pt-5 text-[13px] text-mist-400 sm:grid-cols-3">
            <div className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-volt-400" />Your video stays on your device.</div>
            <div className="flex gap-2"><Zap className="mt-0.5 h-4 w-4 shrink-0 text-volt-400" />Fast mode splits an hour of video in a few minutes.</div>
            <div className="flex gap-2"><Download className="mt-0.5 h-4 w-4 shrink-0 text-volt-400" />Download clips one by one or as a ZIP.</div>
          </div>
        </Card>
        <p className="mt-4 text-center text-[12px] text-mist-500">
          Works best in a recent Chrome, Edge or Firefox on a computer. Phones can handle short videos.
          {serverAvailable ? ' For long videos or saved projects, use your account instead.' : ''}
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------ configure / process / done
  const total = plan.segments.length;
  const regularLen = plan.segments[0] ? plan.segments[0].end - plan.segments[0].start : 0;
  const last = plan.segments[total - 1];
  const lastDiffers = total > 1 && last && Math.abs(last.end - last.start - regularLen) > 0.01 && method !== 'custom';
  const busy = stage === 'processing';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="aspect-video bg-black">
              {previewUrl && <video ref={playerRef} src={previewUrl} controls playsInline preload="metadata" className="h-full w-full" />}
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate font-semibold text-mist-50">{file?.name}</h2><p className="mt-0.5 text-[12px] text-mist-400">On this device · not uploaded</p></div>
                <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>Change video</Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Duration" value={formatTimestamp(info!.duration)} />
                <Stat label="Resolution" value={`${info!.width}×${info!.height}`} hint={info!.fps ? `${info!.fps} fps` : undefined} />
                <Stat label="File size" value={formatBytes(file?.size)} />
                <Stat label="Codec" value={(info!.videoCodec ?? '–').toUpperCase()} hint={info!.hasAudio ? `Audio: ${info!.audioCodec}` : 'No audio'} />
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <StepTitle n={2} title="Choose how to split it" />
            <fieldset disabled={busy} className="contents">
              <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {METHODS.map((m) => (
                  <button key={m.value} type="button" onClick={() => setMethod(m.value)} aria-pressed={method === m.value}
                    className={cn('rounded-xl border p-3 text-left transition-colors disabled:opacity-60', method === m.value ? 'border-volt-400/60 bg-volt-400/[0.07]' : 'border-white/[0.06] bg-ink-900/40 hover:border-white/15')}>
                    <m.icon className={cn('h-4 w-4', method === m.value ? 'text-volt-300' : 'text-mist-400')} />
                    <div className="mt-2 text-[13px] font-semibold text-mist-50">{m.label}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-mist-400">{m.hint}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6">
                {method === 'duration' && <DurationPicker label="Length of each clip" presets={DURATION_PRESETS} value={durValue} unit={durUnit} onValue={setDurValue} onUnit={setDurUnit} />}
                {method === 'interval' && <DurationPicker label="Cut the video every" presets={INTERVAL_PRESETS} value={intValue} unit={intUnit} onValue={setIntValue} onUnit={setIntUnit} />}
                {method === 'count' && (
                  <div className="max-w-xs">
                    <Label htmlFor="bcount">Number of clips</Label>
                    <Input id="bcount" type="number" min={1} max={5000} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
                    {total > 0 && <p className="mt-2 text-[13px] text-mist-300">Each clip will be about <span className="font-medium text-mist-50">{formatDuration(regularLen)}</span>.</p>}
                  </div>
                )}
                {method === 'custom' && (
                  <div className="space-y-3">
                    <p className="text-[13px] text-mist-400">Type times as 1:30, 01:02:03 or 90. The clock buttons use the player&apos;s current position.</p>
                    {ranges.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-white/[0.06] bg-ink-900/40 p-3">
                        <span className="mb-2.5 w-8 font-mono text-[12px] text-mist-400">#{i + 1}</span>
                        <TimeField label="Start" value={r.start} onChange={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, start: v } : x)))} onNow={() => { const t = playerRef.current?.currentTime; if (t !== undefined) setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, start: formatTimestamp(t, true) } : x))); }} />
                        <TimeField label="End" value={r.end} onChange={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, end: v } : x)))} onNow={() => { const t = playerRef.current?.currentTime; if (t !== undefined) setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, end: formatTimestamp(t, true) } : x))); }} />
                        <Button variant="ghost" size="icon" aria-label={`Remove clip ${i + 1}`} disabled={ranges.length === 1} onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => {
                      const s = parseTimestamp(ranges[ranges.length - 1]?.end ?? '0') || 0;
                      setRanges((rs) => [...rs, { start: formatTimestamp(Math.min(s, info!.duration - 1)), end: formatTimestamp(Math.min(info!.duration, s + 60)) }]);
                    }}><Plus className="h-3.5 w-3.5" />Add clip</Button>
                  </div>
                )}
              </div>
            </fieldset>
            <div className="mt-8 border-t border-white/[0.06] pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-mist-100">Preview of cuts</h3>
                {total > 0 && <span className="text-[13px] text-mist-300"><span className="font-semibold text-volt-300">{total}</span> {total === 1 ? 'clip' : 'clips'}</span>}
              </div>
              {plan.error ? <Alert tone="warning">{plan.error}</Alert> : (
                <>
                  <Timeline segments={plan.segments} duration={info!.duration} />
                  {lastDiffers && <p className="mt-3 text-[13px] text-mist-300">The last clip holds the remaining <span className="font-medium text-signal-amber">{formatDuration(last.end - last.start)}</span>.</p>}
                  <details className="mt-3"><summary className="cursor-pointer text-[13px] text-mist-400 hover:text-mist-200">Show all {total} clip times</summary><div className="mt-3"><SegmentList segments={plan.segments} /></div></details>
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <StepTitle n={3} title="Output settings" />
            <fieldset disabled={busy} className="mt-5 space-y-5">
              <Field label="Format"><Segmented value={format} onChange={setFormat} options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }]} /></Field>
              <Field label="Quality">
                <Select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                  {qualities.map((q) => <option key={q} value={q}>{q === 'original' ? `Original (${info!.width}×${info!.height})` : `${q}p`}</option>)}
                </Select>
              </Field>
              <Field label="Aspect ratio">
                <Segmented size="sm" value={aspect} onChange={setAspect} options={[{ value: 'original', label: 'Original' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
                {aspect !== 'original' && <div className="mt-2.5"><Segmented size="sm" value={aspectMode} onChange={setAspectMode} options={[{ value: 'crop', label: 'Crop to fill' }, { value: 'fit', label: 'Fit with bars' }]} /></div>}
              </Field>
              <Field label="Audio"><Segmented value={keepAudio ? 'keep' : 'remove'} onChange={(v) => setKeepAudio(v === 'keep')} options={[{ value: 'keep', label: 'Keep audio', disabled: !info!.hasAudio }, { value: 'remove', label: 'Remove audio' }]} /></Field>
              <Field label="Cutting">
                <Segmented value={cutMode} onChange={setCutMode} options={[{ value: 'fast', label: <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Fast</span>, disabled: !canCopy }, { value: 'precise', label: 'Precise' }]} />
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist-400">
                  {cutMode === 'fast'
                    ? 'No re-encoding, so it is quick and lossless. Each clip starts at the nearest keyframe, which can be a second or two early.'
                    : canCopy
                      ? 'Re-encodes every clip so cuts are exact. In the browser this is much slower than Fast; allow roughly real time or longer.'
                      : 'Your settings need re-encoding, which is slow in the browser. Keep MP4, original quality and original shape to use Fast mode.'}
                </p>
              </Field>
            </fieldset>
          </Card>

          <Card className="p-5">
            {busy ? (
              <>
                <div className="flex items-baseline justify-between"><span className="text-3xl font-semibold tabular-nums text-mist-50">{Math.round(progress.frac * 100)}%</span><span className="text-sm tabular-nums text-mist-300">{progress.done} of {progress.total} clips</span></div>
                <Progress value={progress.frac} className="mt-3" />
                <p className="mt-3 text-[13px] text-mist-300">Cutting clip {progress.current}{progress.eta !== null ? ` · about ${formatDuration(Math.max(1, progress.eta))} left` : ''}</p>
                <p className="mt-1 text-[12px] text-mist-500">Keep this tab open until it finishes.</p>
                <Button variant="outline" className="mt-4 w-full" onClick={cancel}><X className="h-4 w-4" />Stop</Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between"><span className="text-sm text-mist-300">Clips to create</span><span className="text-2xl font-semibold tabular-nums text-mist-50">{total || '–'}</span></div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{METHODS.find((m) => m.value === method)?.label}</Badge><Badge>{format.toUpperCase()}</Badge>
                  <Badge>{quality === 'original' ? 'Original quality' : `${quality}p`}</Badge>{cutMode === 'fast' && <Badge tone="accent">Fast</Badge>}
                </div>
                {error && <Alert className="mt-4">{error}</Alert>}
                <Button size="lg" className="mt-5 w-full" onClick={generate} disabled={!!plan.error || !total}>
                  <Film className="h-4 w-4" />{clips.length ? 'Generate again' : `Generate ${total ? `${total} ${total === 1 ? 'clip' : 'clips'}` : 'clips'}`}
                </Button>
              </>
            )}
          </Card>
        </div>
      </div>

      {(clips.length > 0 || busy) && (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[15px] font-semibold text-mist-50">Your clips <span className="font-normal text-mist-400">({clips.length})</span></h2>
            {clips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button variant={selecting ? 'secondary' : 'outline'} size="sm" onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><CheckSquare className="h-3.5 w-3.5" />{selecting ? 'Done' : 'Select'}</Button>
                {selecting ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === clips.length ? new Set() : new Set(clips.map((c) => c.idx)))}>{selected.size === clips.length ? 'Clear' : 'Select all'}</Button>
                    <Button size="sm" loading={zipping} disabled={!selected.size || busy} onClick={() => zip(clips.filter((c) => selected.has(c.idx)))}><Archive className="h-3.5 w-3.5" />Download selected ({selected.size})</Button>
                  </>
                ) : (
                  <Button size="sm" loading={zipping} disabled={busy} onClick={() => zip(clips)}><Archive className="h-3.5 w-3.5" />Download all (ZIP)</Button>
                )}
              </div>
            )}
          </div>
          <Alert tone="info" className="mb-4">These clips exist only in this browser tab. Download the ones you want before you close or reload the page.</Alert>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {clips.map((c) => {
              const isSel = selected.has(c.idx);
              return (
                <li key={c.idx} className={cn('group overflow-hidden rounded-xl border bg-ink-850', isSel ? 'border-volt-400/60' : 'border-white/[0.06]')}>
                  <button type="button" className="relative block aspect-video w-full overflow-hidden bg-black" aria-label={selecting ? `Select clip ${c.idx}` : `Play clip ${c.idx}`}
                    onClick={() => (selecting ? setSelected((s) => { const n = new Set(s); if (n.has(c.idx)) n.delete(c.idx); else n.add(c.idx); return n; }) : setPreview(c))}>
                    {c.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumb} alt="" className="h-full w-full object-contain" />
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-ink-950/80 px-1.5 py-0.5 font-mono text-[11px] text-mist-100">#{c.idx}</span>
                    <span className="absolute bottom-2 right-2 rounded-md bg-ink-950/80 px-1.5 py-0.5 font-mono text-[11px] text-mist-100">{formatTimestamp(c.end - c.start)}</span>
                    {selecting ? <span className="absolute right-2 top-2 text-mist-50">{isSel ? <CheckSquare className="h-5 w-5 text-volt-300" /> : <Square className="h-5 w-5" />}</span>
                      : <span className="absolute inset-0 grid place-items-center bg-ink-950/40 opacity-0 transition-opacity group-hover:opacity-100"><span className="grid h-11 w-11 place-items-center rounded-full bg-mist-50/95 text-ink-950"><Play className="ml-0.5 h-5 w-5" /></span></span>}
                  </button>
                  <div className="p-3.5">
                    <div className="text-sm font-medium text-mist-50">Clip {c.idx}</div>
                    <div className="font-mono text-[12px] tabular-nums text-mist-400">{formatTimestamp(c.start, true)} to {formatTimestamp(c.end, true)}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5"><Badge>{formatDuration(c.end - c.start)}</Badge><Badge>{formatBytes(c.blob.size)}</Badge></div>
                    <div className="mt-3 flex items-center gap-1.5">
                      <a href={c.url} download={c.name} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/5 bg-ink-700 px-3 text-[13px] font-medium text-mist-50 hover:bg-ink-600"><Download className="h-3.5 w-3.5" />Download</a>
                      <Button variant="ghost" size="icon" onClick={() => removeClip(c)} aria-label="Remove clip" disabled={busy}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </li>
              );
            })}
            {busy && progress.done < progress.total && (
              <li className="grid aspect-video place-items-center rounded-xl border border-dashed border-white/[0.08] text-[13px] text-mist-400">Cutting clip {progress.current}…</li>
            )}
          </ul>
        </section>
      )}

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)} title={preview ? `Clip ${preview.idx}` : ''} description={preview ? `${formatTimestamp(preview.start, true)} to ${formatTimestamp(preview.end, true)}` : undefined} className="max-w-3xl">
        {preview && (
          <>
            <video key={preview.idx} src={preview.url} controls autoPlay playsInline className="aspect-video w-full rounded-lg bg-black" />
            <div className="mt-4 flex justify-end"><a href={preview.url} download={preview.name} className="inline-flex h-10 items-center gap-2 rounded-lg bg-volt-400 px-4 text-sm font-medium text-ink-950 hover:bg-volt-300"><Download className="h-4 w-4" />Download</a></div>
          </>
        )}
      </Dialog>
    </div>
  );
}

function PickBox({ onFile, onUrl }: { onFile: (f: File) => void; onUrl: (u: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [tab, setTab] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'file', label: <span className="flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5" />Choose a file</span> },
        { value: 'url', label: <span className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Paste a link</span> },
      ]} />
      <div className="mt-5">
        {tab === 'file' ? (
          <>
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
              className={cn('flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors', drag ? 'border-volt-400 bg-volt-400/[0.06]' : 'border-ink-600 bg-ink-900/40 hover:border-mist-400/50 hover:bg-white/[0.02]')}>
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-volt-400/10 text-volt-300"><UploadCloud className="h-6 w-6" /></div>
              <div className="mt-4 text-[15px] font-medium text-mist-50">Drag a video here, or <span className="text-volt-300">browse your files</span></div>
              <div className="mt-1 text-[13px] text-mist-400">MP4, MOV, WebM or MKV</div>
            </button>
            <input ref={input} type="file" accept=".mp4,.m4v,.mov,.webm,.mkv,.avi,.mpeg,.mpg,.3gp,.ts,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
          </>
        ) : (
          <form onSubmit={async (e) => { e.preventDefault(); if (!url.trim()) return; setBusy(true); await onUrl(url.trim()); setBusy(false); }}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste your video link here..." className="h-12 text-[15px]" inputMode="url" />
              <Button type="submit" size="lg" loading={busy} disabled={!url.trim()}>Fetch video</Button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-mist-400">Direct links to video files work when the hosting site allows browser downloads. YouTube, TikTok, Instagram and similar sites can&apos;t be imported; download your own video and choose the file instead.</p>
          </form>
        )}
      </div>
    </div>
  );
}
