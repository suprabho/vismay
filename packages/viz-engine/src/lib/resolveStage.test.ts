/** Throwaway check for the Tier-1 stage densifier: beat-selector resolution,
 *  sparse-keyframe sampling (exact / hold / lerp), lifetime gating, role flag
 *  clamping, portrait degrade, and enter/exit pre-roll frames.
 *  (run: npx tsx src/lib/resolveStage.test.ts) */
import {
  resolveStage,
  resolveBeatIndex,
  sampleTrack,
  interpolateTransform,
} from './resolveStage'
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exit(1)
