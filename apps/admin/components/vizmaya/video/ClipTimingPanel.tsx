'use client'

import {
  DEFAULT_ENTER_ANIM,
  DEFAULT_EXIT_ANIM,
  type EnterExitAnim,
  type VideoClip,
  type VideoProjectSnapshot,
} from '@vismay/viz-admin'
import { patchClip, removeClip } from './composer/projectToComposerState'

const labelCls = 'block text-[11px] font-medium text-neutral-400'
const inputCls =
  'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'
const selectCls = inputCls

const ANIM_KINDS: EnterExitAnim['kind'][] = ['none', 'fade', 'slide', 'scale']
const DIRECTIONS: NonNullable<EnterExitAnim['direction']>[] = ['left', 'right', 'up', 'down']
const EASINGS = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut'] as const

/**
 * Per-clip timing + animation editor for the selected clip: start / duration /
 * source trim (media + audio only) and enter/exit ramps. Every edit patches the
 * snapshot via `patchClip`, keeping the snapshot the single source of truth.
 */
export function ClipTimingPanel({
  snapshot,
  clipId,
  onSnapshotChange,
  onClearSelection,
}: {
  snapshot: VideoProjectSnapshot
  clipId: string
  onSnapshotChange: (next: VideoProjectSnapshot) => void
  onClearSelection: () => void
}) {
  const clip = snapshot.clips.find((c) => c.id === clipId)
  if (!clip) return <p className="text-[11px] text-neutral-600">Select a clip to edit its timing.</p>

  const isMedia = clip.layer.type === 'video' || clip.layer.type === 'audio'
  const patch = (p: Partial<VideoClip>) => onSnapshotChange(patchClip(snapshot, clip.id, p))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-neutral-200">Clip timing</h3>
        <button
          onClick={() => {
            onSnapshotChange(removeClip(snapshot, clip.id))
            onClearSelection()
          }}
          className="rounded px-1.5 text-[11px] text-red-300/80 hover:bg-white/10 hover:text-red-200"
        >
          Delete clip
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Start (ms)"
          value={clip.startMs}
          min={0}
          onChange={(v) => patch({ startMs: Math.max(0, v) })}
        />
        <NumberField
          label="Duration (ms)"
          value={clip.durationMs}
          min={100}
          onChange={(v) => patch({ durationMs: Math.max(100, v) })}
        />
      </div>

      {isMedia && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Source in (ms)"
            value={clip.sourceInMs ?? 0}
            min={0}
            onChange={(v) => patch({ sourceInMs: Math.max(0, v) })}
          />
          <NumberField
            label="Source out (ms)"
            value={clip.sourceOutMs ?? (clip.sourceInMs ?? 0) + clip.durationMs}
            min={0}
            onChange={(v) => patch({ sourceOutMs: Math.max(0, v) })}
          />
        </div>
      )}

      <AnimEditor
        title="Enter"
        anim={clip.enterAnim}
        fallback={DEFAULT_ENTER_ANIM}
        onChange={(enterAnim) => patch({ enterAnim })}
      />
      <AnimEditor
        title="Exit"
        anim={clip.exitAnim}
        fallback={DEFAULT_EXIT_ANIM}
        onChange={(exitAnim) => patch({ exitAnim })}
      />
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min?: number
  onChange: (v: number) => void
}) {
  return (
    <label className={labelCls}>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        step={50}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
        className={inputCls}
      />
    </label>
  )
}

/** Enter or exit ramp editor: kind / duration / direction (slide) / easing. */
function AnimEditor({
  title,
  anim,
  fallback,
  onChange,
}: {
  title: string
  anim: EnterExitAnim
  fallback: EnterExitAnim
  onChange: (next: EnterExitAnim) => void
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-[11px] font-semibold text-neutral-300">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Kind
          <select
            value={anim.kind}
            onChange={(e) => {
              const kind = e.target.value as EnterExitAnim['kind']
              // Seed sensible defaults when switching away from 'none'.
              onChange({ ...fallback, ...anim, kind })
            }}
            className={selectCls}
          >
            {ANIM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Duration (ms)
          <input
            type="number"
            value={anim.durationMs}
            min={0}
            step={50}
            disabled={anim.kind === 'none'}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) onChange({ ...anim, durationMs: Math.max(0, n) })
            }}
            className={`${inputCls} disabled:opacity-40`}
          />
        </label>
      </div>
      {anim.kind === 'slide' && (
        <label className={labelCls}>
          Direction
          <select
            value={anim.direction ?? 'left'}
            onChange={(e) => onChange({ ...anim, direction: e.target.value as EnterExitAnim['direction'] })}
            className={selectCls}
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      {anim.kind !== 'none' && (
        <label className={labelCls}>
          Easing
          <select
            value={typeof anim.easing === 'string' ? anim.easing : 'easeInOut'}
            onChange={(e) => onChange({ ...anim, easing: e.target.value as EnterExitAnim['easing'] })}
            className={selectCls}
          >
            {EASINGS.map((ea) => (
              <option key={ea} value={ea}>
                {ea}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
