'use client'

import type { ComposeStage } from './useComposeFlow'

/**
 * The stage tab bar. Each pipeline stage is a tab; stages unlock as the draft
 * progresses (angles after the first generation, content after materialise)
 * and stay freely navigable once unlocked — going back to Sources to add a
 * link mid-outline is the normal flow, not an error.
 */

const TABS: Array<{ id: ComposeStage; label: string }> = [
  { id: 'sources', label: 'Sources' },
  { id: 'angles', label: 'Angles' },
  { id: 'outline', label: 'Outline' },
  { id: 'content', label: 'Content' },
]

export function StageTabs({
  tab,
  onSelect,
  unlocked,
  counts,
}: {
  tab: ComposeStage
  onSelect: (tab: ComposeStage) => void
  unlocked: Record<ComposeStage, boolean>
  counts: Partial<Record<ComposeStage, number>>
}) {
  return (
    <div role="tablist" className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
      {TABS.map((t) => {
        const active = tab === t.id
        const enabled = unlocked[t.id]
        const count = counts[t.id]
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!enabled}
            onClick={() => onSelect(t.id)}
            className={`flex-1 rounded-md px-1 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider transition-colors ${
              active
                ? 'bg-sky-500/20 text-sky-300'
                : enabled
                  ? 'text-neutral-400 hover:bg-white/10 hover:text-neutral-200'
                  : 'cursor-default text-neutral-700'
            }`}
          >
            {t.label}
            {typeof count === 'number' && count > 0 && (
              <span className={`ml-1 font-normal ${active ? 'text-sky-400/80' : 'text-neutral-600'}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
