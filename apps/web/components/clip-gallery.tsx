'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, CheckSquare, Copy, Download, Link2, Play, Square, Star, Trash2 } from 'lucide-react';
import { formatTimestamp, formatDuration } from '@clipforge/core/plan';
import { formatBytes } from '@clipforge/core/format';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Progress, Segmented, buttonClass } from './ui';
import { useToast } from './toast';
import { api } from '@/lib/client';
import type { ClipPublic } from '@/lib/data';
import { cn } from '@/lib/cn';

interface ExportState { id: string; status: string; progress: number; url: string | null; error: string | null; clipCount: number }

export function ClipGallery({ projectId, clips: initial, allowBatch, jobLabels, refreshKey, emptyHint, onlyJobId }: {
  projectId: string;
  /** restrict to clips from one job */
  onlyJobId?: string;
  clips: ClipPublic[];
  allowBatch: boolean;
  /** job id → label, shown as a filter when the project has several jobs */
  jobLabels?: Record<string, string>;
  /** change this to refetch (used while a job is still producing clips) */
  refreshKey?: string | number;
  emptyHint?: string;
}) {
  const toast = useToast();
  const [clips, setClips] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'saved'>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [preview, setPreview] = useState<ClipPublic | null>(null);
  const [toDelete, setToDelete] = useState<ClipPublic | null>(null);
  const [share, setShare] = useState<{ clip: ClipPublic; url: string | null } | null>(null);
  const [exp, setExp] = useState<ExportState | null>(null);
  const first = useRef(true);

  useEffect(() => { setClips(initial); }, [initial]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (refreshKey === undefined) return;
    api<{ clips: ClipPublic[] }>(`/api/projects/${projectId}`).then((r) => setClips(onlyJobId ? r.clips.filter((c) => c.jobId === onlyJobId) : r.clips)).catch(() => {});
  }, [refreshKey, projectId, onlyJobId]);

  const jobs = jobLabels ? Object.keys(jobLabels) : [];
  const visible = useMemo(() => clips
    .filter((c) => filter === 'all' || c.saved)
    .filter((c) => jobFilter === 'all' || c.jobId === jobFilter), [clips, filter, jobFilter]);

  // Poll an export until the ZIP is ready, then start the download.
  useEffect(() => {
    if (!exp || exp.status === 'completed' || exp.status === 'failed') return;
    const t = setTimeout(async () => {
      try {
        const r = await api<ExportState>(`/api/exports/${exp.id}`);
        setExp(r);
        if (r.status === 'completed' && r.url) {
          window.location.href = r.url;
          toast(`ZIP with ${r.clipCount} clips is downloading.`, 'success');
        }
        if (r.status === 'failed') toast(r.error ?? 'The ZIP could not be created.', 'error');
      } catch { /* retry on next tick */ }
    }, 1200);
    return () => clearTimeout(t);
  }, [exp, toast]);

  async function startZip(ids?: string[]) {
    try {
      const r = await api<{ exportId: string; clipCount: number }>('/api/exports', { body: { projectId, clipIds: ids, jobId: !ids ? (onlyJobId ?? (jobFilter !== 'all' ? jobFilter : undefined)) : undefined } });
      setExp({ id: r.exportId, status: 'waiting', progress: 0, url: null, error: null, clipCount: r.clipCount });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function toggleSaved(c: ClipPublic) {
    setClips((cs) => cs.map((x) => (x.id === c.id ? { ...x, saved: !c.saved } : x)));
    try { await api(`/api/clips/${c.id}`, { method: 'PATCH', body: { saved: !c.saved } }); } catch (e) {
      setClips((cs) => cs.map((x) => (x.id === c.id ? { ...x, saved: c.saved } : x)));
      toast((e as Error).message, 'error');
    }
  }

  async function remove(c: ClipPublic) {
    await api(`/api/clips/${c.id}`, { method: 'DELETE' });
    setClips((cs) => cs.filter((x) => x.id !== c.id));
    setSelected((s) => { const n = new Set(s); n.delete(c.id); return n; });
    toast(`Clip ${c.idx} deleted.`, 'success');
  }

  async function openShare(c: ClipPublic) {
    const url = c.shareToken ? `${window.location.origin}/s/${c.shareToken}` : null;
    setShare({ clip: c, url });
  }

  async function setSharing(enabled: boolean) {
    if (!share) return;
    try {
      const r = await api<{ url: string | null }>(`/api/clips/${share.clip.id}/share`, { body: { enabled } });
      const url = r.url ? `${window.location.origin}${new URL(r.url).pathname}` : null;
      setShare({ ...share, url });
      setClips((cs) => cs.map((x) => (x.id === share.clip.id ? { ...x, shared: enabled, shareToken: url ? url.split('/s/')[1] : null } : x)));
      if (url) await copy(url);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('Link copied.', 'success'); } catch { toast('Copy failed. Select the link and copy it manually.', 'error'); }
  }

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const exporting = exp && (exp.status === 'waiting' || exp.status === 'processing');

  if (!clips.length) {
    return <EmptyState icon={<Play className="h-5 w-5" />} title="No clips yet" description={emptyHint ?? 'Clips appear here as soon as they are ready.'} />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${clips.length})` }, { value: 'saved', label: `Saved (${clips.filter((c) => c.saved).length})` }]} />
          {jobs.length > 1 && (
            <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="h-8 rounded-md border border-ink-600 bg-ink-900 px-2 text-[13px] text-mist-200" aria-label="Filter by clipping job">
              <option value="all">All jobs</option>
              {jobs.map((j) => <option key={j} value={j}>{jobLabels![j]}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={selecting ? 'secondary' : 'outline'} size="sm" onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
            <CheckSquare className="h-3.5 w-3.5" />{selecting ? 'Done' : 'Select'}
          </Button>
          {selecting && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((c) => c.id)))}>
                {selected.size === visible.length ? 'Clear' : 'Select all'}
              </Button>
              <Button size="sm" disabled={!selected.size || !!exporting || !allowBatch} onClick={() => startZip([...selected])}>
                <Archive className="h-3.5 w-3.5" />Download selected ({selected.size})
              </Button>
            </>
          )}
          {!selecting && (
            <Button size="sm" disabled={!!exporting || !allowBatch} onClick={() => startZip()} title={allowBatch ? undefined : 'ZIP downloads need a plan with batch downloads'}>
              <Archive className="h-3.5 w-3.5" />Download all (ZIP)
            </Button>
          )}
        </div>
      </div>

      {exp && exporting && (
        <div className="mb-4 rounded-lg border border-white/[0.06] bg-ink-900/60 p-3">
          <div className="mb-2 flex justify-between text-[13px] text-mist-300"><span>Building ZIP of {exp.clipCount} clips…</span><span className="tabular-nums">{Math.round(exp.progress * 100)}%</span></div>
          <Progress value={exp.progress} />
        </div>
      )}
      {exp?.status === 'completed' && exp.url && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-signal-green/25 bg-signal-green/[0.06] p-3 text-[13px] text-mist-200">
          <span>Your ZIP is ready. If the download didn&apos;t start, use the button.</span>
          <a href={exp.url} className={buttonClass('secondary', 'sm')}><Download className="h-3.5 w-3.5" />Download ZIP</a>
        </div>
      )}

      {!visible.length ? (
        <EmptyState icon={<Star className="h-5 w-5" />} title="Nothing here" description="Star clips to keep them in your saved list." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => {
            const isSel = selected.has(c.id);
            return (
              <li key={c.id} className={cn('group overflow-hidden rounded-xl border bg-ink-850 transition-colors', isSel ? 'border-volt-400/60' : 'border-white/[0.06]')}>
                <button
                  type="button"
                  className="relative block aspect-video w-full overflow-hidden bg-black"
                  onClick={() => (selecting ? toggle(c.id) : setPreview(c))}
                  aria-label={selecting ? `Select clip ${c.idx}` : `Play clip ${c.idx}`}
                >
                  {c.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbUrl} alt="" loading="lazy" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-ink-950/80 px-1.5 py-0.5 font-mono text-[11px] text-mist-100">#{c.idx}</span>
                  <span className="absolute bottom-2 right-2 rounded-md bg-ink-950/80 px-1.5 py-0.5 font-mono text-[11px] text-mist-100">{formatTimestamp(c.duration)}</span>
                  {selecting ? (
                    <span className="absolute right-2 top-2 text-mist-50">{isSel ? <CheckSquare className="h-5 w-5 text-volt-300" /> : <Square className="h-5 w-5" />}</span>
                  ) : (
                    <span className="absolute inset-0 grid place-items-center bg-ink-950/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-mist-50/95 text-ink-950"><Play className="ml-0.5 h-5 w-5" /></span>
                    </span>
                  )}
                </button>
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-mist-50">Clip {c.idx}</div>
                      <div className="font-mono text-[12px] tabular-nums text-mist-400">{formatTimestamp(c.start, true)} to {formatTimestamp(c.end, true)}</div>
                    </div>
                    <button onClick={() => toggleSaved(c)} className={cn('rounded-md p-1.5 hover:bg-white/5', c.saved ? 'text-signal-amber' : 'text-mist-500 hover:text-mist-200')} aria-label={c.saved ? 'Remove from saved' : 'Save clip'} aria-pressed={c.saved}>
                      <Star className={cn('h-4 w-4', c.saved && 'fill-current')} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge>{formatDuration(c.duration)}</Badge>
                    <Badge>{formatBytes(c.sizeBytes)}</Badge>
                    {c.width && <Badge>{c.width}×{c.height}</Badge>}
                    {c.shared && <Badge tone="accent"><Link2 className="h-3 w-3" />Shared</Badge>}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <a href={c.downloadUrl} className={buttonClass('secondary', 'sm', 'flex-1')} download={c.fileName}><Download className="h-3.5 w-3.5" />Download</a>
                    <Button variant="ghost" size="icon" onClick={() => openShare(c)} aria-label="Share clip" title="Share"><Link2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(c)} aria-label="Delete clip" title="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)} title={preview ? `Clip ${preview.idx}` : ''} description={preview ? `${formatTimestamp(preview.start, true)} to ${formatTimestamp(preview.end, true)} · ${formatDuration(preview.duration)}` : undefined} className="max-w-3xl">
        {preview && (
          <>
            <video key={preview.id} src={preview.playUrl} poster={preview.thumbUrl ?? undefined} controls autoPlay playsInline className="aspect-video w-full rounded-lg bg-black" />
            <div className="mt-4 flex justify-end gap-2">
              <a href={preview.downloadUrl} download={preview.fileName} className={buttonClass('primary', 'md')}><Download className="h-4 w-4" />Download</a>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={!!share} onOpenChange={(v) => !v && setShare(null)} title={share ? `Share clip ${share.clip.idx}` : ''} description="Anyone with the link can watch and download this one clip. Your other clips and the source video stay private.">
        {share && (share.url ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input readOnly value={share.url} className="h-10 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 font-mono text-[12px] text-mist-200" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" onClick={() => copy(share.url!)}><Copy className="h-4 w-4" />Copy</Button>
            </div>
            <Button variant="danger" size="sm" onClick={() => setSharing(false)}>Stop sharing</Button>
          </div>
        ) : (
          <Button onClick={() => setSharing(true)}><Check className="h-4 w-4" />Create share link</Button>
        ))}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={toDelete ? `Delete clip ${toDelete.idx}?` : ''}
        description="The file will be removed permanently. Other clips are not affected."
        onConfirm={async () => { if (toDelete) await remove(toDelete).catch((e) => toast((e as Error).message, 'error')); }}
      />
    </div>
  );
}
