import 'server-only';
import { query } from '@clipforge/core/db';
import type { PlanRow } from '@clipforge/core/types';

export async function loadPlans(): Promise<PlanRow[]> {
  try {
    return await query<PlanRow>('select * from plans order by price_cents_monthly asc');
  } catch {
    return [];
  }
}
