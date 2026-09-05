'use client'

import { ScrubField, labelCls, selectCls } from '@vismay/viz-admin'
import type { FlatTransform, TransformPatch } from './stageEditing'

const Z_BANDS = ['behind', 'mid', 'front'] as const

/**
 * Compact scrubbable grid for a stage keyframe's transform — the stage-tier
 * sibling of `@vismay/viz-admin`'s `TransformControls` (which targets the
 * share-card `TransformLike` shape: xPct/widthPct — not reusable here).
 * Takes the defaults-applied flat view (`flattenTransform`), emits partial
 * patches; clamping comes free from `ScrubField`.
 */
export default function StageTransformControls({
  transform,
  onChange,
}: {
  transform: FlatTransform
  onChange: (patch: TransformPatch) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="X" value={transform.x} min={-2} max={2} step={0.01} onChange={(x) => onChange({ x })} />
        <ScrubField label="Y" value={transform.y} min={-2} max={2} step={0.01} onChange={(y) => onChange({ y })} />
        <ScrubField
          label="Scale"
          value={transform.scale}
          min={0}
          max={3}
          step={0.01}
          onChange={(scale) => onChange({ scale })}
        />
        <ScrubField
          label="Rot"
          value={transform.rotation}
          min={-180}
          max={180}
          step={1}
          format={(v) => `${v}°`}
          onChange={(rotation) => onChange({ rotation })}
        />
        <ScrubField
          label="Op"
          value={transform.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(opacity) => onChange({ opacity })}
        />
        <ScrubField
          label="Z"
          value={transform.zIndex}
          min={-10}
          max={10}
          step={1}
          onChange={(zIndex) => onChange({ zIndex })}
        />
      </div>
      <label className="flex items-center gap-2">
        <span className={labelCls}>band</span>
        <select
          value={transform.zBand}
          onChange={(e) => onChange({ zBand: e.target.value as FlatTransform['zBand'] })}
          className={selectCls}
        >
          {Z_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
