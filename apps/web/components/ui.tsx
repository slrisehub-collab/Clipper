'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/cn';

import { buttonVariants as variants, buttonSizes as sizes, buttonClass, type ButtonVariant, type ButtonSize } from './styles';

export { buttonClass };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});


export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-ink-600 bg-ink-900/60 px-3 text-sm text-mist-50 placeholder:text-mist-500',
        'transition-colors focus:border-volt-400/70 focus:outline-none focus:ring-2 focus:ring-volt-400/20 disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[13px] font-medium text-mist-200', className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-10 w-full rounded-lg border border-ink-600 bg-ink-900/60 px-3 text-sm text-mist-50 focus:border-volt-400/70 focus:outline-none focus:ring-2 focus:ring-volt-400/20', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-white/[0.06] bg-ink-850 shadow-card', className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-mist-50">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-mist-300">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-white/[0.06] text-mist-200',
  info: 'bg-signal-blue/15 text-[#9DB6FF]',
  success: 'bg-signal-green/15 text-signal-green',
  warning: 'bg-signal-amber/15 text-signal-amber',
  danger: 'bg-signal-red/15 text-signal-red',
  accent: 'bg-volt-400/15 text-volt-300',
};
export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof badgeTones; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium', badgeTones[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [keyof typeof badgeTones, string]> = {
    waiting: ['neutral', 'Waiting'],
    uploading: ['info', 'Uploading'],
    importing: ['info', 'Importing'],
    probing: ['info', 'Analysing'],
    pending: ['neutral', 'Pending'],
    processing: ['accent', 'Processing'],
    ready: ['success', 'Ready'],
    completed: ['success', 'Completed'],
    failed: ['danger', 'Failed'],
    canceled: ['warning', 'Cancelled'],
  };
  const [tone, label] = map[status] ?? ['neutral', status];
  return (
    <Badge tone={tone}>
      {(status === 'processing' || status === 'uploading' || status === 'importing' || status === 'probing') && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </Badge>
  );
}

export function Progress({ value, className, indeterminate }: { value: number; className?: string; indeterminate?: boolean }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-ink-700', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-volt-400/70" style={{ transform: 'translateX(-100%)' }} />
      ) : (
        <div className="h-full rounded-full bg-gradient-to-r from-volt-500 to-volt-300 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-mist-300', className)} aria-label="Loading" />;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-white/[0.06] bg-ink-800 text-mist-300">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-mist-50">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-mist-300">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'danger', children, className }: { tone?: 'danger' | 'info' | 'warning' | 'success'; children: React.ReactNode; className?: string }) {
  const tones = {
    danger: 'border-signal-red/30 bg-signal-red/[0.08] text-[#FFB4B9]',
    info: 'border-signal-blue/30 bg-signal-blue/[0.08] text-[#C3D2FF]',
    warning: 'border-signal-amber/30 bg-signal-amber/[0.08] text-[#FFDFA3]',
    success: 'border-signal-green/30 bg-signal-green/[0.08] text-[#A8F0CE]',
  };
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed', tones[tone], className)}>{children}</div>;
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; disabled?: boolean }[]; className?: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-ink-900/70 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-ink-600 text-mist-50 shadow-sm' : 'text-mist-300 hover:text-mist-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, className }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
            'rounded-xl border border-white/[0.08] bg-ink-850 p-5 shadow-2xl focus:outline-none data-[state=open]:animate-fade-in',
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-mist-50">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-sm text-mist-300">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-mist-300 hover:bg-white/5 hover:text-mist-50" aria-label="Close">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Delete', onConfirm, danger = true }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string; confirmLabel?: string; onConfirm: () => Promise<void> | void; danger?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium uppercase tracking-wide text-mist-400">{label}</div>
      <div className="mt-1 truncate text-[15px] font-semibold text-mist-50 tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-mist-400">{hint}</div>}
    </div>
  );
}
