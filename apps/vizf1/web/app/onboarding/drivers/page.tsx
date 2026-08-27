'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { EntityChip } from '@vismay/f1-viz/web'
import { BackButton } from '@/components/BackButton'
import { useAllDrivers } from '@/lib/useCatalog'
import { useFollowMutation, useFollows } from '@/lib/usePreferences'

const MIN_DRIVERS = 3

function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function OnboardingDriversInner() {
  const router = useRouter()
  const params = useSearchParams()
  const edit = params.get('edit')
  const { data: drivers, isLoading } = useAllDrivers()
  const { data: follows } = useFollows()
  const { follow, unfollow } = useFollowMutation()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [initial, setInitial] = useState<Set<string>>(new Set())
  const [seeded, setSeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  // Seed `picked`/`initial` from existing follows once the catalog (and, in edit
  // mode, follows) arrive. Render-time setState is React's canonical idiom for
  // one-shot init from async data — avoids the cascading-renders effect rule.
  if (!seeded && drivers && (!edit || follows)) {
    if (edit && follows) {
      const followed = new Set(
        follows.filter((f) => f.entity_type === 'driver').map((f) => f.entity_id),
      )
      const seed = new Set(drivers.filter((d) => followed.has(d.id)).map((d) => d.id))
      setPicked(seed)
      setInitial(seed)
    }
    setSeeded(true)
  }

  const filtered = useMemo(() => {
    const list = drivers ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.code ?? '').toLowerCase().includes(q),
    )
  }, [drivers, query])

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function next() {
    setBusy(true)
    const toFollow = Array.from(picked).filter((id) => !initial.has(id))
    const toUnfollow = Array.from(initial).filter((id) => !picked.has(id))
    await Promise.all([
      ...toFollow.map((id) => follow.mutateAsync({ type: 'driver', id })),
      ...toUnfollow.map((id) => unfollow.mutateAsync({ type: 'driver', id })),
    ])
    setBusy(false)
    const qs = new URLSearchParams()
    if (edit) qs.set('edit', '1')
    const suffix = qs.toString()
    router.push(`/onboarding/constructors${suffix ? `?${suffix}` : ''}`)
  }

  if (isLoading) return <PageSpinner />

  const canContinue = picked.size >= MIN_DRIVERS

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <div className="px-6 pt-8">
        {edit ? <BackButton className="mb-4" /> : null}
        <h1 className="mb-1 text-3xl font-bold text-text">Pick your drivers</h1>
        <p className="mb-4 text-sm text-muted">
          Choose at least {MIN_DRIVERS}. ({picked.size} selected)
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search drivers"
          className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex flex-wrap">
          {filtered.map((d) => (
            <EntityChip
              key={d.id}
              name={d.name}
              imageUrl={d.headshotUrl}
              code={d.code}
              selected={picked.has(d.id)}
              onClick={() => toggle(d.id)}
            />
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">No drivers match your search.</p>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-bg px-6 py-4">
        <button
          type="button"
          onClick={next}
          disabled={!canContinue || busy}
          className={`w-full rounded-lg py-3 font-semibold ${
            canContinue && !busy ? 'bg-accent text-accent-text' : 'bg-surface text-muted'
          }`}
        >
          {busy ? '…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

export default function OnboardingDrivers() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <OnboardingDriversInner />
    </Suspense>
  )
}
