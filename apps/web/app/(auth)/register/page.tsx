import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { currentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  if (await currentUser()) redirect('/app');
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
