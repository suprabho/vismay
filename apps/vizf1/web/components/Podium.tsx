import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'

export type PodiumEntry = {
  id: string
  position: number
  name: string
  subtitle: string
  color: string | null
  avatar: ReactNode
  value: ReactNode
  detail?: ReactNode
  href: string
}

/** Keep the winning step in the center, even while a result is incomplete. */
export function Podium({ entries, label }: { entries: PodiumEntry[]; label: string }) {
  return (
    <div className="grid grid-cols-3 items-end gap-1.5 px-3 pt-6 sm:gap-2 sm:px-5" role="group" aria-label={label}>
      {[2, 1, 3].map((position) => {
        const entry = entries.find((item) => item.position === position)
        const height = position === 1 ? 'min-h-36' : position === 2 ? 'min-h-28' : 'min-h-24'
        return (
          <div key={position} className="min-w-0 text-center" style={{ '--podium-color': entry?.color ?? 'var(--color-border)' } as CSSProperties}>
            <div className="flex min-h-28 flex-col items-center justify-end gap-2 pb-3">
              {entry ? (
                <Link href={entry.href} className="flex w-full min-w-0 flex-col items-center gap-2 rounded-md hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                  {entry.avatar}
                  <span className="wdth-dense text-xs leading-snug font-semibold break-words text-text sm:text-sm">{entry.name}</span>
                  <span className="wdth-dense text-[11px] font-medium leading-snug break-words text-muted">{entry.subtitle}</span>
                </Link>
              ) : <span className="text-xs text-muted">Awaiting result</span>}
            </div>
            <div
              className={`${height} rounded-t-md border-t-[3px] px-1 py-3`}
              style={{ borderColor: 'var(--podium-color)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--podium-color) 14%, var(--color-surface)), var(--color-surface))' }}
            >
              <span className={`block wdth-display text-2xl leading-none font-extrabold italic ${position === 1 ? 'text-text' : 'text-muted'}`}><span className="sr-only">Position </span>{position}</span>
              <div className="mt-2 font-mono text-sm font-bold tabular-nums text-text">{entry?.value ?? '—'}</div>
              {entry?.detail != null && <div className="mt-1 text-[11px] text-muted">{entry.detail}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PodiumMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className="flex min-h-48 items-center justify-center p-5 text-center text-sm text-muted">{children}</div>
}
