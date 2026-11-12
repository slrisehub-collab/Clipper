import Link from 'next/link';
import { Logo } from './logo';
import { buttonClass } from './styles';
import { currentUser } from '@/lib/auth';

export async function SiteHeader() {
  // The public pages must still render if the database is unreachable or not configured yet.
  const user = await currentUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm text-mist-300 md:flex">
          <Link href="/#how-it-works" className="rounded-md px-3 py-2 hover:text-mist-50">How it works</Link>
          <Link href="/#features" className="rounded-md px-3 py-2 hover:text-mist-50">Features</Link>
          <Link href="/pricing" className="rounded-md px-3 py-2 hover:text-mist-50">Pricing</Link>
          <Link href="/help" className="rounded-md px-3 py-2 hover:text-mist-50">Help</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/app" className={buttonClass('primary', 'sm')}>Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={buttonClass('ghost', 'sm', 'hidden sm:inline-flex')}>Sign in</Link>
              <Link href="/register" className={buttonClass('primary', 'sm')}>Start clipping</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-mist-400">Split long videos into clean, ready-to-download clips. Processed with FFmpeg on our servers.</p>
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-mist-100">Product</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist-400">
            <li><Link href="/#how-it-works" className="hover:text-mist-50">How it works</Link></li>
            <li><Link href="/#formats" className="hover:text-mist-50">Supported formats</Link></li>
            <li><Link href="/pricing" className="hover:text-mist-50">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-mist-100">Support</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist-400">
            <li><Link href="/help" className="hover:text-mist-50">Help centre</Link></li>
            <li><Link href="/#faq" className="hover:text-mist-50">FAQ</Link></li>
            <li><Link href="/help#copyright" className="hover:text-mist-50">Copyright policy</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-mist-100">Account</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist-400">
            <li><Link href="/login" className="hover:text-mist-50">Sign in</Link></li>
            <li><Link href="/register" className="hover:text-mist-50">Create account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.04] py-5 text-center text-[12px] text-mist-500">
        © {new Date().getFullYear()} ClipForge. Only process videos you own or have permission to use.
      </div>
    </footer>
  );
}
