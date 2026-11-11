import Link from 'next/link';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  // Two offset film strips cut by a diagonal: the "split".
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#12BFE0" />
      <path d="M8 9h9l-4 14H8z" fill="#070B16" />
      <path d="M19 9h5v14h-9z" fill="#070B16" opacity="0.55" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2.5 font-semibold tracking-tight text-mist-50', className)}>
      <LogoMark />
      <span className="text-[17px]">ClipForge</span>
    </Link>
  );
}
