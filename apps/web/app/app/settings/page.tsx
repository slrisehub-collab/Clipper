import type { Metadata } from 'next';
import Link from 'next/link';
import { usageSummary } from '@clipforge/core/limits';
import { formatBytes } from '@clipforge/core/format';
import { formatDuration } from '@clipforge/core/plan';
import { PageHeader } from '@/components/app-shell';
import { DeleteAccount, PasswordForm, ProfileForm } from '@/components/settings-forms';
import { Card, CardHeader, Progress, Stat } from '@/components/ui';
import { buttonClass } from '@/components/styles';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();
  const u = await usageSummary(user.id);
  return (
    <>
      <PageHeader title="Account settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="plan" className="lg:col-span-2">
          <CardHeader title={`${u.plan.name} plan`} description="Your limits and what you've used this month." action={u.plan.id === 'free' ? <Link href="/pricing" className={buttonClass('outline', 'sm')}>Compare plans</Link> : undefined} />
          <div className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Stat label="Storage" value={`${formatBytes(u.storageUsed)} / ${formatBytes(u.storageLimit)}`} />
              <Progress value={u.storageUsed / u.storageLimit} className="mt-2 h-1.5" />
            </div>
            <div>
              <Stat label="Processing" value={`${u.processingUsedMin} / ${u.processingLimitMin} min`} hint="Resets on the 1st of each month (UTC)" />
              <Progress value={u.processingUsedMin / Math.max(1, u.processingLimitMin)} className="mt-2 h-1.5" />
            </div>
            <Stat label="Longest video" value={formatDuration(u.plan.max_source_duration_sec)} />
            <Stat label="Largest upload" value={formatBytes(u.plan.max_upload_bytes)} hint={`Up to ${u.plan.max_clips_per_job} clips per job`} />
          </div>
          {u.plan.id === 'free' && (
            <p className="border-t border-white/[0.06] px-5 py-3 text-[13px] text-mist-400">Online payments aren&apos;t switched on yet, so upgrades are handled by an administrator for now.</p>
          )}
        </Card>
        <Card><CardHeader title="Profile" /><div className="p-5"><ProfileForm name={user.display_name ?? ''} email={user.email} /></div></Card>
        <Card><CardHeader title="Password" /><div className="p-5"><PasswordForm /></div></Card>
        <Card className="lg:col-span-2 border-signal-red/20"><CardHeader title="Delete account" /><div className="p-5"><DeleteAccount /></div></Card>
      </div>
    </>
  );
}
