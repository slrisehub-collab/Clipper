'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock, Film, Hash, Plus, RotateCcw, Scissors, Timer, Trash2, Zap } from 'lucide-react';
import {
  availableQualities, DURATION_PRESETS, INTERVAL_PRESETS, formatDuration, formatTimestamp, needsTransform, parseTimestamp, planSegments,
  type Aspect, type AspectMode, type ClipConfig, type ClipMethod, type CutMode, type OutputFormat, type Quality, type Segment,
} from '@clipforge/core/plan';
import { formatBytes } from '@clipforge/core/format';
import { Alert, Badge, Button, Card, Input, Label, Progress, Segmented, Select, Stat } from '../ui';
import { SourcePicker, type PlanLimits } from './source-picker';
import { SegmentList, Timeline } from './timeline';
import { api, newIdempotencyKey } from '@/lib/client';
import type { VideoPublic } from '@/lib/data';
import { cn } from '@/lib/cn';
import { useToast } from '../toast';

type Unit = 's' | 'min';
interface RangeInput { start: string; end: string }

const METHODS: { value: ClipMethod; label: string; icon: typeof Clock; hint: string }[] = [
  { value: 'duration', label: 'Equal duration', icon: Timer, hint: 'Every clip is the same length' },
  { value: 'custom', label: 'Custom times', icon: Scissors, hint: 'Pick exact start and end points' },
  { value: 'count', label: 'Number of clips', icon: Hash, hint: 'Divide into N equal clips' },
  { value: 'interval', label: 'Regular intervals', icon: Clock, hint: 'Cut every N seconds or minutes' },
];

