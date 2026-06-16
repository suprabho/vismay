import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  /** Tailwind color classes (text/bg/border) — use helpers from ui/colors.ts */
  tone?: string;
  className?: string;
}

/** The bordered mono uppercase chip used across admin + race UI. */
export function Badge({ children, tone = 'text-neutral-500 bg-neutral-100 border-neutral-200', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 border font-mono text-[9px] uppercase tracking-wider ${tone} ${className}`}
    >
      {children}
    </span>
  );
}
