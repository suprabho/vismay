import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { Annotation, Frame, Phase, PlayerSnapshot, Team } from './types'

/**
 * `fs:tactics-board` — interactive, data-driven SVG tactics board.
 *
 * Replaces a static tactical JPG with an animated pitch: player tokens tween
 * between keyframes while passes, runs and zones draw on at their cued times.
 * The board self-plays when its unit becomes active, with a scrubber + replay
 * for manual control; capture / print and `prefers-reduced-motion` snap to the
 * resolved final frame.
 *
 * Driven entirely by a `Phase` conforming to the canonical tactical shape
 * (see `./types`, mirrored from `footshorts-data/types/tactics.ts`). Coordinates
 * are 0–100 on both axes — the renderer is the only place that convention is
 * interpreted.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:tactics-board
 *       title: "Building from the back"
 *       homeLabel: "Middlesbrough"
 *       awayLabel: "Man Utd"
 *       homeColor: "#d2122e"
 *       phase:
 *         phaseId: carrick-buildup-1
 *         formation: "4-2-3-1"
 *         durationSec: 4
 *         frames:
 *           - t: 0
 *             ball: { x: 18, y: 50 }
 *             players:
 *               - { id: GK, x: 8, y: 50, team: home }
 *               - ...
 *         annotations:
 *           - { type: pass, from: RCB, to: RDM, at: 0.5 }
 *           - { type: run, playerId: RB, path: [[22,82],[35,88]], at: 0.8, duration: 3 }
 *           - { type: zone, polygon: [[35,35],[55,35],[55,65],[35,65]], label: "Overload", at: 1.5, duration: 2.5 }
 */

export interface TacticsBoardConfig {
  type: 'fs:tactics-board'
  phase: Phase
  /** Headline for the phase, shown beside the formation chip. */
  title?: string
  /** Legend names for the two teams. */
  homeLabel?: string
  awayLabel?: string
  /** Hex overrides for team token colours. */
  homeColor?: string
  awayColor?: string
  /** Accent used for passes + zones (hex). Defaults to the board's gold. */
  accent?: string
  /** Pitch fill colours (hex). */
  pitchColor?: string
  stripeColor?: string
  /** Loop the animation instead of holding the final frame. */
  loop?: boolean
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function asPoint(v: unknown, label: string): [number, number] {
  if (!Array.isArray(v) || v.length < 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
    throw new Error(`${label}: expected an [x, y] number pair`)
  }
  return [v[0], v[1]]
}

function parsePlayer(raw: unknown, label: string): PlayerSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error(`${label}: player must be an object`)
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const x = num(r.x)
  const y = num(r.y)
  if (!id) throw new Error(`${label}: player requires a string 'id'`)
  if (x === undefined || y === undefined) {
    throw new Error(`${label}: player '${id}' requires numeric 'x' and 'y'`)
  }
  if (r.team !== 'home' && r.team !== 'away') {
    throw new Error(`${label}: player '${id}' requires team 'home' | 'away'`)
  }
  return { id, x, y, team: r.team as Team, label: str(r.label) }
}

function parseFrame(raw: unknown, label: string): Frame {
  if (!raw || typeof raw !== 'object') throw new Error(`${label}: frame must be an object`)
  const r = raw as Record<string, unknown>
  const t = num(r.t)
  if (t === undefined) throw new Error(`${label}: frame requires numeric 't'`)
  const ball = r.ball as Record<string, unknown> | undefined
  const bx = num(ball?.x)
  const by = num(ball?.y)
  if (bx === undefined || by === undefined) {
    throw new Error(`${label}: frame t=${t} requires a 'ball' with numeric x/y`)
  }
  if (!Array.isArray(r.players) || r.players.length === 0) {
    throw new Error(`${label}: frame t=${t} requires a non-empty 'players' array`)
  }
  return {
    t,
    ball: { x: bx, y: by },
    players: r.players.map((p, i) => parsePlayer(p, `${label} frame t=${t} player[${i}]`)),
  }
}

