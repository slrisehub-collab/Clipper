'use client';
import * as React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: Tone; message: string }

const Ctx = React.createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() { return React.useContext(Ctx); }

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-lg border border-white/[0.08] bg-ink-800 px-4 py-3 text-sm text-mist-100 shadow-2xl">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.tone === 'success' && 'text-signal-green', t.tone === 'error' && 'text-signal-red', t.tone === 'info' && 'text-volt-400')} />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-mist-400 hover:text-mist-50" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
