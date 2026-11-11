import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderOpen, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { ProjectRow } from '@/components/project-card';
import { Card, EmptyState, StatusBadge } from '@/components/ui';
import { buttonClass } from '@/components/styles';
import { requireUser } from '@/lib/auth';
import { listProjects } from '@/lib/data';
import { query } from '@clipforge/core/db';
import { formatDuration } from '@clipforge/core/plan';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const [projects, history] = await Promise.all([
    listProjects(user.id, { search: q, limit: 200 }),
    query<{ id: string; project_id: string; project_name: string; status: string; total_clips: number; completed_clips: number; created_at: string; finished_at: string | null; config: any }>(
      `select j.id, j.project_id, p.name as project_name, j.status, j.total_clips, j.completed_clips, j.created_at, j.finished_at, j.config
         from jobs j join projects p on p.id = j.project_id where j.user_id = $1 order by j.created_at desc limit 50`, [user.id]),
  ]);
  return (
    <>
      <PageHeader title="Projects" description="Every video you've uploaded or imported, and its clips." actions={<Link href="/app/new" className={buttonClass('primary')}><Plus className="h-4 w-4" />New project</Link>} />
      <form className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
        <input name="q" defaultValue={q} placeholder="Search projects" className="h-10 w-full rounded-lg border border-ink-600 bg-ink-900/60 pl-9 pr-3 text-sm text-mist-50 placeholder:text-mist-500 focus:border-volt-400/70 focus:outline-none" />
      </form>
      <Card>
        {projects.length ? (
          <ul className="divide-y divide-white/[0.05]">{projects.map((p) => <ProjectRow key={p.id} p={p} />)}</ul>
        ) : (
          <EmptyState icon={<FolderOpen className="h-5 w-5" />} title={q ? 'No matching projects' : 'No projects yet'} description={q ? 'Try a different search.' : 'Upload a video to create your first project.'} action={!q && <Link href="/app/new" className={buttonClass('primary')}>Start clipping</Link>} />
        )}
      </Card>

      <h2 className="mb-3 mt-10 text-[15px] font-semibold text-mist-50">Processing history</h2>
      <Card className="overflow-x-auto">
        {history.length ? (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-mist-400">
              <tr className="border-b border-white/[0.06]"><th className="px-4 py-2.5 font-medium">Project</th><th className="px-4 py-2.5 font-medium">Settings</th><th className="px-4 py-2.5 font-medium">Clips</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Started</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {history.map((j) => (
                <tr key={j.id} className="hover:bg-white/[0.02]">
                  <td className="max-w-[220px] truncate px-4 py-2.5"><Link href={`/app/jobs/${j.id}`} className="text-mist-100 hover:text-volt-300">{j.project_name}</Link></td>
                  <td className="px-4 py-2.5 text-mist-300">{j.config.method === 'custom' ? 'Custom times' : j.config.method === 'count' ? `${j.config.count} clips` : formatDuration(j.config.segmentSeconds)} · {String(j.config.format).toUpperCase()}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mist-300">{j.completed_clips}/{j.total_clips}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={j.status} /></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-mist-400">{new Date(j.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="px-4 py-6 text-sm text-mist-400">No processing jobs yet.</p>}
      </Card>
    </>
  );
}
