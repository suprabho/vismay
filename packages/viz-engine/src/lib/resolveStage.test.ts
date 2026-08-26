/** Throwaway check for the Tier-1 stage densifier: beat-selector resolution,
 *  sparse-keyframe sampling (exact / hold / lerp), lifetime gating, role flag
 *  clamping, portrait degrade, enter/exit pre-roll frames, and the v0 slide
 *  timeline (beat-local segments, sub-keyframes, delay/duration, sampleBeat).
 *  (run: npx tsx src/lib/resolveStage.test.ts) */
import {
  resolveStage,
  resolveBeatIndex,
  sampleTrack,
  interpolateTransform,
  sampleBeat,
} from './resolveStage'
import { evalEasing } from './stageEasing'
import type { ResolvedUnit, StorySectionConfig, StageConfig } from './storyConfig.types'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9

// 7 units, each its own section (id s0..s6, subIndex 0).
const units: ResolvedUnit[] = Array.from({ length: 7 }, (_, i) => ({
  parentIndex: i,
  subIndex: 0,
  parentConfig: { id: `s${i}` } as StorySectionConfig,
  heading: undefined,
  subheading: undefined,
  paragraphs: [],
}))

// ── resolveBeatIndex ─────────────────────────────────────────────────────────
ok('beat by section id', resolveBeatIndex(units, { section: 's4' }) === 4)
ok('beat by section index', resolveBeatIndex(units, { section: 2 }) === 2)
ok('beat numeric = flat index', resolveBeatIndex(units, 5) === 5)
ok('beat numeric out of range → -1', resolveBeatIndex(units, 99) === -1)
ok('beat missing section → -1', resolveBeatIndex(units, { section: 'nope' }) === -1)

// ── interpolateTransform ─────────────────────────────────────────────────────
const it = interpolateTransform(
  { position: { x: 0, y: 0 }, scale: 1, zBand: 'mid' },
  { position: { x: 0.2, y: 0.4 }, scale: 1.2, zBand: 'front' },
  0.5
)
ok('interp position midpoint', approx(it.position!.x, 0.1) && approx(it.position!.y, 0.2))
ok('interp scale midpoint', approx(it.scale!, 1.1))
ok('interp zBand holds source (discrete)', it.zBand === 'mid')

// ── sampleTrack (sorted keyframes at idx 1, 2, 4) ────────────────────────────
const kfs = [
  { idx: 1, transform: { position: { x: -0.4, y: -0.3 }, scale: 0.6, zBand: 'mid' as const }, easing: 'easeOut' as const },
  { idx: 2, transform: { position: { x: 0, y: 0 }, scale: 1 }, easing: 'easeInOut' as const },
  { idx: 4, transform: { position: { x: 0.2, y: 0.2 }, scale: 1.2, zBand: 'front' as const, zIndex: 10 }, easing: 'easeInOut' as const },
]
ok('sample exact keyframe', sampleTrack(kfs, 2).transform.position!.x === 0 && sampleTrack(kfs, 2).easing === 'easeInOut')
ok('sample before first holds first', sampleTrack(kfs, 0).transform.scale === 0.6)
ok('sample after last holds last', sampleTrack(kfs, 6).transform.scale === 1.2 && sampleTrack(kfs, 6).transform.zBand === 'front')
const mid = sampleTrack(kfs, 3) // between idx 2 and 4, t=0.5
ok('sample between lerps', approx(mid.transform.position!.x, 0.1) && approx(mid.transform.scale!, 1.1))
ok('sample between carries source easing', mid.easing === 'easeInOut')

