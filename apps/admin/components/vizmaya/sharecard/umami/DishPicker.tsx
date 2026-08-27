'use client'

import { useEffect, useMemo, useState } from 'react'
import type { UmamiDishLite } from './seeds'

/**
 * Searchable dish picker for umami frame templates. Fetches the trimmed dish
 * canon from `/api/umami/dishes` (imagery stripped server-side — TasteAtlas
 * photos are copyrighted; frames use AI-generated imagery instead) and calls
 * `onPick` so the creator can re-seed the frame with the dish's content.
 */
export function DishPicker({
  label,
  onPick,
  picked,
}: {
  label: string
  onPick: (dish: UmamiDishLite) => void
  picked?: string | null
}) {
  const [dishes, setDishes] = useState<UmamiDishLite[]>([])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || dishes.length > 0) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/umami/dishes')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dishes?: UmamiDishLite[]; error?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (alive) setDishes(body.dishes ?? [])
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load dishes')
      }
    })()
    return () => {
      alive = false
    }
  }, [open, dishes.length])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return dishes
    return dishes.filter(
      (d) => d.name.toLowerCase().includes(needle) || d.cuisine.toLowerCase().includes(needle),
    )
  }, [dishes, q])

  const byCuisine = useMemo(() => {
    const groups = new Map<string, UmamiDishLite[]>()
    for (const d of filtered) {
      const list = groups.get(d.cuisine) ?? []
      list.push(d)
      groups.set(d.cuisine, list)
    }
    return [...groups.entries()]
  }, [filtered])

  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950/60 p-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-[11px] text-neutral-300 hover:text-white"
      >
        <span>
          {label}
          {picked ? <span className="ml-1 text-sky-300">· {picked}</span> : null}
        </span>
        <span className="text-neutral-500">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes…"
            className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {byCuisine.map(([cuisine, list]) => (
              <div key={cuisine}>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">{cuisine}</p>
                <div className="space-y-0.5">
                  {list.map((d) => (
                    <button
                      key={d.slug}
                      type="button"
                      onClick={() => {
                        onPick(d)
                        setOpen(false)
                      }}
                      className={`block w-full truncate rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                        picked === d.name ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {d.name}
                      {d.rating != null && <span className="ml-1 text-neutral-500">★ {d.rating.toFixed(1)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!error && dishes.length === 0 && <p className="text-[11px] text-neutral-500">Loading…</p>}
            {dishes.length > 0 && filtered.length === 0 && (
              <p className="text-[11px] text-neutral-500">No dishes match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
