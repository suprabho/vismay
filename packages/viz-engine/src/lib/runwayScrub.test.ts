/** Throwaway check for the runway scrub math (clock: 'scrubbed', M3):
 *  sectionRunway resolution, runwayProgress clamping + degenerate collapse,
 *  the coversCenterline activation rule, and the scrub↔sampleBeat contract.
 *  (run: npx tsx src/lib/runwayScrub.test.ts) */
import { DEFAULT_RUNWAY, sectionRunway, runwayProgress, coversCenterline } from './runwayScrub'
import { sampleBeat } from './resolveStage'
import type { ResolvedStageFrame, StageTransform } from './storyConfig.types'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9

// ── sectionRunway ────────────────────────────────────────────────────────────
ok('undefined config → null', sectionRunway(undefined) === null)
ok('triggered → null', sectionRunway({ clock: 'triggered' }) === null)
ok('scrubbed defaults runway', sectionRunway({ clock: 'scrubbed' }) === DEFAULT_RUNWAY)
ok('scrubbed with runway', sectionRunway({ clock: 'scrubbed', runway: 3 }) === 3)
ok('runway without clock → null', sectionRunway({ runway: 3 }) === null)

// ── runwayProgress (viewport 800, top 1600, runway 2.5 → height 2000, range 1200)
const VP = 800
const TOP = 1600
const H = 2000
ok('progress at top = 0', runwayProgress(TOP, TOP, H, VP) === 0)
ok('progress before top clamps to 0', runwayProgress(1000, TOP, H, VP) === 0)
ok('progress at end = 1', runwayProgress(TOP + (H - VP), TOP, H, VP) === 1)
ok('progress past end clamps to 1', runwayProgress(9999, TOP, H, VP) === 1)
ok('progress midpoint', approx(runwayProgress(TOP + 600, TOP, H, VP), 0.5))
ok('progress quarter', approx(runwayProgress(TOP + 300, TOP, H, VP), 0.25))
ok('degenerate height==viewport: 0 before top', runwayProgress(TOP - 1, TOP, VP, VP) === 0)
ok('degenerate height==viewport: 1 at top', runwayProgress(TOP, TOP, VP, VP) === 1)
ok('degenerate height<viewport: 1 after top', runwayProgress(TOP + 50, TOP, VP - 100, VP) === 1)

// ── coversCenterline ─────────────────────────────────────────────────────────
// Center = scrollTop + 400. Section box [1600, 3600).
ok('centerline at section top is inclusive', coversCenterline(1200, TOP, H, VP) === true)
ok('centerline at section bottom is exclusive', coversCenterline(3200, TOP, H, VP) === false)
ok('centerline inside', coversCenterline(2000, TOP, H, VP) === true)
ok('centerline before', coversCenterline(1199, TOP, H, VP) === false)
ok('centerline after', coversCenterline(3201, TOP, H, VP) === false)
// Adjacent runways [1600, 3600) and [3600, 5600): scrollTop 3200 (center 3600)
// must be claimed by exactly one — the second.
const claimsA = coversCenterline(3200, 1600, 2000, VP)
const claimsB = coversCenterline(3200, 3600, 2000, VP)
ok('adjacent runways: exactly one claims the boundary', !claimsA && claimsB)

// ── scrub ↔ sampleBeat contract (t * timelineMs drives the beat timeline) ───
const settled: StageTransform = {
  position: { x: 0.3, y: 0.1 },
  scale: 0.9,
  opacity: 1,
  rotation: 10,
  zBand: 'front',
  zIndex: 5,
}
const mid: StageTransform = {
  position: { x: -0.25, y: 0.3 },
  scale: 1,
  opacity: 1,
  rotation: -8,
  zBand: 'front',
  zIndex: 5,
}
const frame: ResolvedStageFrame = {
  present: true,
  transform: settled,
  easing: 'easeInOut',
  segments: [
    { startMs: 0, endMs: 800, from: null, to: mid, easing: 'linear' },
    { startMs: 800, endMs: 1600, from: mid, to: settled, easing: 'linear' },
  ],
  timelineMs: 1600,
}
const entry: StageTransform = {
  position: { x: 0.15, y: 0 },
  scale: 1.25,
  opacity: 1,
  rotation: 4,
  zBand: 'front',
  zIndex: 5,
}
ok('scrub t=1 hits the settled pose by identity', sampleBeat(frame, 1 * frame.timelineMs, entry) === frame.transform)
const fwd = sampleBeat(frame, 0.3 * frame.timelineMs, entry)
const back = sampleBeat(frame, 0.3 * frame.timelineMs, entry)
ok(
  'scrub is bidirectionally deterministic (same t → same pose)',
  approx(fwd.position!.x, back.position!.x) &&
    approx(fwd.scale!, back.scale!) &&
    approx(fwd.rotation!, back.rotation!)
)
// t=0.3 → 480ms into segment 1 (linear, from entry): x = 0.15 + (-.25-.15)*0.6
ok('scrub t=0.3 lerps from the entry pose', approx(fwd.position!.x, 0.15 + (-0.25 - 0.15) * 0.6))
const t0 = sampleBeat(frame, 0, entry)
ok('scrub t=0 returns from ?? entryPose', approx(t0.position!.x, entry.position!.x))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exit(1)
