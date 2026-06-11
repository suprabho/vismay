'use client'

import type { ComposeAngle } from '@vismay/content-source/composeState'

/**
 * One candidate angle as a selectable card: title prominent, thesis as body,
 * rationale revealed on selection. The radio input is kept (sr-only) so
 * keyboard selection still works; the card itself is the label.
 */
export function AngleCard({
  angle,
  selected,
  onPick,
}: {
  angle: ComposeAngle
  selected: boolean
  onPick: () => void
}) {
  return (
    <label
      className={`group block cursor-pointer rounded-lg border p-3 transition-colors ${
        selected
          ? 'border-sky-400/60 bg-sky-500/10 ring-1 ring-sky-400/30'
          : 'border-white/10 bg-neutral-900/40 hover:border-white/25 hover:bg-neutral-900/70'
      }`}
    >
      <input type="radio" name="compose-angle" checked={selected} onChange={onPick} className="sr-only" />
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold leading-snug text-neutral-100">{angle.title}</div>
        <span
          aria-hidden
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] leading-none transition-colors ${
            selected
              ? 'border-sky-400 bg-sky-500 text-white'
              : 'border-white/20 text-transparent group-hover:border-white/40'
          }`}
        >
          ✓
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">{angle.thesis}</p>
      {selected && angle.rationale && (
        <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-neutral-500">
          <span className="font-medium text-neutral-400">Why this angle — </span>
          {angle.rationale}
        </p>
      )}
    </label>
  )
}
