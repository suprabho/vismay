/**
 * Auto camera director: decides which car to show and with which shot.
 *
 * Every half second of race time it ranks what's happening — cars running
 * wheel to wheel (closer and further up the order = better), a car going off
 * the track, an overtake that just happened, otherwise the leader — then
 * chooses a shot that suits the moment:
 *
 *   - braking / turning in      → trackside TV camera or helicopter
 *   - battle on a straight      → onboard of the chasing car (rival ahead)
 *                                  or chase cam behind both
 *   - flat out, nothing nearby  → onboard, chase or helicopter
 *
 * Shots hold for at least MIN_HOLD (an off-track moment may cut in early)
 * and change after MAX_HOLD, never repeating the previous shot type. Timing
 * runs on race time, so pausing freezes the edit.
 */
import type { CircuitIndex } from './circuitIndex'
import type { CarState, RaceState, ShotKind } from './raceState'

const EVAL_EVERY_MS = 500
const MIN_HOLD_MS = 4500
const MAX_HOLD_MS = 10000
/** Cars this close (m) along the track count as a battle. */
const BATTLE_GAP_M = 45
/** Overtakes stay "news" this long (ms). */
const OVERTAKE_MEMORY_MS = 6000

export interface Shot {
  kind: ShotKind
  target: number
  /** The rival in a battle shot (car ahead of `target`), if any. */
  partner: number | null
  /** Short human label for the HUD ("Battle for P3", "Leader", …). */
  reason: string
  /** Race time the shot started (ms). */
  since: number
}

export interface Standing {
  driverNumber: number
  position: number
  /** Metres to the car ahead (Infinity for the leader). */
  gapAhead: number
  ahead: number | null
}

interface Candidate {
  target: number
  partner: number | null
  score: number
  reason: string
}

export class RaceDirector {
  private lastEval = -Infinity
  private lastT: number | null = null
  private hints = new Map<number, number>()
  private raceDist = new Map<number, number>()
  private order: number[] = []
  private overtakes: Array<{ by: number; on: number; at: number }> = []
  private history: ShotKind[] = []
  shot: Shot | null = null
  standings = new Map<number, Standing>()

  constructor(private readonly circuit: CircuitIndex) {}

  reset() {
    this.lastEval = -Infinity
    this.lastT = null
    this.hints.clear()
    this.raceDist.clear()
    this.order = []
    this.overtakes = []
    this.shot = null
  }

  /**
   * Advance the director to race time `t`.
   * @param forcedKind  fixed shot type (manual camera modes); null = auto.
   * @param focused     user-picked driver to always follow; null = director picks.
   */
  update(state: RaceState, t: number, forcedKind: ShotKind | null, focused: number | null): Shot | null {
    const jumped = this.lastT == null || t < this.lastT - 50 || t - this.lastT > 3000
    this.lastT = t
    if (jumped) {
      this.raceDist.clear()
      this.overtakes = []
      this.lastEval = -Infinity
      this.shot = null
    }
    if (t - this.lastEval >= EVAL_EVERY_MS) {
      this.lastEval = t
      this.rank(state, t)
    }

    const current = this.shot
    const targetOk = (dn: number | null) => dn != null && !!state.byNumber.get(dn)?.active

    // Manual camera: fixed shot type, follow the focused car or the best story.
    if (forcedKind) {
      const want = focused != null && targetOk(focused) ? focused : null
      if (current && current.kind === forcedKind && targetOk(current.target) && (want == null || current.target === want)) {
        current.partner = this.partnerFor(current.target)
        return current
      }
      const pick = want != null ? this.followCandidate(want) : this.bestCandidate(state)
      this.shot = pick ? { kind: forcedKind, target: pick.target, partner: pick.partner, reason: pick.reason, since: t } : null
      return this.shot
    }

    // Auto.
    const candidate = focused != null && targetOk(focused) ? this.followCandidate(focused) : this.bestCandidate(state)
    if (!candidate) {
      this.shot = null
      return null
    }
    const held = current ? t - current.since : Infinity
    const lost = !current || !targetOk(current.target) || (focused != null && current.target !== focused)
    const urgent =
      !!current && candidate.target !== current.target && candidate.score >= 1.5 && held > 1200
    const better =
      !!current && candidate.target !== current.target && held > MIN_HOLD_MS && candidate.score > this.scoreOf(current) + 0.35
    if (!lost && !urgent && !better && held < MAX_HOLD_MS) {
      current!.partner = this.partnerFor(current!.target)
      return current
    }
    const target = state.byNumber.get(candidate.target)!
    const kind = this.chooseKind(target, candidate.partner != null)
    this.history.push(kind)
    if (this.history.length > 4) this.history.shift()
    this.shot = { kind, target: candidate.target, partner: candidate.partner, reason: candidate.reason, since: t }
    return this.shot
  }

