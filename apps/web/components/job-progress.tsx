'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Film, Layers, RotateCcw, XCircle } from 'lucide-react';
import { formatDuration } from '@clipforge/core/plan';
import { Alert, Button, Card, ConfirmDialog, Progress, Stat, StatusBadge, buttonClass } from './ui';
import { ClipGallery } from './clip-gallery';
import { useToast } from './toast';
import { api } from '@/lib/client';
import type { ClipPublic, JobPublic } from '@/lib/data';

const describe = (j: JobPublic) => {
  const c = j.config;
  const m = c.method === 'custom' ? 'Custom times' : c.method === 'count' ? `${c.count} equal clips` : `${formatDuration(c.segmentSeconds ?? 0)} ${c.method === 'interval' ? 'intervals' : 'clips'}`;
  return [m, c.format.toUpperCase(), c.quality === 'original' ? 'original quality' : `${c.quality}p`, c.aspect !== 'original' ? `${c.aspect} ${c.aspectMode}` : null, !c.keepAudio ? 'no audio' : null, c.cutMode === 'fast' ? 'fast cut' : null]
    .filter(Boolean).join(' · ');
};

export function JobProgress({ initialJob, projectName, clips, allowBatch }: { initialJob: JobPublic; projectName: string; clips: ClipPublic[]; allowBatch: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState(initialJob);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  const active = job.status === 'waiting' || job.status === 'processing';

  useEffect(() => {
    if (!active) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await api<{ job: JobPublic }>(`/api/jobs/${job.id}`);
        if (stop) return;
        setJob(r.job);
        if (r.job.status === 'completed') { toast(`All ${r.job.completedClips} clips are ready.`, 'success'); router.refresh(); }
        if (r.job.status === 'failed') toast('Processing failed. See the details below.', 'error');
      } catch { /* keep polling */ }
      if (!stop) t = setTimeout(poll, 1500);
    };
    t = setTimeout(poll, 1000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { stop = true; clearTimeout(t); clearInterval(clock); };
  }, [active, job.id, router, toast]);

  async function cancel() {
    const r = await api<{ job: JobPublic }>(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
    setJob(r.job);
  }
  async function retry() {
    setBusy(true);
    try {
      const r = await api<{ job: JobPublic }>(`/api/jobs/${job.id}/retry`, { method: 'POST' });
      setJob(r.job);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const pct = Math.round(job.progress * 100);
  const elapsed = job.startedAt ? (job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime() : Date.now() - startedAt;
  const headline = {
    waiting: 'Waiting in the queue',
    processing: job.cancelRequested ? 'Stopping…' : `Cutting clip ${job.currentClip ?? job.completedClips + 1} of ${job.totalClips}`,
    completed: 'Your clips are ready',
    failed: 'Processing failed',
    canceled: 'Processing was cancelled',
  }[job.status];

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {job.status === 'completed' ? <CheckCircle2 className="h-6 w-6 text-signal-green" /> : job.status === 'failed' ? <XCircle className="h-6 w-6 text-signal-red" /> : job.status === 'canceled' ? <XCircle className="h-6 w-6 text-signal-amber" /> : <Film className="h-6 w-6 animate-pulse text-volt-400" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-mist-50">{headline}</h2>
                <StatusBadge status={job.status} />
              </div>
              <p className="mt-1 text-sm text-mist-300">{projectName} · {describe(job)}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {active && !job.cancelRequested && <Button variant="outline" onClick={() => setConfirmCancel(true)}>Cancel</Button>}
            {(job.status === 'failed' || job.status === 'canceled') && <Button onClick={retry} loading={busy}><RotateCcw className="h-4 w-4" />Retry</Button>}
            {job.status === 'completed' && <Link href={`/app/projects/${job.projectId}`} className={buttonClass('secondary')}><Layers className="h-4 w-4" />Open project</Link>}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular-nums text-mist-50">{pct}%</span>
            <span className="text-sm tabular-nums text-mist-300">{job.completedClips} of {job.totalClips} clips</span>
          </div>
          <Progress value={job.progress} indeterminate={job.status === 'waiting'} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-4">
          <Stat label="Completed" value={`${job.completedClips} / ${job.totalClips}`} />
          <Stat label="Current clip" value={active && job.currentClip ? `#${job.currentClip}` : '–'} />
          <Stat label="Time left" value={job.status === 'processing' && job.etaSec !== null ? `about ${formatDuration(Math.max(1, job.etaSec))}` : job.status === 'completed' ? 'Done' : '–'} hint={job.status === 'processing' && job.etaSec === null ? 'Estimating…' : undefined} />
          <Stat label="Elapsed" value={<span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-mist-400" />{formatDuration(Math.max(0, elapsed / 1000))}</span>} />
        </div>

        {job.status === 'failed' && job.error && <Alert className="mt-5">{job.error}{job.completedClips > 0 && ` ${job.completedClips} clips were finished before the error; Retry will continue from where it stopped.`}</Alert>}
        {job.status === 'canceled' && <Alert tone="warning" className="mt-5">Processing stopped. {job.completedClips ? `The ${job.completedClips} clips already made are kept below. ` : ''}Retry continues with the remaining clips.</Alert>}
        {job.status === 'waiting' && <p className="mt-5 text-sm text-mist-400">Your job will start as soon as a processing slot is free. You can close this page.</p>}
      </Card>

      <section>
        <h3 className="mb-4 text-[15px] font-semibold text-mist-50">Clips {active && job.completedClips > 0 && <span className="font-normal text-mist-400">(more appear as they finish)</span>}</h3>
        <ClipGallery projectId={job.projectId} clips={clips} allowBatch={allowBatch} refreshKey={job.completedClips} onlyJobId={job.id} emptyHint={active ? 'The first clip will appear here in a moment.' : undefined} />
      </section>

      <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} title="Cancel processing?" description="Clips that are already finished are kept. You can retry later to make the rest." confirmLabel="Cancel processing" onConfirm={cancel} />
    </div>
  );
}
