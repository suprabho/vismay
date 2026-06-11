'use client'

import type { ComposeFormat, ComposeOutlineEntry } from '@vismay/content-source/composeState'
import { LayoutPreview, SectionFrame } from './LayoutPreview'
import { Chip, btnPrimaryCls, inputCls } from './ui'

/**
 * One materialised section: heading + layout/status chips, the live signed
 * canvas-frame render when available (canvas context) or the planned-layout
 * wireframe (editor tab), the planned visual as a reference line, and the
 * per-section Write/Rewrite control with its optional feedback note.
 */
export function MaterializedSectionCard({
  entry: e,
  frameSrc,
  format,
  written,
  isWriting,
  atCap,
  busy,
  maxConcurrent,
  feedback,
  onFeedbackChange,
  onWrite,
}: {
  entry: ComposeOutlineEntry
  /** Signed canvas-frame URL (cache-busted), or null in the editor tab. */
  frameSrc: string | null
  format: ComposeFormat
  /** Written at least once this session. */
  written: boolean
  /** This section's write is in flight. */
  isWriting: boolean
  /** The concurrency lane is full (disables Write until one finishes). */
  atCap: boolean
  /** A single-flight pipeline call is in progress. */
  busy: boolean
  maxConcurrent: number
  feedback: string
  onFeedbackChange: (value: string) => void
  onWrite: () => void
}) {
  return (
    <li className="rounded-lg border border-white/10 bg-neutral-900/60 p-3">
      <div className="flex items-center gap-1.5">
        <h4 className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">{e.heading}</h4>
        {e.layout && (
          <Chip tone="sky" title="Planned deck layout">
            {e.layout}
          </Chip>
        )}
        {isWriting ? (
          <Chip tone="amber">
            <span className="animate-pulse">writing…</span>
          </Chip>
        ) : (
          written && (
            <Chip tone="emerald" title="Written this session">
              ✓ written
            </Chip>
          )
        )}
      </div>

      {/* What was materialised: the live render when the canvas has signed it,
          else the planned-layout wireframe. */}
      <div className="mt-2">
        {frameSrc ? (
          <SectionFrame src={frameSrc} title={e.heading} />
        ) : (
          <LayoutPreview layout={e.layout} format={format} />
        )}
      </div>

      {e.visual && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
          <span className="font-medium text-neutral-400">Planned — </span>
          {e.visual}
        </p>
      )}

      <div className="mt-2 flex gap-1.5">
        <input
          value={feedback}
          onChange={(ev) => onFeedbackChange(ev.target.value)}
          placeholder={written ? 'Refine note…' : 'Optional note…'}
          className={`min-w-0 flex-1 ${inputCls}`}
        />
        <button
          onClick={onWrite}
          disabled={busy || isWriting || atCap}
          title={
            atCap && !isWriting
              ? `Up to ${maxConcurrent} sections write at once — wait for one to finish`
              : undefined
          }
          className={`shrink-0 ${btnPrimaryCls}`}
        >
          {isWriting ? '…' : written ? 'Rewrite' : 'Write'}
        </button>
      </div>
    </li>
  )
}
