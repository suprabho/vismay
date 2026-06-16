import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  hint?: string;
  action?: ReactNode;
  variant?: 'light' | 'dark';
  className?: string;
}

export function EmptyState({ icon: Icon, message, hint, action, variant = 'light', className = '' }: EmptyStateProps) {
  const border = variant === 'dark' ? 'border-neutral-800' : 'border-neutral-200';
  const iconColor = variant === 'dark' ? 'text-neutral-700' : 'text-neutral-300';
  const textColor = variant === 'dark' ? 'text-neutral-600' : 'text-neutral-500';
  return (
    <div className={`flex flex-col items-center justify-center py-16 border border-dashed ${border} ${className}`}>
      {Icon && <Icon size={28} className={`${iconColor} mb-3`} />}
      <p className={`font-mono text-xs ${textColor}`}>{message}</p>
      {hint && <p className={`font-mono text-[10px] mt-1 ${textColor} opacity-70`}>{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
