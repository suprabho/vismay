'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Palette } from '@phosphor-icons/react'
import type { EntityStyleKind, EntityStyleOption } from '@vismay/html-stories/styles'

const SWATCHES = ['background', 'surface', 'text', 'accent', 'accent2', 'teal'] as const
const KIND_LABELS: Record<EntityStyleKind, string> = { competition: 'Competitions', team: 'Teams' }

/**
 * "Story style" for the footshorts brief: a menu of the competitions and teams
 * whose palette and fonts were set in the Asset Studio (`entities.story_style`),
 * split into two tabs with a name filter. Picking one hands the brief that
 * look instead of the house style or a random draw; `selected` is the option
 * in use, if any.
 */
export function StoryStylePicker({
  options,
  selected,
  onPick,
  className,
}: {
  options: EntityStyleOption[]
  selected: { kind: EntityStyleKind; slug: string } | null
  onPick: (option: EntityStyleOption) => void
  className: string
}) {
  const [open, setOpen] = useState(false)
  const counts = useMemo(
    () => ({
      competition: options.filter((o) => o.kind === 'competition').length,
      team: options.filter((o) => o.kind === 'team').length,
    }),
    [options],
  )
  const [kind, setKind] = useState<EntityStyleKind>(selected?.kind ?? (counts.competition ? 'competition' : 'team'))
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = options.filter((o) => o.kind === kind && (!q || o.name.toLowerCase().includes(q)))
  const empty = options.length === 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={empty}
        aria-expanded={open}
        aria-haspopup="menu"
        title={
          empty
            ? 'No team or competition styles yet: set one in the Asset Studio'
            : "Use a competition's or team's palette and fonts from the Asset Studio"
        }
        className={className}
      >
        <Palette size={14} />
        Story style
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-white/10 bg-neutral-950 p-1.5 shadow-xl">
          <div className="flex gap-0.5 rounded-md border border-white/10 p-0.5 text-xs">
            {(['competition', 'team'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`flex-1 rounded px-2 py-1 transition-colors ${
                  kind === k ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {KIND_LABELS[k]} <span className="text-neutral-500">{counts[k]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${KIND_LABELS[kind].toLowerCase()}…`}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-white/30 focus:outline-none"
          />
          <div role="menu" className="mt-1 max-h-72 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-2 py-3 text-xs text-neutral-500">
                {counts[kind] ? 'No match.' : `No ${kind} styles yet: set one in the Asset Studio.`}
              </p>
            ) : (
              shown.map((o) => {
                const on = o.kind === selected?.kind && o.slug === selected.slug
                return (
                  <button
                    key={`${o.kind}:${o.slug}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      onPick(o)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                      on ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                      {o.crestUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.crestUrl} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <span className="text-[10px] text-neutral-400">{o.name.charAt(0)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-100">{o.name}</span>
                      <span className="block truncate text-[11px] text-neutral-500">
                        {o.style.fonts.serif} · {o.style.fonts.sans}
                      </span>
                    </span>
                    <span className="flex shrink-0">
                      {SWATCHES.map((k) => (
                        <span
                          key={k}
                          className="-ml-1 h-3 w-3 rounded-full border border-white/20 first:ml-0"
                          style={{ background: o.style.palette[k] }}
                        />
                      ))}
                    </span>
                    {on && <Check size={12} className="shrink-0 text-emerald-400" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
