'use client'

import { ScrubField, labelCls, selectCls } from '@vismay/viz-admin'
import type { StageConfig, StageEasing, StageKeyframe } from '@vismay/viz-engine'
import type { AuthoredKeyframeIndex, AuthoredKf } from './timelineShape'
import type { Selection } from './BeatTimeline'
import {
  type KeyframeAddress,
  type TransformPatch,
  canUseMsTiming,
  flattenTransform,
} from './stageEditing'
import StageTransformControls from './StageTransformControls'

const NAMED_EASINGS = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut'] as const
/** Sentinel for "no easing authored" (engine default easeInOut applies). */
const EASING_DEFAULT = '(default)'

/**
 * E2 inspector: the selected (entity, beat) cell's authored keyframes as
 * editable cards — transform scrub grid, t vs delay/duration timing modes
 * (mutual exclusivity and the sole-keyframe rule enforced by construction),
 * named-easing select. All edits emit through callbacks; the client root owns
 * the stage snapshot and routes them through the pure `stageEditing` helpers.
 */
export default function InspectorPanel({
  stage,
  authoredIndex,
  selection,
  onTransformChange,
  onTChange,
  onUseMsTiming,
  onClearMsTiming,
  onTimingChange,
  onEasingChange,
}: {
  stage: StageConfig | null
  authoredIndex: AuthoredKeyframeIndex
  selection: Selection | null
  onTransformChange: (addr: KeyframeAddress, patch: TransformPatch) => void
  onTChange: (addr: KeyframeAddress, t: number) => void
  onUseMsTiming: (addr: KeyframeAddress, seed: { delayMs: number; durationMs: number }) => void
  onClearMsTiming: (addr: KeyframeAddress) => void
  onTimingChange: (addr: KeyframeAddress, timing: { delayMs: number; durationMs: number }) => void
  onEasingChange: (addr: KeyframeAddress, easing: StageEasing | undefined) => void
}) {
  if (!selection) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center text-[12px] text-neutral-500">
        Click a beat cell to inspect it.
      </div>
    )
  }

  const entity = stage?.entities.find((e) => e.id === selection.entityId)
  if (!entity) return null

  const src =
    typeof entity.content.src === 'string' ? entity.content.src : JSON.stringify(entity.content)
  const keyframes: AuthoredKf[] = [...(authoredIndex[entity.id]?.[selection.beat] ?? [])].sort(
    (a, b) => (tOf(a.kf) ?? -1) - (tOf(b.kf) ?? -1)
  )
  const msAllowed = canUseMsTiming(authoredIndex, entity.id, selection.beat)

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-3 text-[12px]">
      <div className="mb-3">
        <div className="text-[13px] font-medium text-neutral-100">{entity.id}</div>
        <div className="text-neutral-500">beat {selection.beat}</div>
      </div>

      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt className="text-neutral-500">role</dt>
        <dd className="text-neutral-200">{entity.role}</dd>
        <dt className="text-neutral-500">type</dt>
        <dd className="truncate text-neutral-200">{entity.content.type}</dd>
        <dt className="text-neutral-500">src</dt>
        <dd className="truncate text-neutral-200" title={src}>
          {src}
        </dd>
        <dt className="text-neutral-500">interactive</dt>
        <dd className="text-neutral-200">
          {String(entity.role === 'object' ? false : (entity.interactive ?? true))}
        </dd>
        <dt className="text-neutral-500">zFocusCapable</dt>
        <dd className="text-neutral-200">
          {String(entity.role === 'object' ? false : (entity.zFocusCapable ?? false))}
        </dd>
      </dl>

      {keyframes.length === 0 ? (
        <p className="italic text-neutral-500">interpolated — no keyframe authored on this beat</p>
      ) : (
        keyframes.map(({ kfIndex, kf }) => {
          const addr: KeyframeAddress = { entityId: entity.id, kfIndex }
          return (
            <KeyframeCard
              key={kfIndex}
              kf={kf}
              addr={addr}
              soleOnBeat={keyframes.length === 1}
              msAllowed={msAllowed}
              onTransformChange={onTransformChange}
              onTChange={onTChange}
              onUseMsTiming={onUseMsTiming}
              onClearMsTiming={onClearMsTiming}
              onTimingChange={onTimingChange}
              onEasingChange={onEasingChange}
            />
          )
        })
      )}
    </div>
  )
}