// ── resolveStage: subject lifetime + densification ───────────────────────────
const stage: StageConfig = {
  entities: [
    {
      id: 'starship',
      role: 'subject',
      content: { type: 'image', src: '/x.png' },
      enter: { section: 's1' },
      exit: { section: 's5' },
      enterTransform: { position: { x: -0.9, y: -0.6 }, opacity: 0 },
      keyframes: [
        { at: { section: 's1' }, transform: { position: { x: -0.4, y: -0.3 }, scale: 0.6, zBand: 'mid' }, easing: 'easeOut' },
        { at: { section: 's2' }, transform: { position: { x: 0, y: 0 }, scale: 1 } },
        { at: { section: 's4' }, transform: { position: { x: 0.2, y: 0.2 }, scale: 1.2, zBand: 'front', zIndex: 10 } },
      ],
    },
    {
      id: 'drift',
      role: 'object',
      content: { type: 'image', src: '/d.png' },
      interactive: true, // should be FORCED off for objects
      keyframes: [
        { at: { section: 's0' }, transform: { position: { x: 0.6, y: 0.4 }, opacity: 0.35, zBand: 'behind' } },
        { at: { section: 's6' }, transform: { position: { x: -0.5, y: -0.3 }, opacity: 0.2, zBand: 'behind' } },
      ],
    },
  ],
}

const r = resolveStage(units, stage, { isPortrait: false })
ok('two entities resolved', r.entities.length === 2)

const ship = r.entities.find((e) => e.id === 'starship')!
ok('subject interactive defaults true', ship.interactive === true)
ok('subject one frame per unit', ship.frames.length === 7)
ok('frame before enter (pre-roll) present', ship.frames[0].present === true && ship.frames[0].transform.opacity === 0)
ok('frame at enter present', ship.frames[1].present === true && ship.frames[1].transform.scale === 0.6)
ok('frame mid-bracket lerped', approx(ship.frames[3].transform.position!.x, 0.1) && approx(ship.frames[3].transform.scale!, 1.1))
ok('frame at z-focus keyframe', ship.frames[4].transform.zBand === 'front' && ship.frames[4].transform.zIndex === 10)
ok('frame held after last keyframe, within lifetime', ship.frames[5].present === true && ship.frames[5].transform.scale === 1.2)
ok('frame after exit absent', ship.frames[6].present === false)

const drift = r.entities.find((e) => e.id === 'drift')!
ok('object interactive forced false', drift.interactive === false)
ok('object present whole story (no lifetime)', drift.frames.every((f) => f.present))
ok('object frames default-filled', drift.frames[0].transform.zBand === 'behind')

// ── portrait degrade: object hidden by default ───────────────────────────────
const rp = resolveStage(units, stage, { isPortrait: true })
ok('portrait drops the object', rp.entities.length === 1 && rp.entities[0].id === 'starship')

// ── empty / absent stage ─────────────────────────────────────────────────────
ok('undefined stage → empty', resolveStage(units, undefined, { isPortrait: false }).entities.length === 0)
ok('no entities → empty', resolveStage(units, { entities: [] }, { isPortrait: false }).entities.length === 0)
ok('no units → empty', resolveStage([], stage, { isPortrait: false }).entities.length === 0)

// ═════ v0 slide timeline ═════════════════════════════════════════════════════

// ── Back-compat: legacy configs compile to one implicit 700 ms segment ──────
ok(
  'back-compat: every present frame carries exactly one [0,700] retarget segment',
  r.entities.every((e) =>
    e.frames.every(
      (f) =>
        !f.present ||
        (f.segments.length === 1 &&
          f.segments[0].startMs === 0 &&
          f.segments[0].endMs === 700 &&
          f.segments[0].from === null)
    )
  )
)
ok(
  "back-compat: segment 'to' is the settled transform by identity",
  r.entities.every((e) => e.frames.every((f) => !f.present || f.segments[0].to === f.transform))
)
ok(
  'back-compat: timelineMs 700 on present frames, 0 + no segments on absent',
  r.entities.every((e) =>
    e.frames.every((f) =>
      f.present ? f.timelineMs === 700 : f.timelineMs === 0 && f.segments.length === 0
    )
  )
)
ok(
  'back-compat: sampleBeat at/after timelineMs returns the settled transform by identity',
  ship.frames.every((f) => !f.present || (sampleBeat(f, 700, null) === f.transform && sampleBeat(f, 9999, null) === f.transform))
)

