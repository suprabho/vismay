'use client'

import { useState } from 'react'
import type { ComposeState } from '@vismay/content-source/composeState'
import { AngleCard } from './AngleCard'
import { SectionHeading, btnGhostCls, btnPrimaryCls, inputCls } from './ui'

/**
 * Angles stage: candidate angle cards (pick one), an optional regenerate note,
 * and the "Generate outline" advance. In `wide` (editor) layout the cards form
 * a grid and the note + actions collapse onto one row.
 */
export function AnglesStage({
  angles,
  chosenAngleId,
  busy,
  wide,
  onPick,
  onRegenerate,
  onGenOutline,
}: {
  angles: ComposeState['angles']
  chosenAngleId?: string | null
  busy: string | null
  wide?: boolean
  onPick: (id: string) => void
  onRegenerate: (feedback?: string) => Promise<boolean>
  onGenOutline: () => void
}) {
  const [feedback, setFeedback] = useState('')

  async function regenerate() {
    if (await onRegenerate(feedback.trim() || undefined)) setFeedback('')
  }

  const noteInput = (
    <input
      value={feedback}
      onChange={(e) => setFeedback(e.target.value)}
      placeholder="Regenerate with a note (optional)…"
      className={`min-w-0 ${wide ? 'flex-1' : 'w-full'} ${inputCls}`}
    />
  )
  const actions = (
    <>
      <button onClick={regenerate} disabled={!!busy} className={`${wide ? 'shrink-0' : 'flex-1'} ${btnGhostCls}`}>
        Regenerate
      </button>
      <button
        onClick={onGenOutline}
        disabled={!!busy || !chosenAngleId}
        className={`${wide ? 'shrink-0' : 'flex-1'} ${btnPrimaryCls}`}
      >
        {busy === 'outline' ? 'Outlining…' : 'Generate outline →'}
      </button>
    </>
  )

  return (
    <section className="space-y-3">
      <SectionHeading title="Angle" count={angles.length} hint="pick one to outline" />
      <div className={wide ? 'grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
        {angles.map((a) => (
          <AngleCard
            key={a.id}
            angle={a}
            selected={chosenAngleId === a.id}
            onPick={() => onPick(a.id)}
          />
        ))}
      </div>
      {wide ? (
        <div className="flex gap-2">
          {noteInput}
          {actions}
        </div>
      ) : (
        <>
          {noteInput}
          <div className="flex gap-2">{actions}</div>
        </>
      )}
    </section>
  )
}
