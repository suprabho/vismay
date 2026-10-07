/**
 * Replay moments: everything in a race worth pointing the 3D replay at, each
 * with the cue the recap story format needs (lap or exact session time,
 * camera, car). The recap brief lists them under "Replay moments" so the
 * agent writing a race recap copies cues instead of guessing them.
 *
 * Pure, like ./buildRecap: rows in, moments out.
 */

import type { CameraMode } from '../web/three/cameraModes'
import {
  indexRace,
  rankPasses,
  rankPitSwings,
  formatLapTime,
  type PassPick,
  type Race,
  type RecapInputs,
} from './buildRecap'

export type ReplayMomentKind =
  | 'start'
  | 'lead-change'
  | 'pass'
  | 'duel'
  | 'pit-swing'
  | 'safety-car'
  | 'retirement'
  | 'fastest-lap'
  | 'finish'

export interface ReplayMoment {
  kind: ReplayMomentKind
  lap: number
  /** Exact session time (s), when the moment is pinned to one. */
  at?: number
  cam: CameraMode
  /** Code of the car to follow. */
  focus: string | null
  /** One line with the numbers, e.g. "Piastri passes Sainz for P2 into Turn 6". */
  text: string
}

export interface LocatedPass {
  /** Session time of the pass (s). */
  at: number
  corner: string | null
}

const passKey = (p: PassPick) => `${p.lap}:${p.a}:${p.b}`

/**
 * @param located  passes from rankPasses(…) located on their lap (locatePass),
 *                 keyed `${lap}:${a}:${b}`; the others get a lap cue only.
 */
