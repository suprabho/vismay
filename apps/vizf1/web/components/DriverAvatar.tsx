'use client'

type Props = {
  name: string
  code?: string | null
  headshotUrl?: string | null
  accent?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const SIZE = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-9 w-9 text-[10px]',
  md: 'h-12 w-12 text-xs',
  lg: 'h-20 w-20 text-base',
}

export function DriverAvatar({ name, code, headshotUrl, accent, size = 'md' }: Props) {
  const initials = code ?? name.split(' ').map((p) => p[0]).slice(0, 2).join('')
  const ring = accent ?? 'var(--color-accent)'
  if (headshotUrl) {
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${SIZE[size]}`}
        style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={headshotUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 font-semibold text-text ${SIZE[size]}`}
      style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
    >
      {initials}
    </span>
  )
}
