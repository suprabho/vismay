/**
 * Build a "telemetry brief" for one session — prose describing the session's
 * key telemetry moments (signals) with embedded `f1:` viz directives. This is
 * fed to the compose pipeline as a SOURCE: the model (steered by the F1 pack)
 * places f1:telemetry-clip / f1:track-3d layers, and the f1 graft
 * (story-pipeline graftSectionBody, namespace 'f1') swaps in the exact
 * sessionKey/laps/drivers the brief carries — so the model never invents them.
 *
 * Reads the ingested telemetry tables; emits markdown. No story-pipeline I/O.
 *
 * Run: `SESSION_KEY=2024_monaco_R pnpm --filter @vizf1/worker build:telemetry-brief`
 */
import { getSupabase } from '../supabase'
import { deriveSignals, type DriverRow, type LapRow, type Signal, type StintRow } from './signals'

type SupabaseClient = ReturnType<typeof getSupabase>

const MAX_CLIPS = 5

interface SessionRow {
  session_key: string
  season: number
  session_type: string
  gp_name: string | null
  circuit_name: string | null
  drivers: DriverRow[] | null
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

export async function buildTelemetryBrief(sb: SupabaseClient, sessionKey: string): Promise<string> {
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
  const drivers = s.drivers ?? []
  const stints = s.stints ?? []
  const signals = deriveSignals(laps, stints, drivers)

  const gp = s.gp_name || s.circuit_name || sessionKey
  const lines: string[] = []
  lines.push(`# Telemetry brief — ${gp} ${s.season} (${s.session_type})`)
  lines.push('')
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

export async function runBuildTelemetryBrief() {
  const sessionKey = process.env.SESSION_KEY
  if (!sessionKey) {
    throw new Error('SESSION_KEY env var is required (e.g. 2024_monaco_R)')
  }
  const sb = getSupabase()
  const brief = await buildTelemetryBrief(sb, sessionKey)
  // Print to stdout so it can be inspected / piped; the admin Sources stage
  // calls buildTelemetryBrief() directly to attach it as a compose source.
  console.log(brief)
}

if (require.main === module) {
  runBuildTelemetryBrief()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
