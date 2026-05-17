'use client'

/**
 * Trigger and list sub-range renders for a story slug.
 *
 * Renders alongside the canonical full-video render row in two places:
 *   - components/admin/NarrationEditor.tsx → `VideoRenderPanel`
 *   - components/admin/social/VideoPostRenderPanel.tsx → per-post drawer
 *
 * Internally:
 *   - Loads the cumulative audio timeline from /api/story-video/[slug]/timeline
 *   - Lists existing range renders for the slug
 *   - Shows a builder for new ranges: pick start + end unit (+ aspect when
 *     more than one is allowed) and Render. Multiple slice rows can be
 *     queued and dispatched sequentially.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VideoAspect } from '@/lib/storyVideo'

interface TimelineUnit {
  unitIndex: number
  absStartMs: number
  absEndMs: number
}

interface ExistingRender {
  aspect: VideoAspect
  range_start_ms: number
  range_end_ms: number
  public_url: string
  duration_ms: number | null
  dispatched_at: string | null
  created_at: string | null
}

interface TimelineResponse {
  totalMs: number
  units: TimelineUnit[]
  renders: ExistingRender[]
}

interface SliceDraft {
  id: string
  fromUnitIndex: number
  toUnitIndex: number
  aspect: VideoAspect
  status: 'idle' | 'rendering' | 'ready' | 'error'
  errorMsg?: string
  publicUrl?: string
}

interface Props {
  slug: string
  /**
   * Aspects the user can pick from. NarrationEditor passes both;
   * VideoPostRenderPanel pins to the post's single aspect.
   */
  availableAspects: VideoAspect[]
}

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function unitLabel(u: TimelineUnit): string {
  return `Unit ${u.unitIndex} · ${formatMs(u.absStartMs)} → ${formatMs(u.absEndMs)}`
}