// ── evalEasing ──────────────────────────────────────────────────────────────
ok('evalEasing linear identity', approx(evalEasing('linear', 0.3), 0.3))
ok(
  'evalEasing endpoints for all named easings',
  (['ease', 'easeIn', 'easeOut', 'easeInOut'] as const).every(
    (e) => approx(evalEasing(e, 0), 0) && approx(evalEasing(e, 1), 1)
  )
)
ok('evalEasing easeInOut symmetric midpoint', Math.abs(evalEasing('easeInOut', 0.5) - 0.5) < 1e-3)
ok(
  'evalEasing accepts cubicBezier object',
  Math.abs(evalEasing({ cubicBezier: [0.42, 0, 0.58, 1] }, 0.5) - 0.5) < 1e-3
)
ok('evalEasing clamps out-of-range input', evalEasing('linear', 1.5) === 1 && evalEasing('linear', -1) === 0)

// ── ms-mode timing: delayMs / durationMs ────────────────────────────────────
const msStage: StageConfig = {
  entities: [
    {
      id: 'timed',
      role: 'object',
      content: { type: 'image', src: '/t.png' },
      keyframes: [
        { at: { section: 's0' }, transform: { position: { x: 0, y: 0 } }, easing: 'linear' },
        {
          at: { section: 's2' },
          transform: { position: { x: 1, y: 0 } },
          easing: 'linear',
          delayMs: 300,
          durationMs: 900,
        },
      ],
    },
  ],
}
const rm = resolveStage(units, msStage, { isPortrait: false })
const timed = rm.entities[0].frames[2]
ok(
  'ms-mode: segment spans [delayMs, delayMs+durationMs]',
  timed.segments.length === 1 &&
    timed.segments[0].startMs === 300 &&
    timed.segments[0].endMs === 1200 &&
    timed.segments[0].from === null &&
    timed.timelineMs === 1200
)
const entry = { position: { x: -1, y: 0 }, scale: 1, opacity: 1, rotation: 0, zBand: 'mid' as const, zIndex: 0 }
ok('ms-mode: holds entry pose during the delay', sampleBeat(timed, 100, entry) === entry)
const msMid = sampleBeat(timed, 750, entry)
ok('ms-mode: linear midpoint from the entry pose', approx(msMid.position!.x, 0))
ok('ms-mode: settled at endMs', sampleBeat(timed, 1200, entry) === timed.transform)
ok('ms-mode: null entry pose degrades to motionless', sampleBeat(timed, 100, null).position!.x === 1)

// ── Sub-keyframes (t-mode) with section timelineMs ──────────────────────────
const unitsT: ResolvedUnit[] = units.map((u, i) => ({
  ...u,
  parentConfig: { id: `s${i}`, ...(i === 2 ? { timelineMs: 1000 } : {}) } as StorySectionConfig,
}))
const tStage: StageConfig = {
  entities: [
    {
      id: 'multi',
      role: 'object',
      content: { type: 'image', src: '/m.png' },
      keyframes: [
        { at: { section: 's2', t: 0 }, transform: { position: { x: -1, y: 0 }, opacity: 0, zBand: 'front' }, easing: 'linear' },
        { at: { section: 's2', t: 0.4 }, transform: { position: { x: 0.5, y: 0 }, opacity: 1 }, easing: 'linear' },
        { at: { section: 's2', t: 1 }, transform: { position: { x: 0, y: 0 }, opacity: 1, zBand: 'mid' }, easing: 'linear' },
      ],
    },
  ],
}
const rt = resolveStage(unitsT, tStage, { isPortrait: false })
const multi = rt.entities[0].frames[2]
ok(
  't-mode: segments at t*timelineMs',
  multi.segments.length === 3 &&
    multi.segments[0].startMs === 0 &&
    multi.segments[0].endMs === 0 &&
    multi.segments[1].startMs === 0 &&
    multi.segments[1].endMs === 400 &&
    multi.segments[2].startMs === 400 &&
    multi.segments[2].endMs === 1000 &&
    multi.timelineMs === 1000
)
ok('t-mode: settled pose is the largest-t keyframe', approx(multi.transform.position!.x, 0))
const t0pose = sampleBeat(multi, 0, entry)
ok('t-mode: authored t:0 is a hard start (entry pose ignored)', approx(t0pose.position!.x, -1) && t0pose.opacity === 0)
const tMid = sampleBeat(multi, 200, entry)
ok('t-mode: lerps within a sub-segment', approx(tMid.position!.x, -0.25) && approx(tMid.opacity!, 0.5))
ok('t-mode: settled at >= timelineMs', sampleBeat(multi, 1000, entry) === multi.transform)
ok(
  't-mode: zBand/zIndex normalized to the settled values on every segment pose',
  multi.segments.every((s) => s.to.zBand === 'mid' && s.to.zIndex === 0) && multi.transform.zBand === 'mid'
)

