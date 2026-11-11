'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Dialog, Input, Label, Select } from './ui';
import { useToast } from './toast';
import { api } from '@/lib/client';
import { cn } from '@/lib/cn';

const tabs = [
  ['/admin', 'Overview'], ['/admin/users', 'Users'], ['/admin/jobs', 'Jobs'], ['/admin/errors', 'Errors'], ['/admin/plans', 'Plans'],
] as const;

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav className="mb-6 mt-4 flex gap-1 overflow-x-auto border-b border-white/[0.06]">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={cn('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium', path === href ? 'border-volt-400 text-mist-50' : 'border-transparent text-mist-400 hover:text-mist-100')}>{label}</Link>
      ))}
    </nav>
  );
}

export function UserActions({ id, suspended, planId, role, plans, self }: { id: string; suspended: boolean; planId: string; role: string; plans: { id: string; name: string }[]; self: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const act = async (b: unknown) => {
    try { await api(`/api/admin/users/${id}`, { body: b }); router.refresh(); toast('Saved.', 'success'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select value={planId} onChange={(e) => act({ action: 'plan', planId: e.target.value })} className="h-8 w-24 text-[13px]" aria-label="Plan">
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      {!self && (
        <Select value={role} onChange={(e) => act({ action: 'role', role: e.target.value })} className="h-8 w-24 text-[13px]" aria-label="Role">
          <option value="user">User</option><option value="admin">Admin</option>
        </Select>
      )}
      {!self && (suspended
        ? <Button size="sm" variant="secondary" onClick={() => act({ action: 'unsuspend' })}>Unsuspend</Button>
        : <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>Suspend</Button>)}
      <Dialog open={confirm} onOpenChange={setConfirm} title="Suspend this account?" description="They are signed out everywhere, their running jobs are stopped, and they can't sign in until unsuspended.">
        <Label htmlFor={`reason-${id}`}>Reason shown to the user (optional)</Label>
        <Input id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={async () => { await act({ action: 'suspend', reason: reason || undefined }); setConfirm(false); }}>Suspend</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function CancelJobButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Button size="sm" variant="ghost" onClick={async () => {
      try { await api(`/api/admin/jobs/${id}`, { method: 'DELETE' }); toast('Cancel requested.', 'success'); router.refresh(); } catch (e) { toast((e as Error).message, 'error'); }
    }}>Cancel</Button>
  );
}

export interface PlanFormValue {
  id: string; name: string; priceCentsMonthly: number; maxSourceDurationMin: number; maxUploadGb: number; monthlyProcessingMinutes: number;
  storageGb: number; maxClipsPerJob: number; queuePriority: number; allowBatch: boolean;
}

export function PlanForm({ plan }: { plan: PlanFormValue }) {
  const toast = useToast();
  const router = useRouter();
  const [v, setV] = useState(plan);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof PlanFormValue) => ({
    value: String(v[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) }),
    type: 'number', step: 'any', min: 0,
  });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const { id, ...body } = v;
        try { await api(`/api/admin/plans/${id}`, { method: 'PATCH', body }); toast('Plan updated.', 'success'); router.refresh(); }
        catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
      }}
    >
      <div><Label>Name</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label>Price (cents / month)</Label><Input {...num('priceCentsMonthly')} /></div>
      <div><Label>Max video length (minutes)</Label><Input {...num('maxSourceDurationMin')} /></div>
      <div><Label>Max upload (GB)</Label><Input {...num('maxUploadGb')} /></div>
      <div><Label>Processing minutes / month</Label><Input {...num('monthlyProcessingMinutes')} /></div>
      <div><Label>Storage (GB)</Label><Input {...num('storageGb')} /></div>
      <div><Label>Max clips per job</Label><Input {...num('maxClipsPerJob')} /></div>
      <div><Label>Queue priority (1 = highest)</Label><Input {...num('queuePriority')} /></div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-mist-200">
        <input type="checkbox" checked={v.allowBatch} onChange={(e) => setV({ ...v, allowBatch: e.target.checked })} className="h-4 w-4 accent-[#38D9F5]" />ZIP / batch downloads
      </label>
      <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" loading={busy}>Save {v.name}</Button></div>
    </form>
  );
}
