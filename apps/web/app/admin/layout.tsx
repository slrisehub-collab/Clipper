import { AppShell } from '@/components/app-shell';
import { AdminTabs } from '@/components/admin';
import { requireAdmin } from '@/lib/auth';
import { usageSummary } from '@clipforge/core/limits';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const usage = await usageSummary(user.id);
  return (
    <AppShell user={{ email: user.email, name: user.display_name, role: user.role, planName: usage.plan.name, storageUsed: usage.storageUsed, storageLimit: usage.storageLimit }}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold tracking-tight text-mist-50 sm:text-2xl">Administration</h1>
        <AdminTabs />
        {children}
      </div>
    </AppShell>
  );
}
