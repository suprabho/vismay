'use client'

import Link from 'next/link'
import { useFollowedEntities, type FollowedDriver } from '@/lib/useFollowedEntities'
import { DriverAvatar } from '@/components/DriverAvatar'
import { TeamBadge } from '@/components/TeamBadge'

function DriverRing({ d }: { d: FollowedDriver }) {
  return (
    <Link
      href={`/story/driver/${d.id}`}
      className="flex w-16 flex-shrink-0 flex-col items-center gap-1"
    >
      <DriverAvatar
        name={d.name}
        code={d.code}
        headshotUrl={d.headshotUrl ?? null}
        accent={d.primaryColor ?? null}
      />
      <span className="w-full truncate text-center text-[10px] text-muted">
        {d.name.split(' ').slice(-1)[0] ?? d.name}
      </span>
    </Link>
  )
}

export function StoryRings() {
  const { drivers, constructors } = useFollowedEntities()
  return (
    <div className="-mx-4 px-4">
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {drivers.map((d) => (
          <DriverRing key={d.id} d={d} />
        ))}
        {constructors.map((c) => (
          <Link
            key={c.id}
            href={`/story/team/${c.id}`}
            className="flex w-16 flex-shrink-0 flex-col items-center gap-1"
          >
            <TeamBadge
              constructorId={c.id}
              name={c.name}
              color={c.primaryColor ?? null}
              logoUrl={c.logoUrl ?? null}
              size="md"
            />
            <span className="w-full truncate text-center text-[10px] text-muted">{c.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
