'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, ConfirmDialog, Input, Label } from './ui';
import { useToast } from './toast';
import { api } from '@/lib/client';

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const toast = useToast();
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try { await api('/api/me', { method: 'PATCH', body: { name: value } }); toast('Profile saved.', 'success'); router.refresh(); }
        catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
      }}
    >
      <div><Label htmlFor="email">Email</Label><Input id="email" value={email} disabled /></div>
      <div><Label htmlFor="name">Display name</Label><Input id="name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} /></div>
      <Button type="submit" loading={busy}>Save</Button>
    </form>
  );
}

export function PasswordForm() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true); setError(null);
        try {
          await api('/api/me/password', { body: { current: f.get('current'), next: f.get('next') } });
          form.reset();
          toast('Password changed. Other devices have been signed out.', 'success');
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}
    >
      <div><Label htmlFor="current">Current password</Label><Input id="current" name="current" type="password" autoComplete="current-password" required /></div>
      <div><Label htmlFor="next">New password</Label><Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required /></div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="secondary" loading={busy}>Change password</Button>
    </form>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <p className="text-sm text-mist-300">Deletes your account, every project, clip and uploaded video. This can&apos;t be undone.</p>
      <div className="mt-4 flex max-w-sm flex-col gap-2 sm:flex-row">
        <Input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Password to confirm deletion" />
        <Button variant="danger" disabled={!password} onClick={() => setOpen(true)}>Delete account</Button>
      </div>
      {error && <Alert className="mt-3 max-w-sm">{error}</Alert>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="All of your videos and clips will be removed permanently."
        confirmLabel="Delete everything"
        onConfirm={async () => {
          try { await api('/api/me', { method: 'DELETE', body: { password } }); router.replace('/'); router.refresh(); }
          catch (err) { setError((err as Error).message); }
        }}
      />
    </>
  );
}
