'use client'

import { useMemo, useState } from 'react'
import * as Phosphor from '@phosphor-icons/react'

/** A curated set of Phosphor icon export names for the share-card icon picker.
 *  Football / editorial leaning; the user searches within it. */
export const ICON_NAMES: string[] = [
  'SoccerBall', 'Trophy', 'Medal', 'Crown', 'Flag', 'FlagBanner', 'Target', 'Crosshair',
  'TrendUp', 'TrendDown', 'ChartLine', 'ChartBar', 'Pulse', 'Lightning', 'Fire', 'Star',
  'Sparkle', 'Warning', 'Info', 'CheckCircle', 'XCircle', 'ArrowUp', 'ArrowDown', 'ArrowRight',
  'ArrowLeft', 'ArrowsClockwise', 'CaretRight', 'Globe', 'MapPin', 'Compass', 'Clock', 'Timer',
  'Whistle', 'Cards', 'ShieldCheck', 'Heart', 'ThumbsUp', 'ThumbsDown', 'Megaphone', 'Newspaper',
  'Quotes', 'ChatCircle', 'Eye', 'Rocket', 'Lightbulb', 'Sun', 'Moon', 'Confetti',
]

type PhosphorComponent = React.ComponentType<{ size?: number; weight?: string; color?: string }>

export function IconPicker({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState('')
  const lib = Phosphor as unknown as Record<string, PhosphorComponent | undefined>
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return ICON_NAMES
    return ICON_NAMES.filter((n) => n.toLowerCase().includes(s))
  }, [q])
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search icons…"
        className="mb-1.5 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
      />
      <div className="grid max-h-40 grid-cols-7 gap-1 overflow-y-auto">
        {filtered.map((name) => {
          const Cmp = lib[name]
          return (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onPick(name)}
              className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 text-neutral-200 hover:border-white/30"
            >
              {Cmp ? <Cmp size={18} weight="bold" /> : '?'}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="col-span-7 py-2 text-center text-[11px] text-neutral-600">No icon matches “{q}”.</p>
        )}
      </div>
    </div>
  )
}
