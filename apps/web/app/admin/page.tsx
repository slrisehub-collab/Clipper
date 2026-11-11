import { query } from '@clipforge/core/db';
import { getQueue, QUEUES } from '@clipforge/core/queue';
import { formatBytes } from '@clipforge/core/format';
import { formatDuration } from '@clipforge/core/plan';
import { Card, CardHeader, Stat } from '@/components/ui';

async function queueCounts() {
  try {
    const out: Record<string, Record<string, number>> = {};
    for (const [k, name] of Object.entries(QUEUES)) {
      if (k === 'maintenance') continue;
      out[k] = await getQueue(name).getJobCounts('waiting', 'prioritized', 'active', 'delayed', 'failed');
    }
    return out;
  } catch { return null; }
}

export default async function AdminOverview() {
  const [[u], [j], [s], [perf], [err], queues, recentFailures] = await Promise.all([
    query<{ total: number; new7: number; suspended: number; pro: number }>(`select count(*)::int as total, count(*) filter (where created_at > now() - interval '7 days')::int as new7, count(*) filter (where suspended_at is not null)::int as suspended, count(*) filter (where plan_id <> 'free')::int as pro from users`),
    query<{ waiting: number; processing: number; completed: number; failed: number; canceled: number; last24: number }>(`select count(*) filter (where status='waiting')::int as waiting, count(*) filter (where status='processing')::int as processing, count(*) filter (where status='completed')::int as completed, count(*) filter (where status='failed')::int as failed, count(*) filter (where status='canceled')::int as canceled, count(*) filter (where created_at > now() - interval '24 hours')::int as last24 from jobs`),
    query<{ videos: number; clips: number; exports: number }>(`select coalesce((select sum(size_bytes) from videos),0) as videos, coalesce((select sum(size_bytes) from clips),0) as clips, coalesce((select sum(size_bytes) from exports where status='completed'),0) as exports`),
    query<{ speed: number | null; wait: number | null; dur: number | null; n: number; fail_rate: number | null }>(
      `select avg(source_seconds / nullif(extract(epoch from finished_at - started_at), 0)) filter (where status='completed') as speed,
              avg(extract(epoch from started_at - created_at)) as wait,
              avg(extract(epoch from finished_at - started_at)) filter (where status='completed') as dur,
              count(*)::int as n,
              (count(*) filter (where status='failed'))::float / nullif(count(*) filter (where status in ('completed','failed')), 0) as fail_rate
         from jobs where created_at > now() - interval '7 days'`),
    query<{ n: number }>(`select count(*)::int as n from system_errors where created_at > now() - interval '24 hours'`),
    queueCounts(),
    query<{ id: string; email: string; error: string | null; finished_at: string }>(`select j.id, u.email, j.error, j.finished_at from jobs j join users u on u.id = j.user_id where j.status = 'failed' order by j.finished_at desc nulls last limit 5`),
  ]);
  const totalStorage = Number(s.videos) + Number(s.clips) + Number(s.exports);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><Stat label="Users" value={u.total} hint={`${u.new7} new this week · ${u.pro} on paid plans · ${u.suspended} suspended`} /></Card>
        <Card className="p-4"><Stat label="Jobs running" value={`${j.processing} running · ${j.waiting} waiting`} hint={`${j.last24} created in the last 24 h`} /></Card>
        <Card className="p-4"><Stat label="Storage used" value={formatBytes(totalStorage)} hint={`Sources ${formatBytes(Number(s.videos))} · Clips ${formatBytes(Number(s.clips))} · ZIPs ${formatBytes(Number(s.exports))}`} /></Card>
        <Card className="p-4"><Stat label="Errors (24 h)" value={err.n} hint={`${j.failed} failed jobs all-time`} /></Card>
      </div>

      <Card>
        <CardHeader title="Processing performance" description="Jobs created in the last 7 days." />
        <div className="grid grid-cols-2 gap-6 p-5 lg:grid-cols-4">
          <Stat label="Speed" value={perf.speed ? `${perf.speed.toFixed(1)}× realtime` : '–'} hint="Seconds of video processed per second" />
          <Stat label="Average queue wait" value={perf.wait !== null ? formatDuration(perf.wait) : '–'} />
          <Stat label="Average job time" value={perf.dur !== null ? formatDuration(perf.dur) : '–'} />
          <Stat label="Failure rate" value={perf.fail_rate !== null ? `${(perf.fail_rate * 100).toFixed(1)}%` : '–'} hint={`${perf.n} jobs`} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Queues" description="Live counts from Redis." />
        {queues ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-mist-400"><tr>{['Queue', 'Waiting', 'Active', 'Delayed', 'Failed'].map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.04] tabular-nums text-mist-200">
                {Object.entries(queues).map(([k, c]) => (
                  <tr key={k}><td className="px-5 py-2 capitalize">{k}</td><td className="px-5 py-2">{(c.waiting ?? 0) + (c.prioritized ?? 0)}</td><td className="px-5 py-2">{c.active}</td><td className="px-5 py-2">{c.delayed}</td><td className="px-5 py-2">{c.failed}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-5 text-sm text-signal-red">Redis is unreachable.</p>}
      </Card>

      <Card>
        <CardHeader title="Recent failed jobs" />
        {recentFailures.length ? (
          <ul className="divide-y divide-white/[0.04] text-sm">
            {recentFailures.map((f) => <li key={f.id} className="px-5 py-2.5"><span className="text-mist-200">{f.email}</span><span className="ml-2 text-mist-400">{f.error}</span></li>)}
          </ul>
        ) : <p className="p-5 text-sm text-mist-400">None.</p>}
      </Card>
    </div>
  );
}
