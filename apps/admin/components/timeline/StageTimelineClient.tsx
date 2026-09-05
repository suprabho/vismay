'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StageConfig, StageEasing, StageEntityEditMsg } from '@vismay/viz-engine'
import {
  type TimelineColumn,
  buildAuthoredKeyframeIndex,
  buildEntityLifetimes,
} from './timelineShape'
import {
  type KeyframeAddress,
  type TransformPatch,
  addEntity,
  addKeyframe,
  effectiveT,
  findBaselineKf,
  getKeyframe,
  keyframeAddressForBeat,
  patchTransform,
  removeEntity,
  removeKeyframe,
  setEntityContent,
  setKeyframeT,
  setKeyframeTiming,
  clearKeyframeTiming,
  setKeyframeEasing,
  moveBeatKeyframes,
  canDropKeyframes,
} from './stageEditing'
import { spliceStageIntoConfig } from './spliceStage'
import PreviewFrame from './PreviewFrame'
import BeatTimeline, { type Selection } from './BeatTimeline'
import InspectorPanel from './InspectorPanel'
import AddEntityDialog from './AddEntityDialog'

const HISTORY_CAP = 100

type Status = { type: 'idle' | 'ok' | 'err' | 'warn'; msg?: string }

/**
 * Client root for the E2 stage timeline: owns the mutable `stage` snapshot
 * (video-editor pattern — pure `stageEditing` helpers, `useState`), the
 * playhead (drives the live preview via `PreviewFrame`'s `viz-story-seek`
 * bridge), the cell selection (drives `InspectorPanel`), an undo past-stack
 * coalesced per scrub gesture, and the save flow: diff-splice the edited
 * stage into the raw config text (`spliceStage`) → `PUT /api/stories/[slug]`
 * → reload the preview via a signature-safe `&v=` nonce.
 */
