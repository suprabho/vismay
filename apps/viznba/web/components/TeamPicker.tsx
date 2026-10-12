'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from '@phosphor-icons/react'
import { TEAMS_COOKIE, writeCookie } from '@/lib/prefsShared'
import type { Team } from '@/lib/teams'
import { TeamBadge } from './ui'

export function TeamPicker({ teams, initial }: { teams: Team[]; initial: string[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<string[]>(initial)
  const [, startTransition] = useTransition()

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    setPicked(next)
    writeCookie(TEAMS_COOKIE, next.join(','))
    startTransition(() => router.refresh())
  }

  return (
    <>
      <p className="font-mono text-[11px] text-muted">{picked.length} followed</p>
      <ul className="grid grid-cols-2 gap-2">
        {teams.map((t) => {
          const on = picked.includes(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t.id)}
                className="flex min-h-14 w-full items-center gap-2.5 rounded-[14px] border bg-surface px-3 text-left"
                style={{ borderColor: on ? `color-mix(in srgb, ${t.dot} 60%, transparent)` : 'var(--color-border)' }}
              >
                <TeamBadge team={t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                  <span className="block truncate text-[10.5px] text-muted">{t.location}</span>
                </span>
                <span
                  className={`flex size-5 flex-none items-center justify-center rounded-full ${on ? 'bg-accent text-accent-ink' : 'border border-border-strong'}`}
                >
                  {on && <Check size={12} weight="bold" />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
