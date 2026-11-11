import Link from 'next/link';
import { FileVideo, Link2 } from 'lucide-react';
import { formatTimestamp } from '@clipforge/core/plan';
import { formatBytes } from '@clipforge/core/format';
import type { ProjectListItem } from '@/lib/data';
import { StatusBadge } from './ui';
import { ProjectActions } from './project-actions';

export function relTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProjectRow({ p }: { p: ProjectListItem }) {
  const status = p.videoStatus !== 'ready' ? p.videoStatus ?? 'pending' : p.lastJobStatus ?? 'ready';
  return (
    <li className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <Link href={`/app/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-ink-700">
          {p.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full place-items-center text-mist-500"><FileVideo className="h-5 w-5" /></div>
          )}
          {p.duration ? <span className="absolute bottom-1 right-1 rounded bg-ink-950/80 px-1 font-mono text-[10px] text-mist-100">{formatTimestamp(p.duration)}</span> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-mist-50">{p.name}</span>
            {p.sourceType === 'url' && <Link2 className="h-3.5 w-3.5 shrink-0 text-mist-500" aria-label="Imported from link" />}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-mist-400">
            {p.clipCount} {p.clipCount === 1 ? 'clip' : 'clips'} · {p.jobCount} {p.jobCount === 1 ? 'job' : 'jobs'} · {formatBytes(p.sizeBytes)} · {relTime(p.updatedAt)}
          </div>
        </div>
        <div className="hidden sm:block"><StatusBadge status={status} /></div>
      </Link>
      <ProjectActions id={p.id} name={p.name} />
    </li>
  );
}