export default function StageTimelineClient({
  slug,
  columns,
  initialStage,
  configText: initialConfigText,
  previewUrl,
}: {
  slug: string
  columns: TimelineColumn[]
  initialStage: StageConfig | null
  /** Raw config text as loaded — the splice target; NOT the parsed object. */
  configText: string
  previewUrl: string
}) {
  const [playhead, setPlayhead] = useState<{ unit: number; t: number }>({ unit: 0, t: 0 })
  const [selection, setSelection] = useState<Selection | null>(null)
  const [stage, setStage] = useState<StageConfig | null>(initialStage)
  const [baseline, setBaseline] = useState<StageConfig | null>(initialStage)
  const [configText, setConfigText] = useState(initialConfigText)
  const [status, setStatus] = useState<Status>({ type: 'idle' })
  const [saving, setSaving] = useState(false)
  const [addingEntity, setAddingEntity] = useState(false)
  // Undo past-stack in a ref: only `setStage` needs to re-render, and keeping
  // the push out of a state updater keeps it StrictMode-safe (updaters can be
  // double-invoked).
  const historyRef = useRef<StageConfig[]>([])
  const lastEditKey = useRef<string | null>(null)
  // W2: each on-canvas gesture's target keyframe, resolved ONCE at its first
  // frame — playhead motion mid-gesture can never retarget the write.
  const gestureAddrRef = useRef(new Map<string, KeyframeAddress>())

  const authoredIndex = useMemo(() => buildAuthoredKeyframeIndex(stage, columns), [stage, columns])
  const lifetimes = useMemo(() => buildEntityLifetimes(stage, columns), [stage, columns])
  const dirty = useMemo(
    () => JSON.stringify(stage) !== JSON.stringify(baseline),
    [stage, baseline]
  )

  /** One undo entry per gesture: consecutive edits sharing `editKey` (a scrub
   *  on one field) replace the snapshot without a new history push. */
  const applyEdit = useCallback(
    (next: StageConfig, editKey: string | null) => {
      if (stage && (editKey === null || editKey !== lastEditKey.current)) {
        historyRef.current = [...historyRef.current.slice(-(HISTORY_CAP - 1)), stage]
      }
      lastEditKey.current = editKey
      setStage(next)
    },
    [stage]
  )

  // A gesture ends on pointerup (scrub) or focus leaving the field (typed).
  useEffect(() => {
    const clear = () => {
      lastEditKey.current = null
    }
    window.addEventListener('pointerup', clear)
    window.addEventListener('focusout', clear)
    return () => {
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('focusout', clear)
    }
  }, [])

  const undo = useCallback(() => {
    const h = historyRef.current
    if (h.length === 0) return
    historyRef.current = h.slice(0, -1)
    lastEditKey.current = null
    setStage(h[h.length - 1])
  }, [])

  const save = useCallback(async () => {
    // Baseline may be null (story had no stage until an entity was added).
    if (!stage || saving) return
    setSaving(true)
    setStatus({ type: 'idle' })
    try {
      const spliced = spliceStageIntoConfig(configText, baseline, stage)
      const res = await fetch(`/api/stories/${slug}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config_yaml: spliced }),
      })
      const body = (await res.json().catch(() => null)) as {
        error?: string
        warning?: string
      } | null
      if (!res.ok) {
        setStatus({ type: 'err', msg: body?.error ?? `HTTP ${res.status}` })
        return
      }
      if (body?.warning) {
        setStatus({ type: 'warn', msg: body.error ?? body.warning })
      } else {
        setStatus({ type: 'ok', msg: 'Saved' })
      }
      // No preview reload: the iframe already renders the live (now saved)
      // stage via the `viz-story-stage` push — a reload would flash and drop
      // the playhead for no gain.
      setBaseline(stage)
      setConfigText(spliced)
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [stage, baseline, saving, configText, slug])

  // Warn before navigating away with unsaved work.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Cmd/Ctrl+S save; Cmd/Ctrl+Z undo (native text undo wins inside inputs).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) void save()
      } else if (e.key === 'z' && !e.shiftKey) {
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dirty, saving, save, undo])

  // ── inspector edit routing ────────────────────────────────────────────────
  const handleTransform = useCallback(
    (addr: KeyframeAddress, patch: TransformPatch) => {
      if (!stage) return
      // Baseline lookup by `at` identity, not index — CRUD (W3) breaks index
      // alignment between the edited and as-loaded arrays.
      const current = getKeyframe(stage, addr)
      const baselineKf = current ? findBaselineKf(baseline, addr.entityId, current.at) : undefined
      const field = Object.keys(patch)[0] ?? ''
      applyEdit(
        patchTransform(stage, addr, patch, baselineKf),
        `tf:${addr.entityId}:${addr.kfIndex}:${field}`
      )
    },
    [stage, baseline, applyEdit]
  )

  const handleT = useCallback(
    (addr: KeyframeAddress, t: number) => {
      if (!stage) return
      const next = setKeyframeT(stage, addr, t, columns)
      if (next === null) {
        setStatus({ type: 'warn', msg: 'duplicate t on this beat — value not applied' })
        return
      }
      applyEdit(next, `t:${addr.entityId}:${addr.kfIndex}`)
    },
    [stage, columns, applyEdit]
  )

  const handleUseMsTiming = useCallback(
    (addr: KeyframeAddress, seed: { delayMs: number; durationMs: number }) => {
      if (!stage) return
      applyEdit(setKeyframeTiming(stage, addr, seed), null)
    },
    [stage, applyEdit]
  )

  const handleClearMsTiming = useCallback(
    (addr: KeyframeAddress) => {
      if (!stage) return
      applyEdit(clearKeyframeTiming(stage, addr), null)
    },
    [stage, applyEdit]
  )

  const handleTiming = useCallback(
    (addr: KeyframeAddress, timing: { delayMs: number; durationMs: number }) => {
      if (!stage) return
      applyEdit(setKeyframeTiming(stage, addr, timing), `ms:${addr.entityId}:${addr.kfIndex}`)
    },
    [stage, applyEdit]
  )

  const handleEasing = useCallback(
    (addr: KeyframeAddress, easing: StageEasing | undefined) => {
      if (!stage) return
      applyEdit(setKeyframeEasing(stage, addr, easing), null)
    },
    [stage, applyEdit]
  )

  const handleMoveKeyframes = useCallback(
    (entityId: string, fromBeat: number, toBeat: number) => {
      if (!stage) return
      if (!canDropKeyframes(authoredIndex, entityId, fromBeat, toBeat)) return
      applyEdit(moveBeatKeyframes(stage, columns, entityId, fromBeat, toBeat), null)
      // Keep the selection on the moved group so the inspector follows it.
      setSelection((sel) =>
        sel && sel.entityId === entityId && sel.beat === fromBeat ? { ...sel, beat: toBeat } : sel
      )
    },
    [stage, columns, authoredIndex, applyEdit]
  )

  const hasObjects = useMemo(
    () => stage?.entities.some((e) => e.role === 'object') ?? false,
    [stage]
  )

  // ── on-canvas gesture routing (W2) ───────────────────────────────────────
  const selectionEditable = useMemo(
    () =>
      selection != null &&
      keyframeAddressForBeat(authoredIndex, selection.entityId, playhead.unit, playhead.t) != null,
    [selection, authoredIndex, playhead.unit, playhead.t]
  )

  const handleEntityPointerDown = useCallback(
    (id: string) => {
      setSelection({ entityId: id, beat: playhead.unit })
      // Snap the playhead to the target keyframe's effective t so the
      // rendered pose IS the keyframe pose — a drag then writes exactly what
      // the cursor shows (no offset after the config round-trip).
      const addr = keyframeAddressForBeat(authoredIndex, id, playhead.unit, playhead.t)
      if (addr && stage) {
        const kf = getKeyframe(stage, addr)
        const sole = (authoredIndex[id]?.[playhead.unit]?.length ?? 0) === 1
        if (kf) setPlayhead((p) => ({ unit: p.unit, t: effectiveT(kf, sole) }))
      }
    },
    [playhead.unit, playhead.t, authoredIndex, stage]
  )

  const handleEntityEdit = useCallback(
    (msg: StageEntityEditMsg) => {
      if (!stage) return
      let addr = gestureAddrRef.current.get(msg.gesture)
      if (!addr) {
        addr = keyframeAddressForBeat(authoredIndex, msg.id, playhead.unit, playhead.t) ?? undefined
        if (!addr) return
        gestureAddrRef.current.set(msg.gesture, addr)
      }
      const current = getKeyframe(stage, addr)
      const baselineKf = current ? findBaselineKf(baseline, addr.entityId, current.at) : undefined
      applyEdit(patchTransform(stage, addr, msg.patch, baselineKf), msg.gesture)
      if (msg.phase === 'end') {
        lastEditKey.current = null
        gestureAddrRef.current.delete(msg.gesture)
      }
    },
    [stage, baseline, authoredIndex, playhead.unit, playhead.t, applyEdit]
  )

  // ── entity / keyframe CRUD (W3) ──────────────────────────────────────────
  const handleAddEntity = useCallback(
    (opts: { id: string; role: 'subject' | 'object'; assetRef: string }) => {
      applyEdit(addEntity(stage, { ...opts, beat: playhead.unit, columns }), null)
      setAddingEntity(false)
      setSelection({ entityId: opts.id, beat: playhead.unit })
    },
    [stage, playhead.unit, columns, applyEdit]
  )

  const handleDeleteEntity = useCallback(
    (entityId: string) => {
      if (!stage) return
      applyEdit(removeEntity(stage, entityId), null)
      setSelection((sel) => (sel?.entityId === entityId ? null : sel))
    },
    [stage, applyEdit]
  )

  const handleAddKeyframe = useCallback(
    (entityId: string, beat: number) => {
      if (!stage) return
      // Seed from the nearest authored keyframe so the new one starts where
      // the entity already is, not at the centre.
      const byBeat = authoredIndex[entityId] ?? {}
      let seed
      let bestDist = Infinity
      for (const [b, kfs] of Object.entries(byBeat)) {
        const d = Math.abs(Number(b) - beat)
        if (d < bestDist && kfs.length > 0) {
          bestDist = d
          seed = kfs[kfs.length - 1].kf.transform
        }
      }
      const next = addKeyframe(stage, entityId, beat, columns, seed)
      if (next === null) {
        setStatus({ type: 'warn', msg: 'this beat already has a keyframe for that entity' })
        return
      }
      applyEdit(next, null)
      setSelection({ entityId, beat })
    },
    [stage, columns, authoredIndex, applyEdit]
  )

  const handleDeleteKeyframe = useCallback(
    (addr: KeyframeAddress) => {
      if (!stage) return
      const next = removeKeyframe(stage, addr)
      if (next === null) {
        setStatus({ type: 'warn', msg: 'last keyframe — delete the entity instead' })
        return
      }
      applyEdit(next, null)
    },
    [stage, applyEdit]
  )

  const handleSizeChange = useCallback(
    (entityId: string, size: number) => {
      if (!stage) return
      applyEdit(setEntityContent(stage, entityId, { size }), `size:${entityId}`)
    },
    [stage, applyEdit]
  )

  // ⌘Z/⌘S land in the iframe's document while it holds focus (after a
  // preview click) — the chrome forwards them as intents.
  const handleHotkey = useCallback(
    (action: 'undo' | 'save') => {
      if (action === 'undo') undo()
      else if (dirty && !saving) void save()
    },
    [undo, dirty, saving, save]
  )

  return (
    <div className="flex h-screen flex-col gap-3 bg-neutral-950 p-3 text-neutral-100">
      <div className="flex items-center justify-between">
        <h1 className="text-[13px] font-medium text-neutral-300">
          Stage timeline — <span className="text-neutral-500">{slug}</span>
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAddingEntity(true)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-white/5"
          >
            ＋ entity
          </button>
          <StatusBadge status={status} dirty={dirty} />
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-lg bg-white px-4 py-1.5 text-[12px] font-medium text-neutral-950 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black">
          <PreviewFrame
            src={previewUrl}
            seek={playhead}
            stage={stage}
            hasObjects={hasObjects}
            selectedEntityId={selection?.entityId ?? null}
            selectionEditable={selectionEditable}
            onEntityPointerDown={handleEntityPointerDown}
            onEntityEdit={handleEntityEdit}
            onHotkey={handleHotkey}
          />
        </div>
        <div className="w-[280px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/40">
          <InspectorPanel
            stage={stage}
            authoredIndex={authoredIndex}
            selection={selection}
            onTransformChange={handleTransform}
            onTChange={handleT}
            onUseMsTiming={handleUseMsTiming}
            onClearMsTiming={handleClearMsTiming}
            onTimingChange={handleTiming}
            onEasingChange={handleEasing}
            onAddKeyframe={handleAddKeyframe}
            onDeleteKeyframe={handleDeleteKeyframe}
            onDeleteEntity={handleDeleteEntity}
            onSizeChange={handleSizeChange}
          />
        </div>
      </div>

      <div className="h-[260px] shrink-0">
        <BeatTimeline
          columns={columns}
          lifetimes={lifetimes}
          authoredIndex={authoredIndex}
          playhead={playhead}
          selection={selection}
          onSeek={(unit, t) => setPlayhead({ unit, t })}
          onSelect={setSelection}
          onMoveKeyframes={handleMoveKeyframes}
          onAddKeyframe={handleAddKeyframe}
        />
      </div>

      {addingEntity && (
        <AddEntityDialog
          slug={slug}
          existingIds={new Set(stage?.entities.map((e) => e.id) ?? [])}
          onCreate={handleAddEntity}
          onClose={() => setAddingEntity(false)}
        />
      )}
    </div>
  )
}

/** EditorClient's status idiom: doubles as the dirty indicator. */
function StatusBadge({ status, dirty }: { status: Status; dirty: boolean }) {
  if (status.type === 'err') return <span className="truncate text-[12px] text-red-400">{status.msg}</span>
  if (status.type === 'warn')
    return <span className="truncate text-[12px] text-amber-400">{status.msg}</span>
  if (status.type === 'ok' && !dirty)
    return <span className="text-[12px] text-emerald-400">{status.msg}</span>
  return (
    <span className="text-[12px] text-neutral-500">{dirty ? 'Unsaved changes' : 'No changes'}</span>
  )
}