const presetLabel = (s: number) => (s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60} min` : `${s}s`);

function usePolledVideo(videoId: string | null, initial: VideoPublic | null) {
  const [video, setVideo] = useState<VideoPublic | null>(initial);
  useEffect(() => {
    if (!videoId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await api<{ video: VideoPublic }>(`/api/videos/${videoId}`);
        if (stop) return;
        setVideo(r.video);
        if (r.video.status === 'ready' || r.video.status === 'failed') return;
      } catch { /* keep polling through blips */ }
      if (!stop) timer = setTimeout(tick, 1500);
    };
    if (!initial || (initial.status !== 'ready' && initial.status !== 'failed')) void tick();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
  return [video, setVideo] as const;
}

export function Workspace({ limits, initialVideo }: { limits: PlanLimits; initialVideo: VideoPublic | null }) {
  const router = useRouter();
  const toast = useToast();
  const [videoId, setVideoId] = useState<string | null>(initialVideo?.id ?? null);
  const [video, setVideo] = usePolledVideo(videoId, initialVideo);
  const playerRef = useRef<HTMLVideoElement>(null);

  // configuration
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
  const [cutMode, setCutMode] = useState<CutMode>('precise');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // A new idempotency key whenever the configuration changes; double clicks on the same config reuse it.
  const keyRef = useRef(newIdempotencyKey());
  const configJson = JSON.stringify(config);
  useEffect(() => { keyRef.current = newIdempotencyKey(); setSubmitError(null); }, [configJson]);

  const ready = video?.status === 'ready' && !!video.duration;
  const plan = useMemo<{ segments: Segment[]; error: string | null }>(() => {
    if (!ready) return { segments: [], error: null };
    try { return { segments: planSegments(config, video!.duration!), error: null }; } catch (e) { return { segments: [], error: (e as Error).message }; }
  }, [config, ready, video]);

  const qualities = availableQualities(video?.width, video?.height);
  useEffect(() => { if (!qualities.includes(quality)) setQuality('original'); }, [qualities, quality]);
  const canCopy = ready && !needsTransform(config, video!.videoCodec, video!.audioCodec);

  async function generate() {
    if (!video || plan.error || !plan.segments.length) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api<{ job: { id: string } }>('/api/jobs', { body: { videoId: video.id, config, idempotencyKey: keyRef.current } });
      router.push(`/app/jobs/${r.job.id}`);
    } catch (e) {
      setSubmitError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function retryVideo() {
    if (!video) return;
    try {
      await api(`/api/videos/${video.id}/retry`, { method: 'POST' });
      setVideo({ ...video, status: video.sourceType === 'url' ? 'importing' : 'probing', error: null });
      const id = video.id;
      setVideoId(null);
      setTimeout(() => setVideoId(id), 0);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function startOver() {
    setVideoId(null);
    setVideo(null);
    router.replace('/app/new');
  }

  function setRangeFromPlayer(i: number, field: 'start' | 'end') {
    const t = playerRef.current?.currentTime;
    if (t === undefined) return;
    setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: formatTimestamp(t, true) } : r)));
  }

  // ---------- Step 1: choose a source
  if (!videoId || !video) {
    return (
      <Card className="p-5 sm:p-8">
        <StepTitle n={1} title="Add your video" description="Upload a file from your device or paste a direct link to a video file." />
        <div className="mt-6"><SourcePicker limits={limits} onReady={(id) => { setVideo(null); setVideoId(id); }} /></div>
        <p className="mt-6 border-t border-white/[0.06] pt-4 text-[12px] text-mist-500">Only use videos you own or have permission to use.</p>
      </Card>
    );
  }

  // ---------- Step 1b: importing / analysing
  if (!ready) {
    const failed = video.status === 'failed';
    return (
      <Card className="p-6 sm:p-8">
        <StepTitle n={1} title={failed ? "We couldn't use this video" : video.status === 'importing' ? 'Downloading your video' : 'Reading video details'} description={video.title} />
        {failed ? (
          <div className="mt-6 space-y-4">
            <Alert><span className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{video.error ?? 'Something went wrong.'}</span></Alert>
            <div className="flex flex-wrap gap-2">
              {(video.sourceType === 'url' || !/upload it again|plan accepts/i.test(video.error ?? '')) && <Button variant="secondary" onClick={retryVideo}><RotateCcw className="h-4 w-4" />Try again</Button>}
              <Button variant="ghost" onClick={startOver}>Use a different video</Button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Progress value={0} indeterminate />
            <p className="mt-3 text-sm text-mist-300">
              {video.status === 'importing'
                ? `Downloaded ${formatBytes(video.sizeBytes ?? 0)} so far. Large files can take a few minutes; you can leave this page and find the project in your dashboard.`
                : 'Checking the format, duration and resolution. This usually takes a few seconds.'}
            </p>
          </div>
        )}
      </Card>
    );
  }

  // ---------- Step 2: configure
  const total = plan.segments.length;
  const regularLen = plan.segments[0] ? plan.segments[0].end - plan.segments[0].start : 0;
  const last = plan.segments[total - 1];
  const lastDiffers = total > 1 && last && Math.abs(last.end - last.start - regularLen) > 0.01 && method !== 'custom';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="aspect-video bg-black">
            {video.previewUrl ? (
              <video ref={playerRef} src={video.previewUrl} poster={video.thumbUrl ?? undefined} controls playsInline preload="metadata" className="h-full w-full" />
            ) : video.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumbUrl} alt="" className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-mist-50">{video.title}</h2>
                <p className="mt-0.5 truncate text-[12px] text-mist-400">{video.sourceType === 'url' ? video.sourceUrl : video.originalName}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={startOver}>Change video</Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Duration" value={formatTimestamp(video.duration!)} />
              <Stat label="Resolution" value={video.width ? `${video.width}×${video.height}` : '–'} hint={video.fps ? `${Math.round(video.fps * 100) / 100} fps` : undefined} />
              <Stat label="File size" value={formatBytes(video.sizeBytes)} />
              <Stat label="Codec" value={(video.videoCodec ?? '–').toUpperCase()} hint={video.hasAudio ? `Audio: ${video.audioCodec}` : 'No audio'} />
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <StepTitle n={2} title="Choose how to split it" />
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  method === m.value ? 'border-volt-400/60 bg-volt-400/[0.07]' : 'border-white/[0.06] bg-ink-900/40 hover:border-white/15',
                )}
              >
                <m.icon className={cn('h-4 w-4', method === m.value ? 'text-volt-300' : 'text-mist-400')} />
                <div className="mt-2 text-[13px] font-semibold text-mist-50">{m.label}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-mist-400">{m.hint}</div>
              </button>
            ))}
          </div>

          <div className="mt-6">
            {method === 'duration' && (
              <DurationPicker label="Length of each clip" presets={DURATION_PRESETS} value={durValue} unit={durUnit} onValue={setDurValue} onUnit={setDurUnit} />
            )}
            {method === 'interval' && (
              <DurationPicker label="Cut the video every" presets={INTERVAL_PRESETS} value={intValue} unit={intUnit} onValue={setIntValue} onUnit={setIntUnit} />
            )}
            {method === 'count' && (
              <div className="max-w-xs">
                <Label htmlFor="count">Number of clips</Label>
                <Input id="count" type="number" min={1} max={5000} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
                {total > 0 && <p className="mt-2 text-[13px] text-mist-300">Each clip will be about <span className="font-medium text-mist-50">{formatDuration(regularLen)}</span>.</p>}
              </div>
            )}
            {method === 'custom' && (
              <div className="space-y-3">
                <p className="text-[13px] text-mist-400">Type times as 1:30, 01:02:03 or 90. Use the clock buttons to grab the player&apos;s current position.</p>
                {ranges.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-white/[0.06] bg-ink-900/40 p-3">
                    <span className="mb-2.5 w-8 font-mono text-[12px] text-mist-400">#{i + 1}</span>
                    <TimeField label="Start" value={r.start} onChange={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, start: v } : x)))} onNow={() => setRangeFromPlayer(i, 'start')} />
                    <TimeField label="End" value={r.end} onChange={(v) => setRanges((rs) => rs.map((x, j) => (j === i ? { ...x, end: v } : x)))} onNow={() => setRangeFromPlayer(i, 'end')} />
                    <Button variant="ghost" size="icon" aria-label={`Remove clip ${i + 1}`} disabled={ranges.length === 1} onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => {
                  const prev = ranges[ranges.length - 1];
                  const s = parseTimestamp(prev?.end ?? '0') || 0;
                  const e = Math.min(video.duration!, s + 60);
                  setRanges((rs) => [...rs, { start: formatTimestamp(Math.min(s, video.duration! - 1)), end: formatTimestamp(e) }]);
                }}><Plus className="h-3.5 w-3.5" />Add clip</Button>
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-mist-100">Preview of cuts</h3>
              {total > 0 && <span className="text-[13px] text-mist-300"><span className="font-semibold text-volt-300">{total}</span> {total === 1 ? 'clip' : 'clips'}</span>}
            </div>
            {plan.error ? (
              <Alert tone="warning">{plan.error}</Alert>
            ) : (
              <>
                <Timeline segments={plan.segments} duration={video.duration!} />
                {lastDiffers && <p className="mt-3 text-[13px] text-mist-300">The last clip holds the remaining <span className="font-medium text-signal-amber">{formatDuration(last.end - last.start)}</span>.</p>}
                <details className="mt-3">
                  <summary className="cursor-pointer text-[13px] text-mist-400 hover:text-mist-200">Show all {total} clip times</summary>
                  <div className="mt-3"><SegmentList segments={plan.segments} /></div>
                </details>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <StepTitle n={3} title="Output settings" />
          <div className="mt-5 space-y-5">
            <Field label="Format">
              <Segmented value={format} onChange={setFormat} options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }]} />
            </Field>
            <Field label="Quality" hint={qualities.length < 4 ? `Options above ${Math.min(video.width ?? 0, video.height ?? 0)}p are hidden so nothing is upscaled.` : undefined}>
              <Select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                {qualities.map((q) => <option key={q} value={q}>{q === 'original' ? `Original (${video.width}×${video.height})` : `${q}p`}</option>)}
              </Select>
            </Field>
            <Field label="Aspect ratio">
              <Segmented size="sm" value={aspect} onChange={setAspect} options={[{ value: 'original', label: 'Original' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
              {aspect !== 'original' && (
                <div className="mt-2.5">
                  <Segmented size="sm" value={aspectMode} onChange={setAspectMode} options={[{ value: 'crop', label: 'Crop to fill' }, { value: 'fit', label: 'Fit with bars' }]} />
                  <p className="mt-1.5 text-[12px] text-mist-400">{aspectMode === 'crop' ? 'Fills the frame and trims the edges from the centre.' : 'Keeps the whole picture and adds black bars.'}</p>
                </div>
              )}
            </Field>
            <Field label="Audio">
              <Segmented value={keepAudio ? 'keep' : 'remove'} onChange={(v) => setKeepAudio(v === 'keep')} options={[{ value: 'keep', label: 'Keep audio', disabled: !video.hasAudio }, { value: 'remove', label: 'Remove audio' }]} />
            </Field>
            <Field label="Cutting">
              <Segmented value={cutMode} onChange={setCutMode} options={[{ value: 'precise', label: 'Precise' }, { value: 'fast', label: <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Fast</span>, disabled: !canCopy }]} />
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist-400">
                {cutMode === 'fast'
                  ? 'No re-encoding. Each cut moves to the nearest keyframe, so clips may be a second or two off.'
                  : canCopy
                    ? 'Exact cuts. Clips that start on a keyframe are copied without re-encoding.'
                    : 'Exact cuts. Your settings need re-encoding, so Fast mode is unavailable.'}
              </p>
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-mist-300">Clips to create</span>
            <span className="text-2xl font-semibold tabular-nums text-mist-50">{total || '–'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>{METHODS.find((m) => m.value === method)?.label}</Badge>
            <Badge>{format.toUpperCase()}</Badge>
            <Badge>{quality === 'original' ? 'Original quality' : `${quality}p`}</Badge>
            {aspect !== 'original' && <Badge>{aspect} {aspectMode}</Badge>}
            {!keepAudio && <Badge>No audio</Badge>}
          </div>
          {submitError && <Alert className="mt-4">{submitError}</Alert>}
          <Button size="lg" className="mt-5 w-full" onClick={generate} loading={submitting} disabled={!!plan.error || !total}>
            <Film className="h-4 w-4" />Generate {total ? `${total} ${total === 1 ? 'clip' : 'clips'}` : 'clips'}
          </Button>
          <p className="mt-3 text-center text-[12px] text-mist-500">Processing continues if you close this page.</p>
        </Card>
      </div>
    </div>
  );
}

export function StepTitle({ n, title, description }: { n: number; title: string; description?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-volt-400/15 font-mono text-[12px] font-semibold text-volt-300">{n}</span>
      <div className="min-w-0">
        <h2 className="font-semibold text-mist-50">{title}</h2>
        {description && <p className="mt-0.5 truncate text-sm text-mist-300">{description}</p>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-mist-200">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-mist-400">{hint}</p>}
    </div>
  );
}

export function DurationPicker({ label, presets, value, unit, onValue, onUnit }: {
  label: string; presets: number[]; value: string; unit: Unit; onValue: (v: string) => void; onUnit: (u: Unit) => void;
}) {
  const seconds = Number(value) * (unit === 'min' ? 60 : 1);
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-mist-200">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { if (p >= 60 && p % 60 === 0) { onValue(String(p / 60)); onUnit('min'); } else { onValue(String(p)); onUnit('s'); } }}
            className={cn(
              'rounded-md border px-3 py-1.5 text-[13px] font-medium tabular-nums transition-colors',
              Math.abs(seconds - p) < 0.001 ? 'border-volt-400/60 bg-volt-400/10 text-volt-300' : 'border-white/[0.08] text-mist-300 hover:border-white/20 hover:text-mist-50',
            )}
          >
            {presetLabel(p)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex max-w-xs items-end gap-2">
        <div className="flex-1">
          <Label htmlFor={`custom-${label}`}>Custom</Label>
          <Input id={`custom-${label}`} type="number" min={unit === 'min' ? 0.05 : 1} step="any" value={value} onChange={(e) => onValue(e.target.value)} />
        </div>
        <Select value={unit} onChange={(e) => onUnit(e.target.value as Unit)} className="w-28" aria-label="Unit">
          <option value="s">seconds</option>
          <option value="min">minutes</option>
        </Select>
      </div>
    </div>
  );
}

export function TimeField({ label, value, onChange, onNow }: { label: string; value: string; onChange: (v: string) => void; onNow: () => void }) {
  const invalid = value.trim() !== '' && Number.isNaN(parseTimestamp(value));
  return (
    <div className="min-w-[120px] flex-1">
      <Label>{label}</Label>
      <div className="flex gap-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} className={cn('font-mono', invalid && 'border-signal-red/60')} placeholder="00:00" aria-invalid={invalid} />
        <Button type="button" variant="secondary" size="icon" onClick={onNow} title="Use the player's current time" aria-label={`Set ${label.toLowerCase()} to current player time`}><Clock className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

