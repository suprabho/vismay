'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MealPlan } from '@vismay/content-source/epics'

const INSTRUCTIONS_KEY = 'nashta:instructions'
const DEFAULT_INSTRUCTIONS =
  '2 adults. Vegetarian breakfast, ready in about 40 minutes. Light on oil. We drink chai every morning.'

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function NashtaClient({ initialPlans }: { initialPlans: MealPlan[] }) {
  const router = useRouter()
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem(INSTRUCTIONS_KEY)
    if (saved) setInstructions(saved)
  }, [])

  async function suggest() {
    const text = instructions.trim()
    if (!text || busy) return
    window.localStorage.setItem(INSTRUCTIONS_KEY, text)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/nashta/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: text }),
      })
      const json = (await res.json()) as { plan?: MealPlan; error?: string }
      if (!res.ok || !json.plan) throw new Error(json.error ?? `suggest failed (${res.status})`)
      router.push(`/nashta/plan/${json.plan.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'suggest failed')
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Nashta 🍳</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Tell it how tomorrow morning looks — it suggests three breakfast combinations from
            6,800+ Indian recipes, then builds your shopping list and Hindi how-to videos.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <label className="block text-xs uppercase tracking-wider text-neutral-400">
            Basic instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            disabled={busy}
            className="w-full resize-y rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm leading-relaxed outline-none focus:border-orange-400/60 disabled:opacity-60"
            placeholder="Who's eating, time budget, veg/non-veg, anything to avoid or use up…"
          />
          <div className="flex items-center gap-4">
            <button
              onClick={suggest}
              disabled={busy || !instructions.trim()}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Planning tomorrow's nashta…" : 'Suggest for tomorrow'}
            </button>
            {busy && (
              <span className="text-sm text-neutral-400 animate-pulse">
                reading the recipe corpus, pairing combinations…
              </span>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-neutral-400">Past plans</h2>
          {initialPlans.length === 0 ? (
            <p className="text-sm text-neutral-500">No plans yet — tomorrow's breakfast starts above.</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {initialPlans.map((p) => {
                const combo = p.selectedIndex != null ? p.suggestions[p.selectedIndex] : null
                return (
                  <li key={p.id}>
                    <Link
                      href={`/nashta/plan/${p.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/5 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">
                          {combo ? combo.title : 'Choosing…'}
                        </span>
                        <span className="block text-xs text-neutral-500 truncate">
                          {combo
                            ? combo.items.map((i) => i.title.replace(/ Recipe.*$/i, '')).join(' · ')
                            : p.instructions}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs text-neutral-400">{formatDate(p.planDate)}</span>
                        <span
                          className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                            p.status === 'finalized'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {p.status}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
