'use client'

import { Info, Warning } from '@phosphor-icons/react'
import type { Issue } from '@/lib/seasonBooks/plan'
import { ROLE_META, TEMPLATES, type TemplateId } from '@/lib/seasonBooks/system'

export const INPUT = 'w-full rounded-md border border-white/15 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-white/40 focus:outline-none disabled:opacity-50'
export const SELECT = 'rounded-md border border-white/15 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:border-white/40 focus:outline-none disabled:opacity-50'
export const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent'
export const PRIMARY = 'inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:opacity-50'
export const ICON_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent'
export const LABEL = 'mb-1 block text-[11px] font-medium uppercase tracking-wider text-neutral-500'
export const PANEL = 'rounded-xl border border-white/10 bg-white/[0.02]'

export function RoleBadge({ template, number }: { template: TemplateId; number?: number }) {
  const role = ROLE_META[TEMPLATES[template].role]
  return (
    <span title={`${TEMPLATES[template].label} · ${role.label}`}
      className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums ${role.className}`}>
      {number ?? role.letter}
    </span>
  )
}

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: string }) {
  if (!issues.length) return empty ? <p className="text-sm text-emerald-400">{empty}</p> : null
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, i) => (
        <li key={i} className={`flex gap-2 text-sm ${issue.severity === 'warn' ? 'text-amber-300' : 'text-neutral-400'}`}>
          {issue.severity === 'warn'
            ? <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
            : <Info size={16} className="mt-0.5 shrink-0" />}
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function WordMeter({ words, min, max }: { words: number; min: number; max: number }) {
  const ok = words >= min && words <= max
  const pct = Math.min(100, (words / Math.max(max, 1)) * 100)
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      <div className="relative h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
        <div className={`absolute inset-y-0 left-0 ${ok ? 'bg-emerald-400' : words > max ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
        {min > 0 && <div className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${(min / max) * 100}%` }} />}
      </div>
      <span className={ok ? 'text-emerald-400' : 'text-neutral-400'}>{words} / {min}–{max} words</span>
    </div>
  )
}
