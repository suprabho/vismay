'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { EntityChip } from '@vismay/f1-viz/web'
import { BackButton } from '@/components/BackButton'
import { useAllConstructors, useAllDrivers } from '@/lib/useCatalog'
import { useFollowMutation, useFollows } from '@/lib/usePreferences'

export default function FollowingPage() {
  const { data: follows, isLoading } = useFollows()
  const { data: drivers } = useAllDrivers()
  const { data: constructors } = useAllConstructors()
  const { unfollow } = useFollowMutation()

  const driverById = useMemo(() => new Map((drivers ?? []).map((d) => [d.id, d])), [drivers])
  const constructorById = useMemo(
    () => new Map((constructors ?? []).map((c) => [c.id, c])),
    [constructors],
  )

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  const followedDrivers = (follows ?? []).filter((f) => f.entity_type === 'driver')
  const followedConstructors = (follows ?? []).filter((f) => f.entity_type === 'constructor')

  return (
    <main className="mx-auto max-w-2xl px-6 py-6">
      <BackButton className="mb-4" />
      <h1 className="mb-6 text-2xl font-bold text-text">Following</h1>

      <Link
        href="/onboarding/drivers?edit=1"
        className="mb-6 block rounded-lg border border-border py-3 text-center font-semibold text-text hover:border-muted"
      >
        Edit preferences
      </Link>

      <p className="mb-6 text-sm text-muted">Tap to unfollow.</p>

      {followedDrivers.length > 0 ? (
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Drivers · {followedDrivers.length}
          </p>
          <div className="flex flex-wrap">
            {followedDrivers.map((f) => {
              const d = driverById.get(f.entity_id)
              return (
                <EntityChip
                  key={f.entity_id}
                  name={d?.name ?? f.entity_id}
                  imageUrl={d?.headshotUrl ?? null}
                  code={d?.code ?? null}
                  selected
                  onClick={() => unfollow.mutate({ type: 'driver', id: f.entity_id })}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      {followedConstructors.length > 0 ? (
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Teams · {followedConstructors.length}
          </p>
          <div className="flex flex-wrap">
            {followedConstructors.map((f) => {
              const c = constructorById.get(f.entity_id)
              return (
                <EntityChip
                  key={f.entity_id}
                  name={c?.name ?? f.entity_id}
                  imageUrl={c?.logoUrl ?? null}
                  selected
                  onClick={() => unfollow.mutate({ type: 'constructor', id: f.entity_id })}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      {(!follows || follows.length === 0) && (
        <p className="text-sm text-muted">You&apos;re not following anyone yet.</p>
      )}
    </main>
  )
}
