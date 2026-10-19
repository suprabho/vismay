'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Trophy } from '@phosphor-icons/react'
import type { CompetitionStyleOption } from '@vismay/html-stories/styles'

const SWATCHES = ['background', 'surface', 'text', 'accent', 'accent2', 'teal'] as const

/**
 * "Competition style" for the footshorts brief: a menu of the competitions
 * whose palette and fonts were set in the Asset Studio (`entities.story_style`).
 * Picking one hands the brief that competition's look instead of the house
 * style or a random draw; `selected` is the slug in use, if any.
 */
export function CompetitionStylePicker({
  options,
  selected,
  onPick,
  className,
}: {
  options: CompetitionStyleOption[]
  selected: string | null
  onPick: (option: CompetitionStyleOption) => void
  className: string
}) {
  const [open, setOpen] = useState(false)
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

  const empty = options.length === 0
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={empty}
        aria-expanded={open}
        aria-haspopup="menu"
        title={empty ? 'No competition styles yet: set one in the Asset Studio (Leagues)' : "Use a competition's palette and fonts from the Asset Studio"}
        className={className}
      >
        <Trophy size={14} />
        Competition style
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-white/10 bg-neutral-950 p-1 shadow-xl"
        >
          {options.map((o) => {
            const on = o.slug === selected
            return (
              <button
                key={o.slug}
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
          })}
        </div>
      )}
    </div>
  )
}
