/**
 * Build a "telemetry brief" for one session — prose describing the session's
 * key telemetry moments (signals) with embedded `f1:` viz directives. This is
 * fed to the compose pipeline as a SOURCE: the model (steered by the F1 pack)
 * places f1:telemetry-clip / f1:track-3d layers, and the f1 graft
 * (story-pipeline graftSectionBody, namespace 'f1') swaps in the exact
 * sessionKey/laps/drivers the brief carries — so the model never invents them.
 *
 * Pure: takes a Supabase client + sessionKey (+ optional editorial focus) and
 * returns markdown — no client construction, no other I/O. Lives in
 * @vismay/f1-viz behind the server-only `./telemetry-brief` subpath (NOT the
 * package barrel) so browser/render bundles never pull it; the worker CLI and
 * the admin compose route both call it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveSignals, type DriverRow, type LapRow, type Signal, type StintRow } from './signals'

const MAX_CLIPS = 5

/** Optional editorial focus that narrows the brief before it grounds a story. */
export interface BriefFocus {
  /** Keep only signals involving these car numbers. */
  driverNumbers?: number[]
  /** Keep only signals involving drivers on these constructors (teamName or teamId). */
  constructors?: string[]
  /** Editorial intent, surfaced at the top of the brief to steer the model. */
  prompt?: string
}

/** Session-roster entry — DriverRow (used by signals) plus the team id for constructor focus. */
interface BriefDriver extends DriverRow {
  teamId?: string
}

interface SessionRow {
  session_key: string
  season: number
  session_type: string
  gp_name: string | null
  circuit_name: string | null
  drivers: BriefDriver[] | null
  stints: StintRow[] | null
}

function clipFence(sessionKey: string, s: Signal): string {
  const cfg = {
    sessionKey,
    lapFrom: s.lapFrom,
    lapTo: s.lapTo,
    driverNumbers: s.driverNumbers,
    focalDriverNumber: s.focalDriverNumber,
    caption: s.title,
  }
  return '```f1:telemetry-clip\n' + JSON.stringify(cfg, null, 2) + '\n```'
}

function track3dFence(sessionKey: string, focal: number, title: string): string {
  const cfg = { sessionKey, focalDriverNumber: focal, chaseCam: true, title }
  return '```f1:track-3d\n' + JSON.stringify(cfg, null, 2) + '\n```'
}

/** Car numbers in focus = explicit drivers ∪ drivers on the named constructors. */
function focusDriverNumbers(drivers: BriefDriver[], focus: BriefFocus): Set<number> {
  const set = new Set<number>(focus.driverNumbers ?? [])
  const wanted = (focus.constructors ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean)
  if (wanted.length) {
    for (const d of drivers) {
      const team = (d.teamName ?? '').toLowerCase()
      const id = (d.teamId ?? '').toLowerCase()
      if ((team && wanted.includes(team)) || (id && wanted.includes(id))) set.add(d.driverNumber)
    }
  }
  return set
}

/** Empty focus ⇒ keep everything; otherwise keep signals touching a focus driver. */
function matchesFocus(sig: Signal, focusSet: Set<number>): boolean {
  if (focusSet.size === 0) return true
  if (focusSet.has(sig.focalDriverNumber)) return true
  return sig.driverNumbers.some((n) => focusSet.has(n))
}

export async function buildTelemetryBrief(
  sb: SupabaseClient,
  sessionKey: string,
  focus: BriefFocus = {},
): Promise<string> {
  const { data: sess, error: sErr } = await sb
    .from('vizf1_telemetry_sessions')
    .select('session_key, season, session_type, gp_name, circuit_name, drivers, stints')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (sErr) throw sErr
  if (!sess) throw new Error(`No telemetry session "${sessionKey}"`)
  const s = sess as SessionRow

  const { data: lapData, error: lErr } = await sb
    .from('vizf1_telemetry_laps')
    .select('driver_number, lap, lap_time_sec, sectors, compound, min_gap_to_ahead_m, avg_speed, position, events')
    .eq('session_key', sessionKey)
  if (lErr) throw lErr

  const laps = (lapData ?? []) as LapRow[]
  const drivers = (s.drivers ?? []) as BriefDriver[]
  const stints = s.stints ?? []
  const focusSet = focusDriverNumbers(drivers, focus)
  const signals = deriveSignals(laps, stints, drivers).filter((sig) => matchesFocus(sig, focusSet))

  const gp = s.gp_name || s.circuit_name || sessionKey
  const lines: string[] = []
  lines.push(`# Telemetry brief — ${gp} ${s.season} (${s.session_type})`)
  lines.push('')
  // Editorial intent (the picker's text prompt) — steers angle/outline/section
  // generation; the model reads it as part of this source.
  if (focus.prompt && focus.prompt.trim()) {
    lines.push(`> **Editorial focus:** ${focus.prompt.trim()}`)
    lines.push('')
  }
  lines.push(
    `Detected ${signals.length} telemetry moment${signals.length === 1 ? '' : 's'} from the ingested ` +
      `lap data for ${gp}. Each is reduced to a lap window and the drivers involved; use these exact ` +
      `sessionKey / laps / driver numbers when placing an f1:telemetry-clip or f1:track-3d layer.`,
  )
  lines.push('')

  const clips = signals.slice(0, MAX_CLIPS)
  for (const sig of clips) {
    lines.push(`## ${sig.title}`)
    lines.push('')
    lines.push(sig.detail)
    lines.push('')
    lines.push(clipFence(sessionKey, sig))
    lines.push('')
  }

  // One immersive 3D lap, focused on the fastest-lap driver if present.
  const fastest = signals.find((x) => x.kind === 'fastest_lap') ?? signals[0]
  if (fastest) {
    lines.push(`## A lap around ${gp} in 3D`)
    lines.push('')
    lines.push(`An immersive pass of the circuit, following ${'#' + fastest.focalDriverNumber}.`)
    lines.push('')
    lines.push(track3dFence(sessionKey, fastest.focalDriverNumber, `${gp} — onboard`))
    lines.push('')
  }

  return lines.join('\n')
}