function parseAnnotation(raw: unknown, label: string): Annotation {
  if (!raw || typeof raw !== 'object') throw new Error(`${label}: annotation must be an object`)
  const r = raw as Record<string, unknown>
  switch (r.type) {
    case 'pass': {
      const from = str(r.from)
      const to = str(r.to)
      const at = num(r.at)
      if (!from || !to || at === undefined) {
        throw new Error(`${label}: pass requires string 'from', 'to' and numeric 'at'`)
      }
      return { type: 'pass', from, to, at }
    }
    case 'run': {
      const playerId = str(r.playerId)
      const at = num(r.at)
      const duration = num(r.duration)
      if (!playerId || at === undefined || duration === undefined) {
        throw new Error(`${label}: run requires 'playerId', numeric 'at' and 'duration'`)
      }
      if (!Array.isArray(r.path) || r.path.length < 2) {
        throw new Error(`${label}: run requires a 'path' with at least two waypoints`)
      }
      return {
        type: 'run',
        playerId,
        at,
        duration,
        path: r.path.map((pt, i) => asPoint(pt, `${label} run path[${i}]`)),
      }
    }
    case 'zone': {
      const at = num(r.at)
      const duration = num(r.duration)
      if (at === undefined || duration === undefined) {
        throw new Error(`${label}: zone requires numeric 'at' and 'duration'`)
      }
      if (!Array.isArray(r.polygon) || r.polygon.length < 3) {
        throw new Error(`${label}: zone requires a 'polygon' with at least three points`)
      }
      return {
        type: 'zone',
        at,
        duration,
        label: str(r.label),
        polygon: r.polygon.map((pt, i) => asPoint(pt, `${label} zone polygon[${i}]`)),
      }
    }
    default:
      throw new Error(`${label}: annotation 'type' must be pass | run | zone (got ${String(r.type)})`)
  }
}

function parsePhase(raw: unknown, ctx: { slug: string; label: string }): Phase {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:tactics-board requires a 'phase' object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.frames) || r.frames.length === 0) {
    throw new Error(`${ctx.label}: phase requires a non-empty 'frames' array`)
  }
  const frames = r.frames.map((f, i) => parseFrame(f, `${ctx.label} frame[${i}]`))
  const annotationsRaw = r.annotations
  if (annotationsRaw !== undefined && !Array.isArray(annotationsRaw)) {
    throw new Error(`${ctx.label}: phase 'annotations' must be an array when present`)
  }
  const annotations = (annotationsRaw ?? []).map((a, i) =>
    parseAnnotation(a, `${ctx.label} annotation[${i}]`),
  )
  const lastT = Math.max(...frames.map((f) => f.t))
  return {
    phaseId: str(r.phaseId) ?? `${ctx.slug}-phase`,
    formation: str(r.formation) ?? '',
    durationSec: num(r.durationSec) ?? lastT,
    frames,
    annotations,
  }
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TacticsBoardConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:tactics-board layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  return {
    type: 'fs:tactics-board',
    phase: parsePhase(r.phase, ctx),
    title: str(r.title),
    homeLabel: str(r.homeLabel),
    awayLabel: str(r.awayLabel),
    homeColor: str(r.homeColor),
    awayColor: str(r.awayColor),
    accent: str(r.accent),
    pitchColor: str(r.pitchColor),
    stripeColor: str(r.stripeColor),
    loop: typeof r.loop === 'boolean' ? r.loop : undefined,
  }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'text', key: 'title', label: 'Phase title' },
    { kind: 'json', key: 'phase', label: 'Phase JSON (frames + annotations)' },
    { kind: 'text', key: 'homeLabel', label: 'Home team label' },
    { kind: 'text', key: 'awayLabel', label: 'Away team label' },
    { kind: 'text', key: 'homeColor', label: 'Home color (hex)' },
    { kind: 'text', key: 'awayColor', label: 'Away color (hex)' },
    { kind: 'text', key: 'accent', label: 'Pass / zone accent (hex)' },
    { kind: 'text', key: 'pitchColor', label: 'Pitch color (hex)' },
    { kind: 'boolean', key: 'loop', label: 'Loop the animation' },
  ]
}

const tacticsBoardModule: VizModule<TacticsBoardConfig> = {
  type: 'fs:tactics-board',
  label: 'Footshorts — tactics board',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  defaultStyle: { pointerEvents: 'auto' },
  stableIdentity: (config) => `fs:tactics-board:${config.phase.phaseId}`,
}

export default tacticsBoardModule
