'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { EntityChip } from '@vismay/f1-viz/web'
import { BackButton } from '@/components/BackButton'
import { useAuth } from '@/lib/AuthProvider'
import { supabaseAuth } from '@/lib/supabaseAuth'
import { useAllConstructors } from '@/lib/useCatalog'
import { useFollowMutation, useFollows } from '@/lib/usePreferences'

const MIN_CONSTRUCTORS = 2

function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function OnboardingConstructorsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const edit = params.get('edit')
  const { session, refreshProfile } = useAuth()
  const { data: constructors, isLoading } = useAllConstructors()
  const { data: follows } = useFollows()
  const { follow, unfollow } = useFollowMutation()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [initial, setInitial] = useState<Set<string>>(new Set())
  const [seeded, setSeeded] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!seeded && constructors && (!edit || follows)) {
    if (edit && follows) {
      const followed = new Set(
        follows.filter((f) => f.entity_type === 'constructor').map((f) => f.entity_id),
      )
      const seed = new Set(constructors.filter((c) => followed.has(c.id)).map((c) => c.id))
      setPicked(seed)
      setInitial(seed)
    }
    setSeeded(true)
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function finish() {
    if (!session) return
    setBusy(true)
    const toFollow = Array.from(picked).filter((id) => !initial.has(id))
    const toUnfollow = Array.from(initial).filter((id) => !picked.has(id))
    await Promise.all([
      ...toFollow.map((id) => follow.mutateAsync({ type: 'constructor', id })),
      ...toUnfollow.map((id) => unfollow.mutateAsync({ type: 'constructor', id })),
    ])
    if (!edit) {
      await supabaseAuth()
        .from('vizf1_profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', session.user.id)
      await refreshProfile()
    }
    setBusy(false)
    router.replace(edit ? '/following' : '/feed')
  }

  if (isLoading) return <PageSpinner />

  const canFinish = picked.size >= MIN_CONSTRUCTORS

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <div className="px-6 pt-8">
        <BackButton className="mb-4" />
        <h1 className="mb-1 text-3xl font-bold text-text">Pick your teams</h1>
        <p className="mb-4 text-sm text-muted">
          Choose at least {MIN_CONSTRUCTORS}. ({picked.size} selected)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex flex-wrap">
          {constructors?.map((c) => (
            <EntityChip
              key={c.id}
              name={c.name}
              imageUrl={c.logoUrl}
              selected={picked.has(c.id)}
              onClick={() => toggle(c.id)}
            />
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-bg px-6 py-4">
        <button
          type="button"
          onClick={finish}
          disabled={!canFinish || busy}
          className={`w-full rounded-lg py-3 font-semibold ${
            canFinish && !busy ? 'bg-accent text-accent-text' : 'bg-surface text-muted'
          }`}
        >
          {busy ? '…' : edit ? 'Save' : 'Finish'}
        </button>
      </div>
    </div>
  )
}

export default function OnboardingConstructors() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <OnboardingConstructorsInner />
    </Suspense>
  )
}
