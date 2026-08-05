'use client'

import { useEffect, useState } from 'react'
import type { DayVocab, Item } from './CuratePanel'

/**
 * Full-screen curation sheet for one media item: big preview, day/stop
 * pickers, caption, selection toggle, feature-first, delete, prev/next.
 * Every control fires an optimistic PATCH via the parent.
 */
export default function MediaDetail({
  item,
  days,
  onClose,
  onPatch,
  onDelete,
  onPrev,
  onNext,
}: {
  item: Item
  days: DayVocab[]
  onClose: () => void
  onPatch: (patch: Record<string, unknown>) => void
  onDelete: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const [caption, setCaption] = useState(item.caption ?? '')
  useEffect(() => setCaption(item.caption ?? ''), [item.file, item.caption])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f6f1e7]">
      <div className="flex items-center gap-2 border-b border-black/10 p-3">
        <button onClick={onClose} className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm">
          ← Back
        </button>
        <span className="truncate font-mono text-xs opacity-60">{item.file}</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={onPrev}
            disabled={!onPrev}
            className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm disabled:opacity-30"
          >
            ‹
          </button>
          <button
            onClick={onNext}
            disabled={!onNext}
            className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/5 p-2">
        {item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.caption ?? ''} className="max-h-full max-w-full object-contain" />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={item.url} controls preload="metadata" className="max-h-full max-w-full" />
        )}
      </div>

      <div className="space-y-3 border-t border-black/10 bg-[#fffdf8] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={item.stop ?? ''}
            onChange={(e) => onPatch(e.target.value ? { stop: e.target.value } : { stop: null })}
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
          >
            <option value="">No stop (unassigned)</option>
            {days
              .filter((d) => d.n != null)
              .flatMap((d) =>
                d.stops.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    D{d.n} · {s.name}
                  </option>
                ))
              )}
          </select>
          <select
            value={item.day ?? ''}
            onChange={(e) =>
              onPatch({ day: e.target.value === '' ? null : Number(e.target.value), stop: null })
            }
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
            title="Day only (clears stop)"
          >
            <option value="">No day</option>
            {days
              .filter((d) => d.n != null)
              .map((d) => (
                <option key={d.n} value={d.n as number}>
                  Day {d.n}
                </option>
              ))}
          </select>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.selected}
              onChange={(e) => onPatch({ selected: e.target.checked })}
            />
            Show in views
          </label>
          <button
            onClick={() => onPatch({ sort_order: item.sortOrder === 0 ? null : 0 })}
            className={`rounded-full px-3 py-1.5 text-sm ${
              item.sortOrder === 0 ? 'bg-[#2ca068] text-white' : 'border border-black/15 bg-white'
            }`}
            title="Feature first in its stop"
          >
            ★ first
          </button>
          <button onClick={onDelete} className="rounded-full bg-red-700 px-3 py-1.5 text-sm text-white">
            Delete
          </button>
        </div>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if (caption !== (item.caption ?? '')) onPatch({ caption: caption || null })
          }}
          placeholder="Caption (handwritten under the photo)…"
          className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
        />
        {item.takenAt && (
          <p className="text-xs opacity-50">
            EXIF time {item.takenAt} (stored offset is IST — trust the original filename for local
            time) · match: {item.match}
          </p>
        )}
      </div>
    </div>
  )
}
