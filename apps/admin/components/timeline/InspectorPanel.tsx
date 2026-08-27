'use client'

import type { StageConfig, StageKeyframe } from '@vismay/viz-engine'
import type { AuthoredKeyframeIndex } from './timelineShape'
import type { Selection } from './BeatTimeline'

/**
 * Read-only detail panel for the selected (entity, beat) cell — E1 only
 * reveals config, it doesn't edit it. Shows the entity's static fields plus
 * whatever authored keyframe(s) land on the selected beat, or an
 * "interpolated" note when none do (the beat's pose comes purely from
 * cross-beat easing, nothing was written there).
 */
export default function InspectorPanel({
  stage,
  authoredIndex,
  selection,
}: {
  stage: StageConfig | null
  authoredIndex: AuthoredKeyframeIndex
  selection: Selection | null
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
  const keyframes: StageKeyframe[] = authoredIndex[entity.id]?.[selection.beat] ?? []

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

      <div className="mb-1 text-neutral-500">keyframe{keyframes.length === 1 ? '' : 's'} on this beat</div>
      {keyframes.length === 0 ? (
        <p className="italic text-neutral-500">interpolated — no keyframe authored on this beat</p>
      ) : (
        keyframes.map((kf, i) => (
          <pre
            key={i}
            className="mb-2 overflow-x-auto rounded bg-black/40 p-2 text-[11px] text-neutral-300"
          >
            {JSON.stringify(kf, null, 2)}
          </pre>
        ))
      )}
    </div>
  )
}
