'use client'

import { useState } from 'react'
import type { ComposeFormat, ComposeOutlineEntry } from '@vismay/content-source/composeState'
import { LayoutPreview } from './LayoutPreview'
import { Chip, DetailBlock, btnGhostCls, iconBtnCls, inputCls, type ChipTone } from './ui'

const STATUS_TONE: Record<ComposeOutlineEntry['status'], ChipTone> = {
  accepted: 'emerald',
  rejected: 'red',
  pending: 'neutral',
}

/**
 * One planned section as a card: numbered heading, chips for status (the
 * accept/reject cycle button when editable) / kind / layout / beats, intent as
 * a subline, and an accordion with the planned expected-content, visual,
 * context, map geography and sub-beats. At the outline stage the layout
 * wireframe shows what the section will look like before materialising.
 */
export function OutlineEntryCard({
  entry: e,
  index,
  total,
  open,
  format,
  statusEditable,
  outlineEditable,
  busy,
  regenBusy,
  onCycleStatus,
  onToggle,
  onMove,
  onRegenerate,
}: {
  entry: ComposeOutlineEntry
  index: number
  total: number
  open: boolean
  format: ComposeFormat
  /** Status chip cycles pending → accepted → rejected (unmaterialised only). */
  statusEditable: boolean
  /** Reorder arrows + per-slide regenerate — outline stage of a live draft only. */
  outlineEditable: boolean
  /** A single-flight pipeline call is in progress (any outline op). */
  busy?: boolean
  /** This card's regenerate call is the one in flight. */
  regenBusy?: boolean
  onCycleStatus: () => void
  onToggle: () => void
  onMove: (dir: -1 | 1) => void
  /** Regenerate just this slide, with an optional steering note. */
  onRegenerate?: (feedback?: string) => Promise<boolean>
}) {
  const [regenOpen, setRegenOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const hasDetail = Boolean(
    e.visual ||
      e.context ||
      e.expectedContent ||
      e.subsections?.length ||
      e.geo ||
      e.regionRequirement,
  )
  const statusTone = STATUS_TONE[e.status]
  // Regenerate is a STRUCTURE edit, so it's offered only on a live, not-yet-
  // materialised slide (a regenerated stub would desync from written prose).
  const canRegen = outlineEditable && !e.sectionId && !!onRegenerate

  async function regenerate() {
    if (!onRegenerate) return
    if (await onRegenerate(feedback.trim() || undefined)) {
      setFeedback('')
      setRegenOpen(false)
    }
  }

  return (
    <li className="rounded-lg border border-white/10 bg-neutral-900/60 p-3">
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-mono text-[10px] leading-5 text-neutral-600">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h4 className="min-w-0 flex-1 text-sm font-medium leading-5 text-neutral-100">
          {e.heading}
        </h4>
        <div className="flex shrink-0 items-center gap-0.5">
          {outlineEditable && (
            <>
              <button
                onClick={() => onMove(-1)}
                disabled={index === 0}
                className={iconBtnCls}
                title="Move up"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                className={iconBtnCls}
                title="Move down"
                aria-label="Move down"
              >
                ↓
              </button>
            </>
          )}
          {canRegen && (
            <button
              onClick={() => setRegenOpen((v) => !v)}
              disabled={busy}
              className={iconBtnCls}
              aria-expanded={regenOpen}
              title="Regenerate this slide"
              aria-label="Regenerate this slide"
            >
              <span className={regenBusy ? 'inline-block animate-spin' : undefined}>↻</span>
            </button>
          )}
          {hasDetail && (
            <button
              onClick={onToggle}
              className={iconBtnCls}
              aria-expanded={open}
              title={open ? 'Hide details' : 'Show context, content & visual'}
            >
              {open ? '▾' : '▸'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {statusEditable && !e.sectionId ? (
          <Chip
            tone={statusTone}
            onClick={onCycleStatus}
            title="Click to cycle pending → accepted → rejected"
          >
            {e.status}
          </Chip>
        ) : (
          <Chip tone={statusTone} title={e.sectionId ? 'Already materialised' : undefined}>
            {e.status}
          </Chip>
        )}
        <Chip>{e.kind}</Chip>
        {e.layout && (
          <Chip tone="sky" title="Planned deck layout">
            {e.layout}
          </Chip>
        )}
        {!!e.subsections?.length && (
          <Chip tone="teal" title="Sub-beats sharing this section's map context">
            ⤷ {e.subsections.length} beats
          </Chip>
        )}
      </div>

      <p className={`mt-1.5 text-xs leading-relaxed text-neutral-400 ${open ? '' : 'line-clamp-2'}`}>
        {e.intent}
      </p>

      {/* Layout demo — a wireframe of what this section will look like, shown
          before you materialise it. */}
      {outlineEditable && (
        <div className="mt-2">
          <LayoutPreview layout={e.layout} format={format} />
        </div>
      )}

      {/* Per-slide regenerate: a fresh take on just this section, with an
          optional steering note. Leaves the rest of the outline untouched. */}
      {canRegen && regenOpen && (
        <div className="mt-2 flex gap-1.5">
          <input
            value={feedback}
            onChange={(ev) => setFeedback(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !busy) regenerate()
            }}
            placeholder="Regenerate this slide with a note (optional)…"
            disabled={busy}
            autoFocus
            className={`min-w-0 flex-1 ${inputCls}`}
          />
          <button onClick={regenerate} disabled={busy} className={`shrink-0 ${btnGhostCls}`}>
            {regenBusy ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      )}

      {open && hasDetail && (
        <div className="mt-2.5 space-y-2.5 border-t border-white/10 pt-2.5">
          {e.expectedContent && <DetailBlock label="Expected content">{e.expectedContent}</DetailBlock>}
          {e.visual && <DetailBlock label="Visualization">{e.visual}</DetailBlock>}
          {e.context && <DetailBlock label="Context">{e.context}</DetailBlock>}
          {e.geo && (
            <DetailBlock label="Map focus">
              {e.geo.focus}
              {e.geo.zoom != null ? ` · zoom ${e.geo.zoom}` : ''}
            </DetailBlock>
          )}
          {e.regionRequirement && (
            <DetailBlock label={`Choropleth — ${e.regionRequirement.metric}`}>
              {e.regionRequirement.requirement}
            </DetailBlock>
          )}
          {!!e.subsections?.length && (
            <DetailBlock label="Beats (shared map context)">
              <ol className="mt-1 space-y-2">
                {e.subsections.map((s) => (
                  <li key={s.heading} className="border-l-2 border-teal-400/30 pl-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-xs font-medium text-neutral-200">{s.heading}</span>
                      {s.geo && (
                        <span className="text-[10px] text-teal-300/80">dives to {s.geo.focus}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{s.intent}</p>
                  </li>
                ))}
              </ol>
            </DetailBlock>
          )}
        </div>
      )}
    </li>
  )
}
