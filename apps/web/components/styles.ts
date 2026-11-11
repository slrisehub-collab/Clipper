import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-volt-400 text-ink-950 hover:bg-volt-300 shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset] disabled:bg-volt-400/40',
  secondary: 'bg-ink-700 text-mist-50 hover:bg-ink-600 border border-white/5',
  outline: 'border border-ink-600 text-mist-100 hover:border-mist-400/50 hover:bg-white/[0.03]',
  ghost: 'text-mist-200 hover:bg-white/[0.05] hover:text-mist-50',
  danger: 'bg-signal-red/10 text-signal-red border border-signal-red/30 hover:bg-signal-red/20',
};
export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-lg',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn('inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-400/60', buttonVariants[variant], buttonSizes[size], className);
}
