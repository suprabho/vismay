import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'light' | 'dark';
  padded?: boolean;
}

export function Card({ variant = 'light', padded = true, className = '', children, ...rest }: CardProps) {
  const theme =
    variant === 'dark'
      ? 'border border-neutral-800 bg-neutral-900'
      : 'border border-neutral-200 bg-white';
  return (
    <div className={`${theme} ${padded ? 'p-5' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}
