'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useStoryShell } from './StoryShellContext'
import { resolveAssetUrl } from './lib/assetUrl'
import type {
  ResolvedStage,
  ResolvedStageEntity,
  ResolvedStageFrame,
  StageEasing,
} from './lib/storyConfig.types'

/**
 * Tier-1 "stage" renderer — the 3rd persistent tier (after background +
 * foreground). Paints flat 2D sprites for the story's subjects & objects,
 * reading `frames[activeUnit]` from the densified `ResolvedStage` and either
 * CSS-transitioning between beats (live) or snapping (capture / reduced-motion,
 * the map module's `jumpTo` analog) so headless video frames are deterministic.
 *
 * Two fixed containers bracket the foreground (z-10): a BACK container painted
 * behind the scrolling content (z-auto, earlier in the DOM than the snap
 * container) for `zBand: 'behind' | 'mid'`, and a FRONT container (z-30, above
 * the foreground, below the logo at z-50) for `zBand: 'front'` (subject
 * z-focus). An entity moves between containers across beats by changing its
 * keyframe `zBand`.
 *
 * Tier 1 renders only `content.type === 'image'`; the VizRef shape lets a
 * Tier-2 3D body (e.g. `starship:viewer`) slot in later without re-authoring.
 * No `useStoryReadiness` wiring: StoryShell's live/autoplay path doesn't gate
 * on `window.__pdfReady__` (the PDF report/slides shells, which DO, don't
 * render the stage — that's a Tier-2 follow-up), and a second writer would
 * clobber that flag. Capture determinism comes from the snap path below.
 */

const TWEEN_MS = 700
const FRONT_Z = 30

function cssEasing(e: StageEasing): string {
  if (typeof e === 'object') return `cubic-bezier(${e.cubicBezier.join(',')})`
  switch (e) {
    case 'easeIn':
      return 'ease-in'
    case 'easeOut':
      return 'ease-out'
    case 'easeInOut':
      return 'ease-in-out'
    case 'ease':
      return 'ease'
    default:
      return 'linear'
  }
}

function frameStyle(frame: ResolvedStageFrame, snap: boolean): CSSProperties {
  const t = frame.transform
  const x = t.position?.x ?? 0
  const y = t.position?.y ?? 0
  const scale = t.scale ?? 1
  const rotation = t.rotation ?? 0
  // Centered stage space: (0,0) = stage centre, 1.0 = half the viewport
  // min-dimension (50vmin). y is screen-up, so CSS translateY is negated.
  const dx = `${x * 50}vmin`
  const dy = `${-y * 50}vmin`
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transformOrigin: 'center',
    transform: `translate(calc(-50% + ${dx}), calc(-50% + ${dy})) scale(${scale}) rotate(${rotation}deg)`,
    opacity: t.opacity ?? 1,
    zIndex: t.zIndex ?? 0,
    transition: snap
      ? 'none'
      : `transform ${TWEEN_MS}ms ${cssEasing(frame.easing)}, opacity ${TWEEN_MS}ms ${cssEasing(frame.easing)}`,
    willChange: 'transform, opacity',
  }
}

function StageEntityView({
  entity,
  activeUnit,
  snap,
}: {
  entity: ResolvedStageEntity
  activeUnit: number
  snap: boolean
}) {
  const idx = Math.max(0, Math.min(activeUnit, entity.frames.length - 1))
  const frame = entity.frames[idx]
  if (!frame?.present) return null

  // Tier 1: image bodies only. (Other VizRef types are reserved for Tier 2.)
  if (entity.content.type !== 'image') return null
  const src = typeof entity.content.src === 'string' ? entity.content.src : undefined
  if (!src) return null
  const size = typeof entity.content.size === 'number' ? entity.content.size : 0.2
  const alt = typeof entity.content.alt === 'string' ? entity.content.alt : ''

  return (
    <div
      data-stage-entity={entity.id}
      style={{
        ...frameStyle(frame, snap),
        width: `${size * 100}vmin`,
        height: 'auto',
        pointerEvents: entity.interactive ? 'auto' : 'none',
        cursor: entity.interactive ? 'grab' : 'default',
        userSelect: 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveAssetUrl(src)}
        alt={alt}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
      />
    </div>
  )
}

export interface StageVizSlotProps {
  stage: ResolvedStage
  activeUnit: number
}

export default function StageVizSlot({ stage, activeUnit }: StageVizSlotProps) {
  const { isCapture } = useStoryShell()
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (!stage.entities.length) return null
  const snap = isCapture || reducedMotion

  // Split entities by their CURRENT beat's zBand: 'front' paints above the
  // foreground, everything else behind the scrolling content.
  const back: ResolvedStageEntity[] = []
  const front: ResolvedStageEntity[] = []
  for (const e of stage.entities) {
    const idx = Math.max(0, Math.min(activeUnit, e.frames.length - 1))
    const f = e.frames[idx]
    if (f?.present && f.transform.zBand === 'front') front.push(e)
    else back.push(e)
  }

  return (
    <>
      {/* BACK — behind the scrolling content. No z-index (z-auto): placed in the
          DOM before the snap container, so content paints over it; above the
          map background (z-0) which is earlier still. */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        {back.map((e) => (
          <StageEntityView key={e.id} entity={e} activeUnit={activeUnit} snap={snap} />
        ))}
      </div>
      {/* FRONT — above the foreground (z-10) and hero (z-20), below the logo
          (z-50). Hosts subjects that take z-focus. */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: FRONT_Z }} aria-hidden>
        {front.map((e) => (
          <StageEntityView key={e.id} entity={e} activeUnit={activeUnit} snap={snap} />
        ))}
      </div>
    </>
  )
}
