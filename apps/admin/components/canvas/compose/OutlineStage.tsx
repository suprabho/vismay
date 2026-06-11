'use client'

import { useState } from 'react'
import type { ComposeState } from '@vismay/content-source/composeState'
import { LayoutLegend } from './LayoutPreview'
import { OutlineEntryCard } from './OutlineEntryCard'
import { SectionHeading, btnGhostCls, btnSuccessCls, inputCls } from './ui'

/**
 * Outline stage: the planned entries with accept/reject status chips, layout
 * legend, regenerate note, and the Materialize advance. STRUCTURE edits
 * (reorder/regenerate) are outline-phase-only; STATUS stays togglable on
 * unmaterialised entries until the draft is finished, so stragglers can be
 * accepted + appended later. In `wide` (editor) layout the entries form a
 * two-column grid.
 */
export function OutlineStage({
  st,
  busy,
  wide,
  outlineEditable,
  statusEditable,
  newAcceptedCount,
  onCycleStatus,
  onMove,
  onRegenerate,
  onMaterialize,
}: {
  st: ComposeState
  busy: string | null
  wide?: boolean
  outlineEditable: boolean
  statusEditable: boolean
  newAcceptedCount: number
  onCycleStatus: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onRegenerate: (feedback?: string) => Promise<boolean>
  onMaterialize: () => void
}) {
  const [feedback, setFeedback] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  async function regenerate() {
    if (await onRegenerate(feedback.trim() || undefined)) setFeedback('')
  }

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Outline"
        count={st.outline.length}
        hint={statusEditable ? 'click a status chip to accept / reject' : undefined}
      />
      {outlineEditable && (
        <LayoutLegend layouts={st.outline.map((e) => e.layout)} format={st.format} />
      )}
      <ul className={wide ? 'grid items-start gap-2 md:grid-cols-2' : 'space-y-2'}>
        {st.outline.map((e, i) => (
          <OutlineEntryCard
            key={e.id}
            entry={e}
            index={i}
            total={st.outline.length}
            open={open.has(e.id)}
            format={st.format}
            statusEditable={statusEditable}
            outlineEditable={outlineEditable}
            onCycleStatus={() => onCycleStatus(e.id)}
            onToggle={() => toggle(e.id)}
            onMove={(dir) => onMove(e.id, dir)}
          />
        ))}
      </ul>
      {outlineEditable &&
        (wide ? (
          <div className="flex gap-2">
            <input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Regenerate outline with a note (optional)…"
              className={`min-w-0 flex-1 ${inputCls}`}
            />
            <button onClick={regenerate} disabled={!!busy} className={`shrink-0 ${btnGhostCls}`}>
              Regenerate
            </button>
            <button
              onClick={onMaterialize}
              disabled={!!busy || newAcceptedCount === 0}
              className={`shrink-0 ${btnSuccessCls}`}
            >
              {busy === 'materialize'
                ? 'Creating…'
                : `${st.attached ? 'Append' : 'Materialize'} ${newAcceptedCount} →`}
            </button>
          </div>
        ) : (
          <>
            <input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Regenerate outline with a note (optional)…"
              className={`w-full ${inputCls}`}
            />
            <div className="flex gap-2">
              <button onClick={regenerate} disabled={!!busy} className={`flex-1 ${btnGhostCls}`}>
                Regenerate
              </button>
              <button
                onClick={onMaterialize}
                disabled={!!busy || newAcceptedCount === 0}
                className={`flex-1 ${btnSuccessCls}`}
              >
                {busy === 'materialize'
                  ? 'Creating…'
                  : `${st.attached ? 'Append' : 'Materialize'} ${newAcceptedCount} →`}
              </button>
            </div>
          </>
        ))}
      {/* Post-materialise: stragglers accepted later get appended after the
          existing sections — materialise is incremental, nothing written is
          touched. */}
      {!outlineEditable && statusEditable && newAcceptedCount > 0 && (
        <button
          onClick={onMaterialize}
          disabled={!!busy}
          className={`${wide ? '' : 'w-full'} ${btnSuccessCls}`}
        >
          {busy === 'materialize'
            ? 'Creating…'
            : `Append ${newAcceptedCount} new section${newAcceptedCount > 1 ? 's' : ''} →`}
        </button>
      )}
    </section>
  )
}
