import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Film, FolderOpen, Plus, Star } from 'lucide-react';
import { query } from '@clipforge/core/db';
import { usageSummary } from '@clipforge/core/limits';
import { formatBytes } from '@clipforge/core/format';
import { formatTimestamp } from '@clipforge/core/plan';
import type { ClipRow } from '@clipforge/core/types';
import { PageHeader } from '@/components/app-shell';
import { ProjectRow, relTime } from '@/components/project-card';
import { Card, CardHeader, EmptyState, Progress, StatusBadge } from '@/components/ui';
import { buttonClass } from '@/components/styles';
import { requireUser } from '@/lib/auth';
import { listProjects, thumbUrl } from '@/lib/data';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const user = await requireUser();
  const [usage, projects, active, saved, videos, counts] = await Promise.all([
    usageSummary(user.id),
    listProjects(user.id, { limit: 6 }),
    query<{ id: string; project_name: string; status: string; progress: number; completed_clips: number; total_clips: number }>(
      `select j.id, p.name as project_name, j.status, j.progress, j.completed_clips, j.total_clips from jobs j join projects p on p.id = j.project_id
        where j.user_id = $1 and j.status in ('waiting','processing') order by j.created_at`, [user.id]),
    query<ClipRow & { project_name: string }>(
      `select c.*, p.name as project_name from clips c join projects p on p.id = c.project_id where c.user_id = $1 and c.saved order by c.created_at desc limit 8`, [user.id]),
    query<{ id: string; project_id: string; title: string | null; original_name: string | null; status: string; size_bytes: number | null; duration_sec: number | null; source_type: string; created_at: string }>(
      `select id, project_id, title, original_name, status, size_bytes, duration_sec, source_type, created_at from videos where user_id = $1 order by created_at desc limit 8`, [user.id]),
    query<{ projects: number; clips: number; completed: number }>(
      `select (select count(*)::int from projects where user_id = $1) as projects,
              (select count(*)::int from clips where user_id = $1) as clips,
              (select count(*)::int from jobs where user_id = $1 and status = 'completed') as completed`, [user.id]),
  ]);
  const c = counts[0];
  const savedWithThumbs = await Promise.all(saved.map(async (s) => ({ ...s, thumb: await thumbUrl(s.thumb_key) })));

  return (
    <>
      <PageHeader
        title={`Welcome${user.display_name ? `, ${user.display_name.split(' ')[0]}` : ''}`}
        description="Your projects, clips and usage at a glance."
        actions={<Link href="/app/new" className={buttonClass('primary')}><Plus className="h-4 w-4" />New project</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="text-[12px] text-mist-400">Projects</div><div className="mt-1 text-2xl font-semibold tabular-nums text-mist-50">{c.projects}</div></Card>
        <Card className="p-4"><div className="text-[12px] text-mist-400">Clips generated</div><div className="mt-1 text-2xl font-semibold tabular-nums text-mist-50">{c.clips}</div><div className="text-[12px] text-mist-500">{c.completed} completed jobs</div></Card>
        <Card className="p-4">
          <div className="text-[12px] text-mist-400">Storage</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-mist-50">{formatBytes(usage.storageUsed)}</div>
          <Progress value={usage.storageUsed / usage.storageLimit} className="mt-2 h-1.5" />
          <div className="mt-1 text-[12px] text-mist-500">of {formatBytes(usage.storageLimit)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-mist-400">Processing this month</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-mist-50">{usage.processingUsedMin} min</div>
          <Progress value={usage.processingUsedMin / Math.max(1, usage.processingLimitMin)} className="mt-2 h-1.5" />
          <div className="mt-1 text-[12px] text-mist-500">of {usage.processingLimitMin} min · {usage.plan.name} plan</div>
        </Card>
      </div>

      {active.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="In progress" description="These keep running if you close the browser." />
          <ul className="divide-y divide-white/[0.05]">
            {active.map((j) => (
              <li key={j.id}>
                <Link href={`/app/jobs/${j.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02]">
                  <Film className="h-4 w-4 shrink-0 text-volt-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm text-mist-100">{j.project_name}</span><span className="text-[12px] tabular-nums text-mist-400">{j.completed_clips}/{j.total_clips}</span></div>
                    <Progress value={j.progress} indeterminate={j.status === 'waiting'} className="mt-2 h-1.5" />
                  </div>
                  <StatusBadge status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Recent projects" action={<Link href="/app/projects" className="flex items-center gap-1 text-[13px] text-volt-300 hover:underline">All projects<ArrowRight className="h-3.5 w-3.5" /></Link>} />
        {projects.length ? (
          <ul className="divide-y divide-white/[0.05]">{projects.map((p) => <ProjectRow key={p.id} p={p} />)}</ul>
        ) : (
          <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="No projects yet" description="Upload a video or paste a link to make your first set of clips." action={<Link href="/app/new" className={buttonClass('primary')}>Start clipping</Link>} />
        )}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Saved clips" description="Star a clip in any project to keep it here." />
          {savedWithThumbs.length ? (
            <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {savedWithThumbs.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/projects/${s.project_id}`} className="group block">
                    <div className="relative aspect-video overflow-hidden rounded-md bg-ink-700">
                      {s.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                      <span className="absolute bottom-1 right-1 rounded bg-ink-950/80 px-1 font-mono text-[10px] text-mist-100">{formatTimestamp(s.duration_sec)}</span>
                    </div>
                    <div className="mt-1.5 truncate text-[12px] text-mist-300 group-hover:text-mist-50">#{s.idx} · {s.project_name}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Star className="h-5 w-5" />} title="No saved clips" />}
        </Card>
        <Card>
          <CardHeader title="Uploaded videos" />
          {videos.length ? (
            <ul className="divide-y divide-white/[0.05]">
              {videos.map((v) => (
                <li key={v.id}>
                  <Link href={`/app/projects/${v.project_id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-white/[0.02]">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-mist-100">{v.original_name ?? v.title}</div>
                      <div className="text-[12px] text-mist-400">{v.source_type === 'url' ? 'Link' : 'Upload'} · {v.duration_sec ? formatTimestamp(v.duration_sec) : '–'} · {formatBytes(v.size_bytes)} · {relTime(v.created_at)}</div>
                    </div>
                    <StatusBadge status={v.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-6 text-sm text-mist-400">Nothing uploaded yet.</p>}
        </Card>
      </div>
    </>
  );
}
