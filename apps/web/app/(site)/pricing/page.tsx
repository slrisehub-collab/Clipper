import type { Metadata } from 'next';
import { PricingCards } from '@/components/pricing-cards';
import { loadPlans } from '@/lib/plans';
import { currentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [plans, user] = await Promise.all([loadPlans(), currentUser().catch(() => null)]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-mist-50">Pricing</h1>
      <p className="mt-3 max-w-xl text-mist-300">Processing minutes are counted against the length of the clips you generate, not the time the server spends on them.</p>
      <div className="mt-10"><PricingCards plans={plans} currentPlanId={user?.plan_id} /></div>
      <div className="mt-10 rounded-xl border border-white/[0.06] bg-ink-850 p-5 text-sm text-mist-300">
        <p className="font-medium text-mist-100">Paid plans are not on sale yet.</p>
        <p className="mt-1">Online payments haven&apos;t been switched on. Until they are, accounts can be moved to Pro by an administrator. Nothing on this site will charge your card.</p>
      </div>
    </div>
  );
}
