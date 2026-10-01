'use client'

import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useStoryShell } from './StoryShellContext'
import StageEditChrome from './StageEditChrome'
import { resolveAssetUrl } from './lib/assetUrl'
import { sampleBeat } from './lib/resolveStage'
import { usePrefersReducedMotion } from './lib/usePrefersReducedMotion'
import type {
  ResolvedStage,
  ResolvedStageEntity,
  StageTransform,
} from './lib/storyConfig.types'

/**
 * Stage renderer — the 3rd persistent tier (after background + foreground).
 * Paints flat 2D sprites for the story's subjects & objects.
 *
 * v2 (the slide timeline): instead of one global CSS transition per beat
 * change, a rAF clock plays the active beat's compiled segment list
 * (`frames[activeUnit].segments`) — per-entity delays, durations, easings and
 * sub-keyframes — sampling poses via the pure `sampleBeat` and writing
 * transform/opacity imperatively. Interrupts (fast or reverse scroll) retarget
 * from the last SAMPLED pose, so motion stays continuous. Capture
 * (`isCapture`) and reduced-motion write the settled pose synchronously with
 * no clock — byte-identical to the original snap path, keeping headless video
 * frames deterministic. See docs/stage-timeline-and-section-transitions.md.
 *
 * Two fixed containers bracket the foreground (z-10): a BACK container painted
 * behind the scrolling content (z-auto, earlier in the DOM than the snap
 * container) for `zBand: 'behind' | 'mid'`, and a FRONT container (z-30, above
 * the foreground, below the logo at z-50) for `zBand: 'front'` (subject
 * z-focus). An entity moves between containers across beats by changing its
 * keyframe `zBand` (band membership is per-beat settled — never mid-tween).
 *
 * Renders only `content.type === 'image'`; the VizRef shape lets a Tier-2 3D
 * body (e.g. `starship:viewer`) slot in later without re-authoring. No
 * `useStoryReadiness` wiring: the PDF shells (which gate on
 * `window.__pdfReady__`) don't render the stage, and a second writer would
 * clobber that flag.
 */

const FRONT_Z = 30

function clampIdx(activeUnit: number, len: number): number {
  return Math.max(0, Math.min(activeUnit, len - 1))
}

/**
 * The animated CSS channels for a pose, in centered stage space:
 * (0,0) = stage centre, 1.0 = half the viewport min-dimension (50vmin).
 * y is screen-up, so CSS translateY is negated.
 */
function poseCss(pose: StageTransform): { transform: string; opacity: number } {
  const x = pose.position?.x ?? 0
  const y = pose.position?.y ?? 0
  const scale = pose.scale ?? 1
  const rotation = pose.rotation ?? 0
  const dx = `${x * 50}vmin`
  const dy = `${-y * 50}vmin`
  return {
    transform: `translate(calc(-50% + ${dx}), calc(-50% + ${dy})) scale(${scale}) rotate(${rotation}deg)`,
    opacity: pose.opacity ?? 1,
  }
}

