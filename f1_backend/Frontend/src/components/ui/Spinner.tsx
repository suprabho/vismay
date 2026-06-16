import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className = '' }: SpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Loader2 size={size} className="animate-spin text-neutral-500" />
      {label && <span className="font-mono text-xs text-neutral-500">{label}</span>}
    </span>
  );
}
