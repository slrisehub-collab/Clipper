import { query } from '@clipforge/core/db';
import type { PlanRow } from '@clipforge/core/types';
import { PlanForm } from '@/components/admin';
import { Card, CardHeader } from '@/components/ui';

const GB = 1024 ** 3;

export default async function AdminPlans() {
  const plans = await query<PlanRow>('select * from plans order by price_cents_monthly');
  return (
    <div className="space-y-6">
      <p className="text-sm text-mist-300">Limits apply immediately to new uploads and jobs. The price is shown on the pricing page only; no payment provider is connected.</p>
      {plans.map((p) => (
        <Card key={p.id}>
          <CardHeader title={p.name} description={`Plan id: ${p.id}`} />
          <div className="p-5">
            <PlanForm plan={{
              id: p.id, name: p.name, priceCentsMonthly: p.price_cents_monthly, maxSourceDurationMin: Math.round(p.max_source_duration_sec / 60),
              maxUploadGb: Math.round((p.max_upload_bytes / GB) * 100) / 100, monthlyProcessingMinutes: p.monthly_processing_minutes,
              storageGb: Math.round((p.storage_bytes / GB) * 100) / 100, maxClipsPerJob: p.max_clips_per_job, queuePriority: p.queue_priority, allowBatch: p.allow_batch,
            }} />
          </div>
        </Card>
      ))}
    </div>
  );
}
