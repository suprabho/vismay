'use client'

import { useState } from 'react'
import { FileText, LinkSimple, TextAa } from '@phosphor-icons/react'
import type { StorySource } from '@vismay/content-source/storySources'
import { Caret, Chip } from './ui'

const KIND_ICON = { file: FileText, link: LinkSimple, text: TextAa } as const

/** How much extracted text the expanded preview shows. */
const PREVIEW_CHARS = 300

/**
 * One research source: kind icon, title/byline hierarchy, status chip, and an
 * expandable preview of the extracted text (click the row). Failed sources show
 * their error inline with the re-extract affordance. Expansion is local UI
 * state — rows are keyed by id and the flow stays mounted, so it survives the
 * drawer being hidden.
 */
export function SourceRow({
  source,
  busy,
  reextracting,
  onReextract,
  onRemove,
}: {
  source: StorySource
  /** Any single-flight pipeline call in progress (disables re-extract). */
  busy: boolean
  /** A re-extract call is in flight. */
  reextracting: boolean
  onReextract: () => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const Icon = KIND_ICON[source.kind] ?? TextAa
  const name = source.title ?? source.sourceUrl ?? source.filename ?? 'Untitled source'
  // Second line: byline when extraction found one, else the raw origin (only
  // when it isn't already the first line).
  const origin = source.sourceUrl ?? source.filename
  const sub = source.byline ?? (source.title && origin ? origin : null)
  const preview = source.extractedText?.trim() ?? ''
  const canExpand = preview.length > 0

  return (
    <li className="rounded-lg border border-white/10 bg-neutral-900/60">
      <div
        className={`flex items-center gap-2 px-2.5 py-2 ${canExpand ? 'cursor-pointer' : ''}`}
        onClick={canExpand ? () => setOpen((o) => !o) : undefined}
        title={canExpand ? (open ? 'Hide extracted text' : 'Preview extracted text') : undefined}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-neutral-400">
          <Icon size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-neutral-100" title={name}>
            {name}
          </span>
          {sub && (
            <span className="block truncate text-[11px] text-neutral-500" title={sub}>
              {sub}
            </span>
          )}
        </span>
        {source.status === 'extracted' && <Chip tone="emerald">ready</Chip>}
        {source.status === 'failed' && <Chip tone="red">failed</Chip>}
        {source.status === 'pending' && (
          <Chip tone="amber">
            <span className="animate-pulse">extracting…</span>
          </Chip>
        )}
        {canExpand && <Caret open={open} />}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="shrink-0 rounded p-1 leading-none text-neutral-500 transition-colors hover:bg-white/10 hover:text-red-300"
          title="Remove source"
          aria-label="Remove source"
        >
          ✕
        </button>
      </div>

      {source.status === 'failed' && (
        <div className="mx-2.5 mb-2 flex items-start justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-red-300">
            {source.error ?? 'Extraction failed.'}
          </p>
          <button
            onClick={onReextract}
            disabled={busy}
            className="shrink-0 rounded border border-red-400/40 px-1.5 py-0.5 text-[10px] text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-40"
            title="Re-run extraction — the original file/link is retained"
          >
            {reextracting ? '…' : '↻ Re-extract'}
          </button>
        </div>
      )}

      {open && canExpand && (
        <div className="border-t border-white/5 px-2.5 py-2">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-400">
            {preview.slice(0, PREVIEW_CHARS)}
            {preview.length > PREVIEW_CHARS ? '…' : ''}
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-wide text-neutral-600">
            {preview.length.toLocaleString()} characters extracted
          </p>
        </div>
      )}
    </li>
  )
}
