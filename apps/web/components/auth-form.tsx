'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Input, Label } from './ui';
import { api } from '@/lib/client';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, {
        body: { email: f.get('email'), password: f.get('password'), ...(mode === 'register' ? { name: f.get('name') || undefined } : {}) },
      });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : mode === 'register' ? '/app/new' : '/app');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold text-mist-50">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
      <p className="mt-1 text-sm text-mist-300">{mode === 'login' ? 'Welcome back.' : 'Free plan, no card required.'}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === 'register' && (
          <div>
            <Label htmlFor="name">Name <span className="font-normal text-mist-400">(optional)</span></Label>
            <Input id="name" name="name" autoComplete="name" maxLength={80} />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
          {mode === 'register' && <p className="mt-1.5 text-[12px] text-mist-400">At least 8 characters.</p>}
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-mist-400">
        {mode === 'login' ? <>New to ClipForge? <Link href="/register" className="text-volt-300 hover:underline">Create an account</Link></> : <>Already have an account? <Link href="/login" className="text-volt-300 hover:underline">Sign in</Link></>}
      </p>
      {mode === 'register' && <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-500">By creating an account you agree to only process videos you own or have permission to use.</p>}
    </Card>
  );
}
