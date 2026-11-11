import { query } from '@clipforge/core/db';
import { Badge, Card } from '@/components/ui';

export default async function AdminErrors() {
  const errors = await query<{ id: number; source: string; context: string | null; message: string; details: any; created_at: string; email: string | null; job_id: string | null }>(
    `select e.*, u.email from system_errors e left join users u on u.id = e.user_id order by e.created_at desc limit 200`);
  return (
    <Card>
      {errors.length ? (
        <ul className="divide-y divide-white/[0.04]">
          {errors.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-mist-400">
                <Badge tone={e.source === 'worker' ? 'warning' : 'danger'}>{e.source}</Badge>
                <span className="font-mono">{e.context}</span>
                <span>{new Date(e.created_at).toLocaleString('en-GB')}</span>
                {e.email && <span>· {e.email}</span>}
                {e.job_id && <span className="font-mono">· job {e.job_id.slice(0, 8)}</span>}
              </div>
              <div className="mt-1 break-words text-sm text-mist-100">{e.message}</div>
              {e.details && <details className="mt-1"><summary className="cursor-pointer text-[12px] text-mist-400">Details</summary><pre className="mt-2 max-h-48 overflow-auto rounded-md bg-ink-950 p-3 text-[11px] text-mist-300">{JSON.stringify(e.details, null, 2)}</pre></details>}
            </li>
          ))}
        </ul>
      ) : <p className="p-5 text-sm text-mist-400">No errors recorded. Errors older than 90 days are removed automatically.</p>}
    </Card>
  );
}