function StageEntityView({
  entity,
  activeUnit,
  registerNode,
  editing,
}: {
  entity: ResolvedStageEntity
  activeUnit: number
  registerNode: (id: string, el: HTMLDivElement | null) => void
  /** Editor mode (W2): every entity becomes hittable for on-canvas
   *  selection, overriding the authored `interactive` flag (objects are
   *  `pointer-events: none` by design outside the editor). */
  editing: boolean
}) {
  const idx = clampIdx(activeUnit, entity.frames.length)
  const frame = entity.frames[idx]
  if (!frame?.present) return null

  // Image bodies only. (Other VizRef types are reserved for the 3D tier.)
  if (entity.content.type !== 'image') return null
  const src = typeof entity.content.src === 'string' ? entity.content.src : undefined
  if (!src) return null
  const size = typeof entity.content.size === 'number' ? entity.content.size : 0.2
  const alt = typeof entity.content.alt === 'string' ? entity.content.alt : ''

  // React renders the SETTLED pose for the active beat (correct for SSR and
  // for any commit — the clock's layout effect overwrites with the sampled
  // pose before paint). Because this style only changes when the beat
  // changes, unrelated re-renders never clobber the rAF-written values.
  const settled = poseCss(frame.transform)
  const style: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transformOrigin: 'center',
    transform: settled.transform,
    opacity: settled.opacity,
    zIndex: frame.transform.zIndex ?? 0,
    willChange: 'transform, opacity',
    width: `${size * 100}vmin`,
    height: 'auto',
    pointerEvents: editing || entity.interactive ? 'auto' : 'none',
    cursor: editing || entity.interactive ? 'grab' : 'default',
    userSelect: 'none',
  }

  return (
    <div
      data-stage-entity={entity.id}
      ref={(el) => registerNode(entity.id, el)}
      style={style}
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
  const { isCapture, units, scrub, seek, editing } = useStoryShell()
  const reducedMotion = usePrefersReducedMotion()
  const snap = isCapture || reducedMotion

  // Scrubbed beat (clock: 'scrubbed'): the shell publishes scroll progress on
  // the `scrub` ref and this beat's timeline is scroll-driven instead of
  // wall-clock. Detected from config, never from a `t` prop — a prop would
  // re-run the clock effect (recapturing entry poses) on every scroll frame.
  const activeCfg = units[clampIdx(activeUnit, units.length)]?.parentConfig
  const scrubbedBeat = !snap && scrub != null && activeCfg?.clock === 'scrubbed'
  // External seek (admin editor, E1): the shell publishes {unit, t} on the
  // `seek` ref regardless of the beat's authored clock — it wins over BOTH
  // `scrubbedBeat` and the triggered wall-clock. Detected the same way as
  // `scrubbedBeat` — from the ref's presence, never a `t` prop.
  const seeking = !snap && seek != null && seek.current != null && seek.current.unit === activeUnit

  const nodeRefs = useRef(new Map<string, HTMLDivElement | null>())
  // Last SAMPLED pose per entity — the retarget source when a beat change
  // interrupts a running tween. Rebased when the stage identity changes
  // (orientation flip re-resolves against a different units array).
  const lastPosesRef = useRef(new Map<string, StageTransform>())
  const lastStageRef = useRef<ResolvedStage>(stage)

  useLayoutEffect(() => {
    if (lastStageRef.current !== stage) {
      lastStageRef.current = stage
      lastPosesRef.current.clear()
    }

    const runs = stage.entities.map((e) => {
      const frame = e.frames[clampIdx(activeUnit, e.frames.length)]
      return { e, frame, entryPose: lastPosesRef.current.get(e.id) ?? null }
    })
    // Absent entities render nothing; drop their remembered pose so a later
    // re-entry (past a lifetime gap) doesn't retarget from a stale pose.
    for (const r of runs) {
      if (!r.frame?.present) lastPosesRef.current.delete(r.e.id)
    }

    const write = (tMs: number) => {
      for (const r of runs) {
        if (!r.frame?.present) continue
        const el = nodeRefs.current.get(r.e.id)
        if (!el) continue
        const pose = sampleBeat(r.frame, tMs, r.entryPose)
        const css = poseCss(pose)
        el.style.transform = css.transform
        el.style.opacity = String(css.opacity)
        lastPosesRef.current.set(r.e.id, pose)
      }
    }

    // Capture / reduced motion: settle instantly — the deterministic path the
    // headless video walk depends on. (Playwright forces reduced-motion off,
    // so `isCapture` does the work there.)
    if (snap) {
      write(Infinity)
      return
    }

    // External seek (admin editor, E1): wins over both clocks. A payload for
    // another unit is a handoff frame from the admin timeline — ignored,
    // same rule the scrub branch below uses. Entry pose is always the
    // PREVIOUS beat's SETTLED transform (read fresh from `frames`, never
    // `lastPosesRef`'s history-dependent last-sampled value) so seeking to
    // the same (unit, t) renders identically no matter how the editor got
    // there — jumped straight in vs. scrubbed through several beats first.
    if (seeking && seek) {
      const prevFrame =
        activeUnit > 0 ? stage.entities.map((e) => e.frames[clampIdx(activeUnit - 1, e.frames.length)]) : null
      const seekRuns = stage.entities.map((e, i) => {
        const frame = e.frames[clampIdx(activeUnit, e.frames.length)]
        const prev = prevFrame?.[i]
        const entryPose = prev?.present ? prev.transform : null
        return { e, frame, entryPose }
      })
      const writeSeek = (t: number) => {
        for (const r of seekRuns) {
          if (!r.frame?.present) continue
          const el = nodeRefs.current.get(r.e.id)
          if (!el) continue
          const pose = sampleBeat(r.frame, t * r.frame.timelineMs, r.entryPose)
          const css = poseCss(pose)
          el.style.transform = css.transform
          el.style.opacity = String(css.opacity)
          lastPosesRef.current.set(r.e.id, pose)
        }
      }
      let lastT = seek.current!.t
      writeSeek(lastT)
      let raf = requestAnimationFrame(function tick() {
        const s = seek.current
        if (s && s.unit === activeUnit && s.t !== lastT) {
          lastT = s.t
          writeSeek(lastT)
        }
        raf = requestAnimationFrame(tick)
      })
      return () => cancelAnimationFrame(raf)
    }

    // Scrubbed beat: scroll progress IS the clock. The loop lives for the
    // whole beat (the reader can park mid-runway and come back); t maps onto
    // EACH entity's own beat timeline (t * frame.timelineMs), so every entity
    // completes its choreography exactly at the runway's end and t=1 hits the
    // settled pose by identity. entryPose semantics are unchanged — captured
    // once at beat entry, so backward scrubs replay the identical curve.
    if (scrubbedBeat && scrub) {
      const writeScrub = (t: number) => {
        for (const r of runs) {
          if (!r.frame?.present) continue
          const el = nodeRefs.current.get(r.e.id)
          if (!el) continue
          const pose = sampleBeat(r.frame, t * r.frame.timelineMs, r.entryPose)
          const css = poseCss(pose)
          el.style.transform = css.transform
          el.style.opacity = String(css.opacity)
          lastPosesRef.current.set(r.e.id, pose)
        }
      }
      const initial = scrub.current
      let lastT = initial && initial.unit === activeUnit ? initial.t : 0
      writeScrub(lastT)
      let raf = requestAnimationFrame(function tick() {
        const s = scrub.current
        // Ignore payloads for another unit (handoff frames) — hold the pose.
        if (s && s.unit === activeUnit && s.t !== lastT) {
          lastT = s.t
          writeScrub(lastT)
        }
        raf = requestAnimationFrame(tick)
      })
      return () => cancelAnimationFrame(raf)
    }

    write(0)
    const total = runs.reduce((m, r) => Math.max(m, r.frame?.present ? r.frame.timelineMs : 0), 0)
    if (total <= 0) return
    const start = performance.now()
    let raf = requestAnimationFrame(function tick(now: number) {
      const tMs = now - start
      if (tMs < total) {
        write(tMs)
        raf = requestAnimationFrame(tick)
      } else {
        write(Infinity)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [stage, activeUnit, snap, scrubbedBeat, scrub, seeking, seek])

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  if (!stage.entities.length) return null

  // Split entities by their CURRENT beat's settled zBand: 'front' paints above
  // the foreground, everything else behind the scrolling content.
  const back: ResolvedStageEntity[] = []
  const front: ResolvedStageEntity[] = []
  for (const e of stage.entities) {
    const f = e.frames[clampIdx(activeUnit, e.frames.length)]
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
          <StageEntityView
            key={e.id}
            entity={e}
            activeUnit={activeUnit}
            registerNode={registerNode}
            editing={editing === true}
          />
        ))}
      </div>
      {/* FRONT — above the foreground (z-10) and hero (z-20), below the logo
          (z-50). Hosts subjects that take z-focus. */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: FRONT_Z }} aria-hidden>
        {front.map((e) => (
          <StageEntityView
            key={e.id}
            entity={e}
            activeUnit={activeUnit}
            registerNode={registerNode}
            editing={editing === true}
          />
        ))}
      </div>
      {/* Editor-only on-canvas chrome (W2): selection ring, transform
          handles, and the viz-story-entity-* bridge. */}
      {editing && <StageEditChrome stage={stage} activeUnit={activeUnit} nodeRefs={nodeRefs} />}
    </>
  )
}
