import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { currentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await currentUser()) redirect('/app');
  return <Suspense><AuthForm mode="login" /></Suspense>;
}