export function findMoments(inputs: RecapInputs, located: Map<string, LocatedPass> = new Map()): ReplayMoment[] {
  const race = indexRace(inputs)
  const out: ReplayMoment[] = []
  const leaderAt = (lap: number) => [...race.laps.keys()].find((dn) => race.pos(dn, lap) === 1)

  // Lights out.
  const grid = new Map(race.results.map((r) => [r.driverNumber, r.gridPosition]))
  const pole = [...grid].find(([, g]) => g === 1)?.[0]
  const lead1 = leaderAt(1)
  let gainer: { dn: number; delta: number; to: number } | null = null
  for (const [dn, g] of grid) {
    const to = race.pos(dn, 1)
    if (!g || to == null) continue
    if (!gainer || g - to > gainer.delta) gainer = { dn, delta: g - to, to }
  }
  if (lead1 != null) {
    let text =
      pole === lead1
        ? `${race.name(lead1)} leads away from pole`
        : `${race.name(lead1)} leads lap 1${pole != null ? ` from polesitter ${race.name(pole)}` : ''}`
    if (gainer && gainer.delta >= 2) text += `; ${race.name(gainer.dn)} gains ${gainer.delta} places (P${gainer.to + gainer.delta} → P${gainer.to})`
    out.push({ kind: 'start', lap: 1, cam: 'heli', focus: race.code(lead1), text })
  }

  // Changes of leader, and why.
  for (let lap = 2; lap <= race.totalLaps; lap++) {
    const now = leaderAt(lap), was = leaderAt(lap - 1)
    if (now == null || was == null || now === was) continue
    const pitted = race.pitLaps(was).some((l) => l === lap || l === lap - 1)
    const how = pitted ? `as ${race.name(was)} pits` : race.neutralised(lap) ? 'under the safety car' : `from ${race.name(was)} on track`
    out.push({ kind: 'lead-change', lap, cam: 'tv', focus: race.code(now), text: `${race.name(now)} takes the lead ${how}` })
  }

  // On-track passes.
  for (const p of rankPasses(race, 6)) {
    const loc = located.get(passKey(p))
    const where = loc?.corner ? ` into ${loc.corner}` : ''
    const before = p.gapBefore != null ? ` (${p.gapBefore.toFixed(1)}s behind a lap earlier)` : ''
    out.push({
      kind: 'pass',
      lap: p.lap,
      // A few seconds before the move, so the reader sees it happen.
      at: loc ? Math.round((loc.at - 7) * 10) / 10 : undefined,
      cam: 'chase',
      focus: race.code(p.a),
      text: `${race.name(p.a)} passes ${race.name(p.b)} for ${p.position === 1 ? 'the lead' : `P${p.position}`}${where}${before}`,
    })
  }

  // Duels: a car within a second of the one ahead, lap after lap.
  for (const d of duels(race)) {
    const forWhat = d.position === 1 ? 'the lead' : `P${d.position}`
    out.push({
      kind: 'duel',
      lap: d.from,
      cam: 'chase',
      focus: race.code(d.chaser),
      text:
        `${race.name(d.chaser)} within a second of ${race.name(d.leader)} for ${forWhat}, laps ${d.from}–${d.to}` +
        ` (closest ${d.closest.toFixed(1)}s, lap ${d.closestLap})`,
    })
  }

  // Undercuts and overcuts.
  for (const s of rankPitSwings(race, 3)) {
    const word = s.sa < s.sb ? 'undercuts' : 'overcuts'
    out.push({
      kind: 'pit-swing',
      lap: Math.max(s.sa, s.sb) + 1,
      cam: 'tv',
      focus: race.code(s.a),
      text:
        `${race.name(s.a)} ${word} ${race.name(s.b)} for P${race.pos(s.a, s.after)}: stops on laps ${s.sa} and ${s.sb}, ` +
        `${s.gb.toFixed(1)}s behind on lap ${s.before}, ${(-s.ga).toFixed(1)}s ahead on lap ${s.after}`,
    })
  }

  // Safety cars and red flags (from the events, else the laps' flags).
  for (const p of periods(race, inputs)) {
    const what = p.kind === 'SC' ? 'Safety car' : p.kind === 'VSC' ? 'Virtual safety car' : 'Red flag'
    const lead = leaderAt(p.startLap)
    out.push({
      kind: 'safety-car',
      lap: p.startLap,
      cam: 'orbit',
      focus: lead != null ? race.code(lead) : null,
      text: `${what}, ${p.startLap === p.endLap ? `lap ${p.startLap}` : `laps ${p.startLap}–${p.endLap}`}`,
    })
  }

  // Races that end early: not classified, or three or more laps down at the
  // flag (FastF1 classifies a car that ran 90% of the distance, and calls
  // lapped finishers and some retirements alike "Lapped").
  const winnerLaps = race.results[0]?.laps ?? race.totalLaps
  for (const r of race.results) {
    if (r.position === 1) continue
    const ran = r.laps ?? 0
    const unclassified = !!r.classifiedPosition && !/^\d+$/.test(r.classifiedPosition)
    if (!unclassified && ran > winnerLaps - 3) continue
    const last = Math.max(1, ran)
    const why = r.status && !/finished|lapped|^\+/i.test(r.status) ? ` (${r.status})` : ''
    out.push({
      kind: 'retirement',
      lap: last,
      cam: 'heli',
      focus: race.code(r.driverNumber),
      text: `${race.name(r.driverNumber)}'s race ends on lap ${last}${why}`,
    })
  }

  // The fastest clean lap.
  let fastest: { dn: number; lap: number; t: number } | null = null
  for (const [dn, m] of race.laps) {
    const pits = new Set(race.pitLaps(dn))
    for (const r of m.values()) {
      if (r.lap_time_sec == null || r.lap === 1 || pits.has(r.lap) || pits.has(r.lap - 1)) continue
      if (!fastest || r.lap_time_sec < fastest.t) fastest = { dn, lap: r.lap, t: r.lap_time_sec }
    }
  }
  if (fastest) {
    out.push({
      kind: 'fastest-lap',
      lap: fastest.lap,
      cam: 'pov',
      focus: race.code(fastest.dn),
      text: `${race.name(fastest.dn)} sets the fastest lap, ${formatLapTime(fastest.t)}`,
    })
  }

  // The flag.
  const [w, p2] = race.results
  if (w?.position === 1) {
    const margin = p2?.timeSec != null && p2.laps === w.laps ? ` by ${p2.timeSec.toFixed(3)}s from ${race.name(p2.driverNumber)}` : ''
    out.push({ kind: 'finish', lap: race.totalLaps, cam: 'tv', focus: race.code(w.driverNumber), text: `${race.name(w.driverNumber)} wins${margin}` })
  }

  return out.sort((x, y) => x.lap - y.lap || order(x.kind) - order(y.kind))
}

