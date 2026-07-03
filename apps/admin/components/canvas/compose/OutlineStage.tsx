'use client'

import { useState } from 'react'
import type { ComposeState } from '@vismay/content-source/composeState'
import { LayoutLegend } from './LayoutPreview'
import { OutlineEntryCard } from './OutlineEntryCard'
import { SectionHeading, btnGhostCls, btnPrimaryCls, btnSuccessCls, inputCls } from './ui'

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
  onRegenSection,
  onAddSection,
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
  /** Regenerate a single slide in place (outline phase, unmaterialised only). */
  onRegenSection: (id: string, feedback?: string) => Promise<boolean>
  /** Add a new slide from a prompt, appended to the end of the outline. */
  onAddSection: (prompt?: string) => Promise<boolean>
  onMaterialize: () => void
}) {
  const [feedback, setFeedback] = useState('')
  const [addPrompt, setAddPrompt] = useState('')
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
  async function addSlide() {
    if (await onAddSection(addPrompt.trim() || undefined)) setAddPrompt('')
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
      <ul
        className={
          wide
            ? 'grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] items-start gap-2'
            : 'space-y-2'
        }
      >
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
            busy={!!busy}
            regenBusy={busy === `regen:${e.id}`}
            onCycleStatus={() => onCycleStatus(e.id)}
            onToggle={() => toggle(e.id)}
            onMove={(dir) => onMove(e.id, dir)}
            onRegenerate={(fb) => onRegenSection(e.id, fb)}
          />
        ))}
      </ul>
      {/* Add a brand-new slide from a prompt — appended to the end, lands
          `pending` for the author to accept + materialise. */}
      {outlineEditable && (
        <div className="flex gap-2 border-t border-white/10 pt-3">
          <input
            value={addPrompt}
            onChange={(e) => setAddPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) addSlide()
            }}
            placeholder="Add a new slide — describe what it should cover…"
            className={`min-w-0 flex-1 ${inputCls}`}
          />
          <button
            onClick={addSlide}
            disabled={!!busy}
            className={`shrink-0 ${btnPrimaryCls}`}
          >
            {busy === 'add-section' ? 'Adding…' : '+ Add slide'}
          </button>
        </div>
      )}
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
