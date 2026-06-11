'use client'

import { useState } from 'react'
import type { ComposeState } from '@vismay/content-source/composeState'
import { MaterializedSectionCard } from './MaterializedSectionCard'
import { SectionHeading, btnGhostCls } from './ui'
import { MAX_CONCURRENT_SECTIONS } from './useComposeFlow'

/**
 * Content stage: the materialised sections with their per-section
 * Write/Rewrite lane, plus the batch image-generation step. Per-section
 * feedback drafts are local state — the stage stays mounted across tab
 * switches, so they survive. In `wide` (editor) layout the cards form a grid.
 */
export function SectionsStage({
  st,
  busy,
  wide,
  writing,
  written,
  imgDone,
  frameSrcFor,
  onWrite,
  onGenImages,
}: {
  st: ComposeState
  busy: string | null
  wide?: boolean
  writing: Set<string>
  written: Set<string>
  imgDone: number
  frameSrcFor: (sectionId: string) => string | null
  onWrite: (sectionId: string, feedback?: string) => Promise<boolean>
  onGenImages: () => void
}) {
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const materialized = st.outline.filter((e) => e.sectionId)
  const imagePromptCount = st.imagePrompts?.length ?? 0

  async function write(sectionId: string) {
    const fb = feedback[sectionId]?.trim()
    if (await onWrite(sectionId, fb || undefined)) {
      setFeedback((f) => ({ ...f, [sectionId]: '' }))
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeading title="Materialized sections" count={materialized.length} hint="what got created" />
      <ul className={wide ? 'grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
        {materialized.map((e) => (
          <MaterializedSectionCard
            key={e.id}
            entry={e}
            frameSrc={frameSrcFor(e.sectionId!)}
            format={st.format}
            written={written.has(e.sectionId!)}
            isWriting={writing.has(e.sectionId!)}
            atCap={writing.size >= MAX_CONCURRENT_SECTIONS}
            busy={!!busy}
            maxConcurrent={MAX_CONCURRENT_SECTIONS}
            feedback={feedback[e.sectionId!] ?? ''}
            onFeedbackChange={(v) => setFeedback((f) => ({ ...f, [e.sectionId!]: v }))}
            onWrite={() => write(e.sectionId!)}
          />
        ))}
      </ul>
      <div className={wide ? 'flex gap-2 pt-1' : 'space-y-1.5 pt-1'}>
        {imagePromptCount > 0 && (
          <button
            onClick={onGenImages}
            disabled={!!busy || writing.size > 0}
            className={`${wide ? 'px-4' : 'w-full'} ${btnGhostCls} py-2`}
          >
            {busy === 'images'
              ? `Generating images… ${imgDone}/${imagePromptCount}`
              : `Generate ${imagePromptCount} image(s) → Assets`}
          </button>
        )}
        <button
          onClick={() => window.location.reload()}
          className={`${wide ? 'px-4' : 'w-full'} ${btnGhostCls} py-2`}
        >
          Reload to view ↻
        </button>
      </div>
    </section>
  )
}
