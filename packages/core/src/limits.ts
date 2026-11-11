import { one, query } from './db';
import type { PlanRow } from './types';

export async function getPlan(planId: string): Promise<PlanRow> {
  const p = await one<PlanRow>('select * from plans where id = $1', [planId]);
  if (!p) throw new Error(`Unknown plan ${planId}`);
  return p;
}

export async function getUserPlan(userId: string): Promise<PlanRow> {
  const p = await one<PlanRow>('select p.* from plans p join users u on u.plan_id = p.id where u.id = $1', [userId]);
  if (!p) throw new Error('User not found');
  return p;
}

export async function storageUsed(userId: string): Promise<number> {
  const r = await one<{ total: number }>(
    `select coalesce((select sum(size_bytes) from videos where user_id = $1), 0)
          + coalesce((select sum(size_bytes) from clips where user_id = $1), 0)
          + coalesce((select sum(size_bytes) from exports where user_id = $1 and status = 'completed'), 0) as total`,
    [userId],
  );
  return Number(r?.total ?? 0);
}

export function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function processingUsedSeconds(userId: string): Promise<number> {
  const r = await one<{ s: number }>('select processing_seconds as s from usage_monthly where user_id = $1 and month = $2', [userId, monthStart()]);
  return Number(r?.s ?? 0);
}

export async function addProcessingSeconds(userId: string, seconds: number) {
  await query(
    `insert into usage_monthly (user_id, month, processing_seconds) values ($1, $2, $3)
     on conflict (user_id, month) do update set processing_seconds = usage_monthly.processing_seconds + excluded.processing_seconds`,
    [userId, monthStart(), seconds],
  );
}

export async function usageSummary(userId: string) {
  const [plan, used, processing] = await Promise.all([getUserPlan(userId), storageUsed(userId), processingUsedSeconds(userId)]);
  return {
    plan,
    storageUsed: used,
    storageLimit: plan.storage_bytes,
    processingUsedMin: Math.round((processing / 60) * 10) / 10,
    processingLimitMin: plan.monthly_processing_minutes,
  };
}
