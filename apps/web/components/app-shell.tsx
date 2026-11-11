'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderOpen, HelpCircle, LayoutDashboard, LogOut, Plus, Settings, Shield } from 'lucide-react';
import { formatBytes } from '@clipforge/core/format';
import { Logo } from './logo';
import { cn } from '@/lib/cn';
import { api } from '@/lib/client';

export interface ShellUser { email: string; name: string | null; role: string; planName: string; storageUsed: number; storageLimit: number }

const nav = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/new', label: 'New project', icon: Plus },
  { href: '/app/projects', label: 'Projects', icon: FolderOpen },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = user.role === 'admin' ? [...nav, { href: '/admin', label: 'Admin', icon: Shield }] : nav;
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + '/'));
  const pct = Math.min(1, user.storageUsed / Math.max(1, user.storageLimit));

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-white/[0.06] bg-ink-950/60 lg:flex">
        <div className="px-5 py-5"><Logo href="/app" /></div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active(i.href, (i as any).exact) ? 'bg-white/[0.06] text-mist-50' : 'text-mist-300 hover:bg-white/[0.03] hover:text-mist-50',
              )}
            >
              <i.icon className={cn('h-4 w-4', active(i.href, (i as any).exact) && 'text-volt-400')} />
              {i.label}
            </Link>
          ))}
          <Link href="/help" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-mist-300 hover:bg-white/[0.03] hover:text-mist-50">
            <HelpCircle className="h-4 w-4" /> Help
          </Link>
        </nav>
        <div className="m-3 rounded-xl border border-white/[0.06] bg-ink-850 p-3.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-mist-300">Storage</span>
            <span className="font-medium text-mist-200">{user.planName}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-ink-700">
            <div className={cn('h-1.5 rounded-full', pct > 0.9 ? 'bg-signal-red' : 'bg-volt-400')} style={{ width: `${Math.max(2, pct * 100)}%` }} />
          </div>
          <div className="mt-1.5 text-[12px] tabular-nums text-mist-400">{formatBytes(user.storageUsed)} of {formatBytes(user.storageLimit)}</div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-mist-100">{user.name || user.email.split('@')[0]}</div>
            <div className="truncate text-[12px] text-mist-400">{user.email}</div>
          </div>
          <button onClick={signOut} className="rounded-md p-2 text-mist-400 hover:bg-white/5 hover:text-mist-50" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-900/90 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Logo href="/app" />
          <button onClick={signOut} className="rounded-md p-2 text-mist-400 hover:text-mist-50" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium', active(i.href, (i as any).exact) ? 'bg-white/[0.08] text-mist-50' : 'text-mist-300')}>
              <i.icon className="h-3.5 w-3.5" />{i.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-xl font-semibold tracking-tight text-mist-50 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-mist-300">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
