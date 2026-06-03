'use client'

/**
 * Thumbs up/down + optional note on one AI generation.
 *
 * Both generation surfaces — the per-slot PromptBar and the section-generate
 * preview — return a `generation.id`. Drop this row in with that id and the
 * story slug; clicking a thumb persists the verdict to `/generation-feedback`
 * immediately, and the author can expand a note and re-save. Rating is mutable
 * server-side, so flipping the thumb or editing the note just overwrites.
 *
 * Renders nothing when `generationId` is null (audit logging failed) — there's
 * no row to attach feedback to, so the affordance is simply absent.
 */

import { useState } from 'react'

interface Props {
  slug: string
  generationId: string | null
}

type Rating = 'up' | 'down'

export default function GenerationFeedback({ slug, generationId }: Props) {
  const [rating, setRating] = useState<Rating | null>(null)
  const [comment, setComment] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  if (!generationId) return null

  async function send(nextRating: Rating, note: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/vizmaya/stories/${encodeURIComponent(slug)}/generation-feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationId,
            rating: nextRating,
            comment: note.trim() || undefined,
          }),
        },
      )
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save feedback.')
      throw e
    } finally {
      setBusy(false)
    }
  }

  async function rate(next: Rating) {
    const prev = rating
    setRating(next)
    setSavedNote(false)
    // A thumb-down usually wants a reason — open the note inline.
    if (next === 'down') setShowNote(true)
    try {
      await send(next, comment)
    } catch {
      setRating(prev) // revert the optimistic toggle on failure
    }
  }

  async function saveNote() {
    if (!rating) return
    try {
      await send(rating, comment)
      setSavedNote(true)
    } catch {
      /* error already surfaced */
    }
  }

  const thumb = (value: Rating, glyph: string, label: string) => (
    <button
      type="button"
      onClick={() => void rate(value)}
      disabled={busy}
      aria-pressed={rating === value}
      aria-label={label}
      title={label}
      className={
        'rounded px-1.5 py-0.5 text-[13px] leading-none transition-colors disabled:opacity-40 ' +
        (rating === value
          ? value === 'up'
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-red-500/15 text-red-300'
          : 'text-neutral-500 hover:text-white')
      }
    >
      {glyph}
    </button>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-neutral-600">
          Feedback
        </span>
        {thumb('up', '👍', 'Good output')}
        {thumb('down', '👎', 'Poor output')}
        {rating && !showNote && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="text-[10px] text-neutral-500 hover:text-white"
          >
            Add a note
          </button>
        )}
        {rating && !error && (
          <span className="text-[10px] text-emerald-300/70">
            {savedNote ? 'Note saved' : 'Saved'}
          </span>
        )}
      </div>

      {showNote && (
        <div className="flex items-start gap-1.5">
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              setSavedNote(false)
            }}
            disabled={busy}
            rows={2}
            placeholder="What was off? (optional — helps tune the prompts)"
            className="flex-1 resize-vertical rounded border border-white/10 bg-neutral-900 p-1.5 text-[11px] leading-relaxed text-neutral-200 focus:border-white/30 focus:outline-none disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={busy || !rating}
            className="shrink-0 rounded bg-white/10 px-2 py-1 text-[11px] text-neutral-200 hover:bg-white/20 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}

      {error && <div className="text-[10px] text-red-400">{error}</div>}
    </div>
  )
}