function tOf(kf: StageKeyframe): number | undefined {
  return typeof kf.at === 'object' ? kf.at.t : undefined
}

function KeyframeCard({
  kf,
  addr,
  soleOnBeat,
  msAllowed,
  onTransformChange,
  onTChange,
  onUseMsTiming,
  onClearMsTiming,
  onTimingChange,
  onEasingChange,
}: {
  kf: StageKeyframe
  addr: KeyframeAddress
  soleOnBeat: boolean
  msAllowed: boolean
  onTransformChange: (addr: KeyframeAddress, patch: TransformPatch) => void
  onTChange: (addr: KeyframeAddress, t: number) => void
  onUseMsTiming: (addr: KeyframeAddress, seed: { delayMs: number; durationMs: number }) => void
  onClearMsTiming: (addr: KeyframeAddress) => void
  onTimingChange: (addr: KeyframeAddress, timing: { delayMs: number; durationMs: number }) => void
  onEasingChange: (addr: KeyframeAddress, easing: StageEasing | undefined) => void
}) {
  const t = tOf(kf)
  const msMode = kf.delayMs !== undefined || kf.durationMs !== undefined
  const bezier =
    typeof kf.easing === 'object' && kf.easing !== null ? kf.easing.cubicBezier : undefined
  const label = msMode ? 'delay/duration' : t !== undefined ? `t: ${t}` : 'settled'

  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-neutral-900/40 p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="rotate-0 text-[11px] font-medium text-sky-300">◆ {label}</span>
      </div>

      <StageTransformControls
        transform={flattenTransform(kf.transform)}
        onChange={(patch) => onTransformChange(addr, patch)}
      />

      <div className="mt-2 border-t border-white/5 pt-2">
        <div className="mb-1.5 flex items-center gap-1">
          <span className={labelCls}>timing</span>
          <div className="ml-auto flex overflow-hidden rounded-md border border-white/10 text-[10px]">
            <button
              type="button"
              onClick={() => msMode && onClearMsTiming(addr)}
              className={`px-2 py-0.5 ${!msMode ? 'bg-sky-500/20 text-sky-200' : 'text-neutral-400 hover:bg-white/5'}`}
            >
              beat t
            </button>
            <button
              type="button"
              disabled={!msAllowed}
              title={msAllowed ? undefined : 'only valid on a beat’s sole keyframe'}
              onClick={() =>
                !msMode && msAllowed && onUseMsTiming(addr, { delayMs: 0, durationMs: 700 })
              }
              className={`px-2 py-0.5 ${msMode ? 'bg-sky-500/20 text-sky-200' : 'text-neutral-400 hover:bg-white/5'} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              delay/dur
            </button>
          </div>
        </div>
        {msMode ? (
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              label="Delay"
              value={kf.delayMs ?? 0}
              min={0}
              max={10000}
              step={50}
              onChange={(delayMs) =>
                onTimingChange(addr, { delayMs, durationMs: kf.durationMs ?? 700 })
              }
            />
            <ScrubField
              label="Dur"
              value={kf.durationMs ?? 700}
              min={0}
              max={10000}
              step={50}
              onChange={(durationMs) =>
                onTimingChange(addr, { delayMs: kf.delayMs ?? 0, durationMs })
              }
            />
          </div>
        ) : t !== undefined ? (
          <ScrubField
            label="t"
            value={t}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onTChange(addr, v)}
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="italic text-neutral-500">
              {soleOnBeat ? 'settled pose (implicit t: 1)' : 'start pose (implicit t: 0)'}
            </span>
            <button
              type="button"
              onClick={() => onTChange(addr, soleOnBeat ? 1 : 0)}
              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-white/5"
            >
              add t
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 border-t border-white/5 pt-2">
        <label className="flex items-center gap-2">
          <span className={labelCls}>easing</span>
          {bezier ? (
            <span
              className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300"
              title="custom bezier — edit in YAML"
            >
              cubicBezier({bezier.join(', ')})
            </span>
          ) : (
            <select
              value={typeof kf.easing === 'string' ? kf.easing : EASING_DEFAULT}
              onChange={(e) =>
                onEasingChange(
                  addr,
                  e.target.value === EASING_DEFAULT ? undefined : (e.target.value as StageEasing)
                )
              }
              className={selectCls}
            >
              <option value={EASING_DEFAULT}>{EASING_DEFAULT}</option>
              {NAMED_EASINGS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>
    </div>
  )
}
