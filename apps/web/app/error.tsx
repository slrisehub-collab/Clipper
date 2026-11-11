'use client';
import { Button } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold text-mist-50">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-mist-300">The page couldn&apos;t load. This is usually temporary.</p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
