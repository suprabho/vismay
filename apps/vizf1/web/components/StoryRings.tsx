'use client'

import Link from 'next/link'
import { useFollowedEntities } from '@/lib/useFollowedEntities'

function Ring({
  href,
  label,
  sub,
  accent,
}: {
  href: string
  label: string
  sub: string
  accent: string
}) {
  return (
    <Link href={href} className="flex w-16 flex-shrink-0 flex-col items-center gap-1">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 text-xs font-semibold text-text"
        style={{ borderColor: accent, backgroundColor: 'var(--color-surface)' }}
      >
        {sub}
      </span>
      <span className="w-full truncate text-center text-[10px] text-muted">{label}</span>
    </Link>
  )
}

export function StoryRings() {
  const { drivers, constructors } = useFollowedEntities()
  // F1's signature red — used as a default ring tint while we don't have
  // per-driver accents wired.
  const driverAccent = 'var(--color-accent)'

  return (
    <div className="-mx-4 px-4">
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {drivers.map((d) => (
          <Ring
            key={d.id}
            href={`/driver/${d.id}`}
            label={d.name.split(' ').slice(-1)[0] ?? d.name}
            sub={d.code}
            accent={driverAccent}
          />
        ))}
        {constructors.map((c) => (
          <Ring
            key={c.id}
            href={`/team/${c.id}`}
            label={c.name}
            sub={c.name.slice(0, 3).toUpperCase()}
            accent="var(--color-border)"
          />
        ))}
      </div>
    </div>
  )
}