  private chooseKind(car: CarState, battle: boolean): ShotKind {
    const cornering = Math.abs(car.curvature) > 1 / 180 || car.accel < -9
    const options: ShotKind[] = cornering
      ? ['tv', 'heli', 'chase']
      : battle
        ? ['pov', 'chase', 'tv']
        : ['pov', 'heli', 'chase', 'tv']
    const prev = this.history[this.history.length - 1]
    const recent = this.history.slice(-2)
    return (
      options.find((k) => k !== prev && !recent.includes(k)) ??
      options.find((k) => k !== prev) ??
      options[0]
    )
  }

  /** Order the field and score what's worth watching. */
  private rank(state: RaceState, t: number) {
    const L = this.circuit.length
    const live: Array<{ dn: number; dist: number }> = []
    for (const car of state.cars) {
      if (!car.active) {
        this.raceDist.delete(car.driverNumber)
        continue
      }
      const hit = this.circuit.locate(car.raw.x, car.raw.z, this.hints.get(car.driverNumber))
      this.hints.set(car.driverNumber, hit.index)
      let dist = Math.max(0, car.lap - 1) * L + hit.s
      // Lap counters and the outline's start line don't flip at exactly the
      // same spot — keep each car's race distance continuous.
      const prev = this.raceDist.get(car.driverNumber)
      if (prev != null) {
        while (dist - prev > L / 2) dist -= L
        while (prev - dist > L / 2) dist += L
      }
      this.raceDist.set(car.driverNumber, dist)
      live.push({ dn: car.driverNumber, dist })
    }
    live.sort((a, b) => b.dist - a.dist)

    // Overtakes: a car now ahead of one it was behind at the last ranking.
    const prevPos = new Map(this.order.map((dn, i) => [dn, i]))
    live.forEach((c, i) => {
      const was = prevPos.get(c.dn)
      if (was == null || was <= i) return
      for (let j = i + 1; j < live.length; j++) {
        const other = live[j]
        const otherWas = prevPos.get(other.dn)
        if (otherWas != null && otherWas < was && c.dist - other.dist < BATTLE_GAP_M) {
          this.overtakes.push({ by: c.dn, on: other.dn, at: t })
        }
      }
    })
    this.overtakes = this.overtakes.filter((o) => t - o.at < OVERTAKE_MEMORY_MS)
    this.order = live.map((c) => c.dn)

    this.standings.clear()
    live.forEach((c, i) => {
      const ahead = i > 0 ? live[i - 1] : null
      this.standings.set(c.dn, {
        driverNumber: c.dn,
        position: i + 1,
        gapAhead: ahead ? ahead.dist - c.dist : Infinity,
        ahead: ahead ? ahead.dn : null,
      })
    })
  }

  private partnerFor(dn: number): number | null {
    const st = this.standings.get(dn)
    return st && st.ahead != null && st.gapAhead < BATTLE_GAP_M ? st.ahead : null
  }

  private followCandidate(dn: number): Candidate {
    const partner = this.partnerFor(dn)
    const pos = this.standings.get(dn)?.position
    return { target: dn, partner, score: 1, reason: partner != null && pos ? `Battle for P${pos - 1}` : pos ? `P${pos}` : '' }
  }

  private scoreOf(shot: Shot): number {
    const st = this.standings.get(shot.target)
    if (!st) return 0
    return this.candidateFor(st)?.score ?? 0.2
  }

  private candidateFor(st: Standing, car?: CarState): Candidate | null {
    const weight = 1.15 - Math.min(0.75, 0.04 * (st.position - 1))
    if (car && car.status === 1) return { target: st.driverNumber, partner: null, score: 1.6, reason: 'Off track' }
    const passed = this.overtakes.find((o) => o.by === st.driverNumber)
    if (passed) return { target: st.driverNumber, partner: this.partnerFor(st.driverNumber), score: 1.2 * weight + 0.3, reason: `Overtake · P${st.position}` }
    if (st.ahead != null && st.gapAhead < BATTLE_GAP_M) {
      return {
        target: st.driverNumber,
        partner: st.ahead,
        score: (0.45 + 0.55 * (1 - st.gapAhead / BATTLE_GAP_M)) * weight,
        reason: `Battle for P${st.position - 1}`,
      }
    }
    if (st.position === 1) return { target: st.driverNumber, partner: null, score: 0.35, reason: 'Leader' }
    return null
  }

  private bestCandidate(state: RaceState): Candidate | null {
    let best: Candidate | null = null
    for (const st of this.standings.values()) {
      const c = this.candidateFor(st, state.byNumber.get(st.driverNumber))
      if (c && (!best || c.score > best.score)) best = c
    }
    if (best) return best
    // Nothing ranked yet (first frames): any active car.
    const any = state.cars.find((c) => c.active)
    return any ? { target: any.driverNumber, partner: null, score: 0.1, reason: '' } : null
  }
}