const ORDER: ReplayMomentKind[] = ['start', 'safety-car', 'duel', 'pit-swing', 'lead-change', 'pass', 'retirement', 'fastest-lap', 'finish']

const DUEL_GAP_S = 1.0
const DUEL_MIN_LAPS = 4
const DUEL_TOP = 6

/**
 * Runs of laps where the car in P(k+1) finished each lap within a second of
 * the same car in P(k), k ≤ 6, neither pitting and no safety car: the
 * longest three, the lead first.
 */
function duels(race: Race) {
  type Run = { leader: number; chaser: number; position: number; from: number; to: number; closest: number; closestLap: number }
  const runs: Run[] = []
  const open = new Map<string, Run>()
  const dns = [...race.laps.keys()]
  const pitNear = (dn: number, lap: number) => race.pitLaps(dn).some((l) => l >= lap - 1 && l <= lap)
  for (let lap = 2; lap <= race.totalLaps; lap++) {
    const seen = new Set<string>()
    if (!race.neutralised(lap)) {
      for (let k = 1; k < DUEL_TOP; k++) {
        const leader = dns.find((dn) => race.pos(dn, lap) === k)
        const chaser = dns.find((dn) => race.pos(dn, lap) === k + 1)
        if (leader == null || chaser == null || pitNear(leader, lap) || pitNear(chaser, lap)) continue
        const cl = race.cum(leader, lap), cc = race.cum(chaser, lap)
        if (cl == null || cc == null) continue
        const gap = cc - cl
        if (gap <= 0 || gap > DUEL_GAP_S) continue
        const key = `${leader}:${chaser}`
        seen.add(key)
        const run = open.get(key)
        if (run && run.to === lap - 1) {
          run.to = lap
          run.position = Math.min(run.position, k)
          if (gap < run.closest) { run.closest = gap; run.closestLap = lap }
        } else {
          const r: Run = { leader, chaser, position: k, from: lap, to: lap, closest: gap, closestLap: lap }
          open.set(key, r)
          runs.push(r)
        }
      }
    }
    for (const key of [...open.keys()]) if (!seen.has(key)) open.delete(key)
  }
  return runs
    .filter((r) => r.to - r.from + 1 >= DUEL_MIN_LAPS)
    .sort((x, y) => (x.position === 1 ? 0 : 1) - (y.position === 1 ? 0 : 1) || y.to - y.from - (x.to - x.from))
    .slice(0, 3)
}
const order = (k: ReplayMomentKind) => ORDER.indexOf(k)

function periods(race: Race, inputs: RecapInputs) {
  const fromEvents = (inputs.events?.periods ?? []).filter((p) => p.kind !== 'YELLOW')
  if (fromEvents.length) return fromEvents
  const laps = new Set<number>()
  for (const m of race.laps.values()) for (const r of m.values()) if (r.events?.includes('sc_deployed')) laps.add(r.lap)
  const sorted = [...laps].sort((a, b) => a - b)
  const out: { kind: 'SC'; startLap: number; endLap: number }[] = []
  for (const l of sorted) {
    const last = out[out.length - 1]
    if (last && l === last.endLap + 1) last.endLap = l
    else out.push({ kind: 'SC', startLap: l, endLap: l })
  }
  return out
}

export { passKey }

/** The moments as the brief's markdown: the race's replay attributes, then one cue per line. */
export function replayMomentsMarkdown(m: {
  sessionKey: string
  title: string
  laps: number
  moments: ReplayMoment[]
}): string {
  const rows = m.moments.map((x) => {
    const cue =
      (x.at != null ? `data-at="${x.at}"` : `data-lap="${x.lap}"`) +
      ` data-cam="${x.cam}"` +
      (x.focus ? ` data-focus="${x.focus}"` : '')
    return `| ${x.lap} | ${x.text.replace(/\|/g, '/')} | \`${cue}\` |`
  })
  return `### ${m.title}

For the recap's replay: \`<div class="replay" data-session="${m.sessionKey}" data-laps="${m.laps}">\`.
That session key goes in the markup only, never in the story's text. Copy a
moment's cue onto the chapter or paragraph about it as it is; a \`data-at\` is
an exact session time, a few seconds before the moment, so use it only where
it's given. The other numbers are in the race context above.

| Lap | Moment | Cue |
|---|---|---|
${rows.join('\n')}`
}
