'use client'

import Link from 'next/link'
import { Plus } from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthProvider'
import { useAuthModal } from '@/lib/AuthModalProvider'
import { useFollowedEntities, type FollowedDriver } from '@/lib/useFollowedEntities'
import { useFollows } from '@/lib/usePreferences'
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
      <span className="w-full truncate text-center wdth-dense text-[10px] font-medium text-muted">
        {d.name.split(' ').slice(-1)[0] ?? d.name}
      </span>
    </Link>
  )
}

// Leads the rail while it's showing the curated fallback (logged out, or no
// follows yet): logged-out visitors are asked to sign in, in place, and land
// in onboarding; signed-in users go straight to picking.
function PickYoursRing() {
  const { session, profile } = useAuth()
  const { requireAuth } = useAuthModal()
  // Onboarded users can only re-enter the picker via its edit mode; everyone
  // else (incl. fresh sign-ins, which the modal routes) gets first-run onboarding.
  const dest = profile?.onboarded_at ? '/onboarding/drivers?edit=1' : '/onboarding/drivers'
  return (
    <button
      type="button"
      onClick={() => requireAuth(dest)}
      className="flex w-16 flex-shrink-0 flex-col items-center gap-1"
      aria-label={session ? 'Pick your drivers and teams' : 'Sign in to pick your drivers and teams'}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-accent/70 bg-accent/10 text-accent">
        <Plus size={18} weight="bold" />
      </span>
      <span className="w-full truncate text-center wdth-dense text-[10px] font-medium text-accent">Pick yours</span>
    </button>
  )
}

export function StoryRings() {
  const { drivers, constructors } = useFollowedEntities()
  const { session, loading } = useAuth()
  const follows = useFollows()
  const showPicker = !loading && (!session || (follows.isSuccess && follows.data.length === 0))
  return (
    <div className="-mx-4 px-4">
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {showPicker ? <PickYoursRing /> : null}
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
            <span className="w-full truncate text-center wdth-dense text-[10px] font-medium text-muted">{c.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
