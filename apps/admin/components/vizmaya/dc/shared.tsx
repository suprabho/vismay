'use client'

// Small helpers shared by the DC Pipeline and DC Recaps admin tabs.

export function isStale(iso: string | null | undefined, hours: number): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() > hours * 3_600_000
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}

export function Badge({
  children,
  accent = false,
  onClick,
}: {
  children: React.ReactNode
  accent?: boolean
  onClick?: () => void
}) {
  const cls =
    'text-[10px] font-mono px-1.5 py-0.5 rounded border ' +
    (accent ? 'text-sky-300 border-sky-300/20 bg-sky-300/5' : 'text-neutral-400 border-white/10 bg-white/[0.03]')
  if (!onClick) return <span className={cls}>{children}</span>
  return (
    <button type="button" onClick={onClick} className={`${cls} hover:border-white/30 cursor-pointer`}>
      {children}
    </button>
  )
}