function newDraftId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export function RangeRenderPanel({ slug, availableAspects }: Props) {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<SliceDraft[]>([])
  const [busy, setBusy] = useState(false)

  const loadTimeline = useCallback(async () => {
    setLoadError(null)
    try {
      const r = await fetch(`/api/story-video/${encodeURIComponent(slug)}/timeline`, {
        cache: 'no-store',
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${r.status}`)
      }
      const data = (await r.json()) as TimelineResponse
      setTimeline(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'timeline load failed')
    }
  }, [slug])

  useEffect(() => {
    loadTimeline()
  }, [loadTimeline])

  // Stabilize `units` so the hooks below don't re-fire on every render — a
  // bare `timeline?.units ?? []` returns a new [] each pass.
  const units = useMemo(() => timeline?.units ?? [], [timeline])
  const defaultAspect = availableAspects[0]

  const addDraft = useCallback(() => {
    if (units.length === 0 || !defaultAspect) return
    setDrafts((prev) => [
      ...prev,
      {
        id: newDraftId(),
        fromUnitIndex: units[0].unitIndex,
        toUnitIndex: units[Math.min(2, units.length - 1)].unitIndex,
        aspect: defaultAspect,
        status: 'idle',
      },
    ])
  }, [units, defaultAspect])

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const patchDraft = useCallback((id: string, patch: Partial<SliceDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }, [])

  // Map unitIndex → unit for resolving ms boundaries from the form selections.
  const unitByIndex = useMemo(() => {
    const m = new Map<number, TimelineUnit>()
    for (const u of units) m.set(u.unitIndex, u)
    return m
  }, [units])

  const renderDrafts = useCallback(async () => {
    if (drafts.length === 0) return
    setBusy(true)
    try {
      // Sequential to be gentle on the GitHub Actions runner (each render
      // takes minutes) — running in parallel would queue N workflows at once.
      for (const draft of drafts) {
        const from = unitByIndex.get(draft.fromUnitIndex)
        const to = unitByIndex.get(draft.toUnitIndex)
        if (!from || !to) {
          patchDraft(draft.id, { status: 'error', errorMsg: 'unit not found' })
          continue
        }
        const startMs = Math.min(from.absStartMs, to.absStartMs)
        const endMs = Math.max(from.absEndMs, to.absEndMs)
        if (endMs <= startMs) {
          patchDraft(draft.id, { status: 'error', errorMsg: 'invalid range' })
          continue
        }
        patchDraft(draft.id, { status: 'rendering', errorMsg: undefined })
        try {
          const params = new URLSearchParams({
            aspect: draft.aspect,
            startMs: String(startMs),
            endMs: String(endMs),
          })
          // We don't use usePollVideoRender's shared state here because each
          // draft needs its own status; instead we drive the same endpoint
          // by hand, polling until ready / error.
          let attempts = 0
          const MAX = 12
          let publicUrl: string | undefined
          while (attempts < MAX) {
            const r = await fetch(
              `/api/story-video/${encodeURIComponent(slug)}?${params.toString()}`,
              { cache: 'no-store' }
            )
            const body = (await r.json().catch(() => ({}))) as {
              status?: string
              public_url?: string
              error?: string
            }
            if (r.ok && body.status === 'ready' && body.public_url) {
              publicUrl = body.public_url
              break
            }
            if (r.status === 202 || body.status === 'rendering') {
              await new Promise((res) => setTimeout(res, 300_000))
              attempts++
              continue
            }
            throw new Error(body.error ?? `HTTP ${r.status}`)
          }
          if (!publicUrl) throw new Error('timed out')
          patchDraft(draft.id, { status: 'ready', publicUrl })
        } catch (err) {
          patchDraft(draft.id, {
            status: 'error',
            errorMsg: err instanceof Error ? err.message : 'render failed',
          })
        }
      }
      await loadTimeline()
    } finally {
      setBusy(false)
    }
  }, [drafts, unitByIndex, slug, patchDraft, loadTimeline])

  if (loadError) {
    return (
      <div className="text-[11px] text-red-300">
        Failed to load timeline: {loadError}
      </div>
    )
  }
  if (!timeline) {
    return <div className="text-[11px] text-neutral-500">Loading timeline…</div>
  }
  if (units.length === 0) {
    return (
      <div className="text-[11px] text-neutral-500">
        No audio cues for this slug — generate audio first.
      </div>
    )
  }

  const matchingRenders = timeline.renders.filter((r) =>
    availableAspects.includes(r.aspect)
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-neutral-300">Range renders</div>
        <div className="text-[10px] text-neutral-500">
          total {formatMs(timeline.totalMs)} · {units.length} units
        </div>
      </div>

      {matchingRenders.length > 0 && (
        <div className="space-y-1">
          {matchingRenders.map((r) => {
            const isReady = !!r.public_url
            const isInFlight = !isReady && r.dispatched_at !== null
            return (
              <div
                key={`${r.aspect}-${r.range_start_ms}-${r.range_end_ms}`}
                className="flex items-center gap-2 text-[11px] py-1 px-2 border border-white/10 rounded bg-white/[0.02]"
              >
                <span className="font-mono text-neutral-400 w-12 shrink-0">{r.aspect}</span>
                <span className="text-neutral-300 shrink-0">
                  {formatMs(r.range_start_ms)} → {formatMs(r.range_end_ms)}
                </span>
                <span className="flex-1" />
                {isReady ? (
                  <span className="text-emerald-300/80">ready</span>
                ) : isInFlight ? (
                  <span className="text-amber-300/80">rendering</span>
                ) : (
                  <span className="text-neutral-500">queued</span>
                )}
                {isReady && (
                  <>
                    <a
                      href={r.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-0.5 border border-white/10 rounded hover:bg-white/5 text-neutral-300"
                    >
                      Open ↗
                    </a>
                    <a
                      href={r.public_url}
                      download
                      className="px-2 py-0.5 border border-white/10 rounded hover:bg-white/5 text-neutral-300"
                    >
                      ↓
                    </a>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {drafts.length === 0 ? (
        <button
          type="button"
          onClick={addDraft}
          className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-neutral-300"
        >
          + Add range
        </button>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <SliceRow
              key={d.id}
              draft={d}
              units={units}
              availableAspects={availableAspects}
              onPatch={(patch) => patchDraft(d.id, patch)}
              onRemove={() => removeDraft(d.id)}
            />
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addDraft}
              disabled={busy}
              className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-neutral-300 disabled:opacity-40"
            >
              + chain another slice
            </button>
            <button
              type="button"
              onClick={renderDrafts}
              disabled={busy || drafts.length === 0}
              className="text-[11px] px-3 py-1 bg-white/10 hover:bg-white/15 rounded text-neutral-100 disabled:opacity-40"
            >
              {busy
                ? 'Rendering…'
                : drafts.length === 1
                  ? 'Render slice'
                  : `Render ${drafts.length} slices`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SliceRow({
  draft,
  units,
  availableAspects,
  onPatch,
  onRemove,
}: {
  draft: SliceDraft
  units: TimelineUnit[]
  availableAspects: VideoAspect[]
  onPatch: (patch: Partial<SliceDraft>) => void
  onRemove: () => void
}) {
  const from = units.find((u) => u.unitIndex === draft.fromUnitIndex)
  const to = units.find((u) => u.unitIndex === draft.toUnitIndex)
  const startMs = from && to ? Math.min(from.absStartMs, to.absStartMs) : 0
  const endMs = from && to ? Math.max(from.absEndMs, to.absEndMs) : 0
  const durationMs = Math.max(0, endMs - startMs)

  return (
    <div className="border border-white/10 rounded p-2 space-y-2 bg-white/[0.02]">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-neutral-400">From</span>
        <select
          value={draft.fromUnitIndex}
          onChange={(e) => onPatch({ fromUnitIndex: Number(e.target.value) })}
          disabled={draft.status === 'rendering'}
          className="flex-1 bg-neutral-950 border border-white/10 rounded px-1 py-0.5 text-neutral-200 text-[11px]"
        >
          {units.map((u) => (
            <option key={u.unitIndex} value={u.unitIndex}>
              {unitLabel(u)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-neutral-400">To</span>
        <select
          value={draft.toUnitIndex}
          onChange={(e) => onPatch({ toUnitIndex: Number(e.target.value) })}
          disabled={draft.status === 'rendering'}
          className="flex-1 bg-neutral-950 border border-white/10 rounded px-1 py-0.5 text-neutral-200 text-[11px]"
        >
          {units.map((u) => (
            <option key={u.unitIndex} value={u.unitIndex}>
              {unitLabel(u)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {availableAspects.length > 1 ? (
          <select
            value={draft.aspect}
            onChange={(e) => onPatch({ aspect: e.target.value as VideoAspect })}
            disabled={draft.status === 'rendering'}
            className="bg-neutral-950 border border-white/10 rounded px-1 py-0.5 text-neutral-200 text-[11px]"
          >
            {availableAspects.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-neutral-400">{draft.aspect}</span>
        )}
        <span className="text-neutral-500">
          → {formatMs(durationMs)} clip ({startMs}–{endMs} ms)
        </span>
        <span className="flex-1" />
        {draft.status === 'rendering' && (
          <span className="text-amber-300/80">rendering · polls every 5 min</span>
        )}
        {draft.status === 'ready' && draft.publicUrl && (
          <a
            href={draft.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-0.5 border border-white/10 rounded hover:bg-white/5 text-emerald-300/80"
          >
            ready ↗
          </a>
        )}
        {draft.status === 'error' && draft.errorMsg && (
          <span className="text-red-300/80 truncate max-w-[200px]" title={draft.errorMsg}>
            error · {draft.errorMsg}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={draft.status === 'rendering'}
          className="px-1.5 py-0.5 border border-white/10 rounded hover:bg-white/5 text-neutral-400 disabled:opacity-40"
          title="Remove slice"
        >
          ×
        </button>
      </div>
    </div>
  )
}
