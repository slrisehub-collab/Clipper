import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
import { usageSummary } from '@clipforge/core/limits';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const usage = await usageSummary(user.id);
  return (
    <AppShell user={{ email: user.email, name: user.display_name, role: user.role, planName: usage.plan.name, storageUsed: usage.storageUsed, storageLimit: usage.storageLimit }}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </AppShell>
  );
}
