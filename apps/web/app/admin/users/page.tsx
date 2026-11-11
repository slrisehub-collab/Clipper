import { query } from '@clipforge/core/db';
import { formatBytes } from '@clipforge/core/format';
import { UserActions } from '@/components/admin';
import { Badge, Card } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireAdmin();
  const { q } = await searchParams;
  const [users, plans] = await Promise.all([
    query<{ id: string; email: string; display_name: string | null; role: string; plan_id: string; suspended_at: string | null; created_at: string; projects: number; jobs: number; storage: number }>(
      `select u.id, u.email, u.display_name, u.role, u.plan_id, u.suspended_at, u.created_at,
              (select count(*)::int from projects p where p.user_id = u.id) as projects,
              (select count(*)::int from jobs j where j.user_id = u.id) as jobs,
              coalesce((select sum(size_bytes) from videos v where v.user_id = u.id),0) + coalesce((select sum(size_bytes) from clips c where c.user_id = u.id),0) as storage
         from users u where ($1::text is null or u.email ilike '%' || $1 || '%' or u.display_name ilike '%' || $1 || '%')
        order by u.created_at desc limit 200`, [q?.trim() || null]),
    query<{ id: string; name: string }>('select id, name from plans order by price_cents_monthly'),
  ]);
  return (
    <>
      <form className="mb-4 max-w-sm"><input name="q" defaultValue={q} placeholder="Search by email or name" className="h-10 w-full rounded-lg border border-ink-600 bg-ink-900/60 px-3 text-sm text-mist-50 placeholder:text-mist-500 focus:outline-none" /></form>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-mist-400"><tr className="border-b border-white/[0.06]">{['User', 'Joined', 'Projects', 'Jobs', 'Storage', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/[0.04]">
            {users.map((u) => (
              <tr key={u.id} className={u.suspended_at ? 'bg-signal-red/[0.03]' : ''}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-mist-100">{u.email}{u.role === 'admin' && <Badge tone="accent">Admin</Badge>}{u.suspended_at && <Badge tone="danger">Suspended</Badge>}</div>
                  {u.display_name && <div className="text-[12px] text-mist-400">{u.display_name}</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-mist-400">{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-2.5 tabular-nums text-mist-300">{u.projects}</td>
                <td className="px-4 py-2.5 tabular-nums text-mist-300">{u.jobs}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-mist-300">{formatBytes(Number(u.storage))}</td>
                <td className="px-4 py-2.5"><UserActions id={u.id} suspended={!!u.suspended_at} planId={u.plan_id} role={u.role} plans={plans} self={u.id === me.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
