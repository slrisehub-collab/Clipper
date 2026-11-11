import Link from 'next/link';
import { Check } from 'lucide-react';
import { formatBytes } from '@clipforge/core/format';
import { formatDuration } from '@clipforge/core/plan';
import type { PlanRow } from '@clipforge/core/types';
import { buttonClass } from './styles';
import { cn } from '@/lib/cn';

export function PricingCards({ plans, currentPlanId }: { plans: PlanRow[]; currentPlanId?: string }) {
  if (!plans.length) return <p className="text-mist-400">Plan details are unavailable right now.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {plans.map((p) => {
        const pro = p.id !== 'free';
        const items = [
          `Videos up to ${formatDuration(p.max_source_duration_sec)} long`,
          `${p.monthly_processing_minutes.toLocaleString('en-GB')} processing minutes a month`,
          `${formatBytes(p.storage_bytes)} storage`,
          `Uploads up to ${formatBytes(p.max_upload_bytes)}`,
          `Up to ${p.max_clips_per_job.toLocaleString('en-GB')} clips per job`,
          p.allow_batch ? 'ZIP and multi-clip downloads' : 'Individual downloads',
          pro ? 'Priority processing queue' : 'Standard processing queue',
        ];
        return (
          <div key={p.id} className={cn('flex flex-col rounded-2xl border p-6', pro ? 'border-volt-400/30 bg-ink-850 shadow-glow' : 'border-white/[0.06] bg-ink-850')}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-mist-50">{p.name}</h3>
              {pro && <span className="rounded-full bg-volt-400/15 px-2.5 py-0.5 text-[12px] font-medium text-volt-300">For regular use</span>}
            </div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight text-mist-50">{p.price_cents_monthly ? `$${(p.price_cents_monthly / 100).toFixed(0)}` : '$0'}</span>
              <span className="text-sm text-mist-400">/ month</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-mist-200">
              {items.map((i) => <li key={i} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-volt-400" />{i}</li>)}
            </ul>
            {currentPlanId === p.id ? (
              <div className={buttonClass('secondary', 'md', 'mt-8 pointer-events-none')}>Your current plan</div>
            ) : pro ? (
              <Link href={currentPlanId ? '/app/settings#plan' : '/register'} className={buttonClass('primary', 'md', 'mt-8')}>{currentPlanId ? 'Upgrade options' : 'Start with Free, upgrade anytime'}</Link>
            ) : (
              <Link href="/register" className={buttonClass('outline', 'md', 'mt-8')}>Create a free account</Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