// ── t-less member of a multi-keyframe group = the beat's start pose ─────────
const tlessStage: StageConfig = {
  entities: [
    {
      id: 'tless',
      role: 'object',
      content: { type: 'image', src: '/x.png' },
      keyframes: [
        { at: { section: 's3' }, transform: { position: { x: -0.5, y: 0 } }, easing: 'linear' },
        { at: { section: 's3', t: 1 }, transform: { position: { x: 0.5, y: 0 } }, easing: 'linear' },
      ],
    },
  ],
}
const rtl = resolveStage(units, tlessStage, { isPortrait: false })
const tless = rtl.entities[0].frames[3]
ok(
  't-less in a group: start pose (hard) + run to settled over default 700',
  tless.segments.length === 2 &&
    tless.segments[0].endMs === 0 &&
    approx(tless.segments[0].to.position!.x, -0.5) &&
    tless.segments[1].endMs === 700 &&
    approx(tless.transform.position!.x, 0.5)
)

// ── Missing t:0 — prepended retarget run from the live pose ─────────────────
const lateStage: StageConfig = {
  entities: [
    {
      id: 'late',
      role: 'object',
      content: { type: 'image', src: '/l.png' },
      keyframes: [
        { at: { section: 's2', t: 0.5 }, transform: { position: { x: 0, y: 0 } }, easing: 'linear' },
        { at: { section: 's2', t: 1 }, transform: { position: { x: 1, y: 0 } }, easing: 'linear' },
      ],
    },
  ],
}
const rl = resolveStage(units, lateStage, { isPortrait: false })
const late = rl.entities[0].frames[2]
ok(
  'missing t:0: prepended [0, 0.5*T] retarget segment (default T=700)',
  late.segments.length === 2 && late.segments[0].from === null && late.segments[0].endMs === 350
)
ok('missing t:0: retargets from the entry pose', approx(sampleBeat(late, 175, entry).position!.x, -0.5))

// ── Duplicate t dropped defensively (parse rejects; resolver warns) ─────────
const dupStage: StageConfig = {
  entities: [
    {
      id: 'dup',
      role: 'object',
      content: { type: 'image', src: '/d.png' },
      keyframes: [
        { at: { section: 's2', t: 0.5 }, transform: { position: { x: 0.1, y: 0 } } },
        { at: { section: 's2', t: 0.5 }, transform: { position: { x: 0.9, y: 0 } } },
        { at: { section: 's2', t: 1 }, transform: { position: { x: 0, y: 0 } } },
      ],
    },
  ],
}
const rd = resolveStage(units, dupStage, { isPortrait: false })
ok(
  'duplicate t: extras dropped, beat still resolves',
  rd.entities.length === 1 && rd.entities[0].frames[2].present && rd.entities[0].frames[2].segments.length === 2
)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exit(1)
