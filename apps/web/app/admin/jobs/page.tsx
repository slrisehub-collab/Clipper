import Link from 'next/link';
import { query } from '@clipforge/core/db';
import { formatDuration } from '@clipforge/core/plan';
import { CancelJobButton } from '@/components/admin';
import { Card, StatusBadge } from '@/components/ui';

const STATUSES = ['all', 'waiting', 'processing', 'completed', 'failed', 'canceled'];

export default async function AdminJobs({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'all' } = await searchParams;
  const jobs = await query<{ id: string; email: string; project_name: string; status: string; total_clips: number; completed_clips: number; progress: number; created_at: string; started_at: string | null; finished_at: string | null; source_seconds: number; error: string | null; attempts: number }>(
    `select j.id, u.email, p.name as project_name, j.status, j.total_clips, j.completed_clips, j.progress, j.created_at, j.started_at, j.finished_at, j.source_seconds, j.error, j.attempts
       from jobs j join users u on u.id = j.user_id join projects p on p.id = j.project_id
      where ($1 = 'all' or j.status = $1) order by j.created_at desc limit 200`, [STATUSES.includes(status) ? status : 'all']);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/jobs?status=${s}`} className={`rounded-md px-2.5 py-1 text-[13px] capitalize ${status === s ? 'bg-white/[0.08] text-mist-50' : 'text-mist-400 hover:text-mist-100'}`}>{s}</Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-mist-400"><tr className="border-b border-white/[0.06]">{['User', 'Project', 'Status', 'Clips', 'Duration', 'Run time', 'Created', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/[0.04]">
            {jobs.map((j) => {
              const run = j.started_at ? ((j.finished_at ? new Date(j.finished_at).getTime() : Date.now()) - new Date(j.started_at).getTime()) / 1000 : null;
              return (
                <tr key={j.id}>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-mist-200">{j.email}</td>
                  <td className="max-w-[200px] px-4 py-2.5"><div className="truncate text-mist-200">{j.project_name}</div>{j.error && <div className="truncate text-[12px] text-signal-red" title={j.error}>{j.error}</div>}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={j.status} />{j.attempts > 1 && <span className="ml-1 text-[11px] text-mist-500">×{j.attempts}</span>}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mist-300">{j.completed_clips}/{j.total_clips}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mist-300">{j.source_seconds ? formatDuration(j.source_seconds) : '–'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mist-300">{run !== null ? formatDuration(run) : '–'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-mist-400">{new Date(j.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-2.5 text-right">{(j.status === 'waiting' || j.status === 'processing') && <CancelJobButton id={j.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!jobs.length && <p className="p-5 text-sm text-mist-400">No jobs.</p>}
      </Card>
    </>
  );
}
