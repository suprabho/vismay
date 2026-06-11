'use client'

import type { ReactNode } from 'react'

/**
 * Shared presentational atoms for the compose flow. Pure styling — no state,
 * no data fetching — so the flow's colour language stays consistent:
 * emerald = done/accepted, amber = in flight, red = failed/rejected,
 * sky = primary/selected, neutral = metadata.
 */

export type ChipTone = 'neutral' | 'emerald' | 'amber' | 'red' | 'sky' | 'violet' | 'teal'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-white/10 bg-white/5 text-neutral-400',
  emerald: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  amber: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  red: 'border-red-500/30 bg-red-500/15 text-red-300',
  sky: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  violet: 'border-violet-500/30 bg-violet-500/15 text-violet-300',
  teal: 'border-teal-500/30 bg-teal-500/15 text-teal-300',
}

/** A small status/metadata pill. Renders a button when `onClick` is given
 *  (e.g. the outline status cycle) — otherwise a plain span. */
export function Chip({
  tone = 'neutral',
  children,
  title,
  onClick,
  className = '',
}: {
  tone?: ChipTone
  children: ReactNode
  title?: string
  onClick?: () => void
  className?: string
}) {
  const cls = `inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[10px] font-medium uppercase tracking-wide ${CHIP_TONES[tone]} ${className}`
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${cls} cursor-pointer transition-shadow hover:ring-1 hover:ring-white/30`}
      >
        {children}
      </button>
    )
  }
  return (
    <span title={title} className={cls}>
      {children}
    </span>
  )
}

/** Consistent section header: small-caps title, muted count, optional hint
 *  line right-aligned (wraps under at drawer width). */
export function SectionHeading({
  title,
  count,
  hint,
}: {
  title: string
  count?: ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
      <h3 className="flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
        {title}
        {count !== undefined && (
          <span className="font-normal normal-case tracking-normal text-neutral-500">{count}</span>
        )}
      </h3>
      {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
    </div>
  )
}

/** Labelled detail inside an expanded card (expected content / visual / …). */
export function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-neutral-300">{children}</div>
    </div>
  )
}

/** The accordion affordance — rotates to point down when open. */
export function Caret({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block text-[10px] leading-none text-neutral-500 transition-transform ${
        open ? 'rotate-90' : ''
      }`}
    >
      ▸
    </span>
  )
}

/** Inline banner (error / archived / attached notices). */
export function Notice({
  tone,
  children,
}: {
  tone: 'emerald' | 'amber' | 'red'
  children: ReactNode
}) {
  const tones: Record<'emerald' | 'amber' | 'red', string> = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    red: 'border-red-500/40 bg-red-500/10 text-red-300',
  }
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  )
}

// ── Shared form-control classes ─────────────────────────────────────────────
export const inputCls =
  'rounded-md border border-white/10 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus:border-sky-400/50'
export const btnGhostCls =
  'rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/30 hover:text-neutral-100 disabled:opacity-40'
export const btnPrimaryCls =
  'rounded-md bg-sky-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-400 disabled:opacity-40'
export const btnSuccessCls =
  'rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-400 disabled:opacity-40'
/** Tiny square icon button (reorder arrows, accordion toggle, remove ✕). */
export const iconBtnCls =
  'rounded p-0.5 leading-none text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-500'
