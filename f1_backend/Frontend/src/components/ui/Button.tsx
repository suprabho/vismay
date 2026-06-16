import { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:   'bg-f1-red text-white hover:bg-red-700 disabled:bg-neutral-300 disabled:text-neutral-500',
  secondary: 'bg-neutral-900 text-white hover:bg-neutral-700 disabled:bg-neutral-300 disabled:text-neutral-500',
  ghost:     'bg-transparent text-neutral-600 border border-neutral-300 hover:border-neutral-500 hover:text-neutral-900 disabled:text-neutral-400',
  danger:    'bg-transparent text-red-600 border border-red-300 hover:bg-red-50 disabled:text-neutral-400',
};

const SIZE: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-[10px] gap-1',
  md: 'px-4 py-2 text-xs gap-1.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-mono uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={size === 'sm' ? 10 : 12} className="animate-spin" />}
      {children}
    </button>
  );
}
