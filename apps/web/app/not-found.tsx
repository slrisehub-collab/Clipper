import Link from 'next/link';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/styles';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold text-mist-50">Page not found</h1>
      <p className="mt-2 max-w-sm text-mist-300">The page doesn&apos;t exist, or it belongs to another account.</p>
      <Link href="/app" className={buttonClass('primary', 'md', 'mt-6')}>Go to dashboard</Link>
    </div>
  );
}
