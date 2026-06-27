import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'

/**
 * GET /api/vizf1/telemetry/sessions
 *
 * Lists the ingested telemetry sessions for the "Add telemetry session" picker,
 * each with its driver roster + the constructors derived from that roster. One
 * call is enough — the session count is tiny — so the picker can update its
 * driver/constructor lists locally when the editor changes the race.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DriverJson {
  driverNumber: number
  fullName?: string
  abbreviation?: string
  teamName?: string
  teamId?: string
  teamColour?: string
}

interface SessionRow {
  session_key: string
  gp_name: string | null
  season: number
  round: number | null
  session_type: string
  date_start: string | null
  positions_status: string | null
  drivers: DriverJson[] | null
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('vizf1_telemetry_sessions')
      .select('session_key, gp_name, season, round, session_type, date_start, positions_status, drivers')
      .order('date_start', { ascending: false })
    if (error) throw error

    const sessions = ((data ?? []) as SessionRow[]).map((r) => {
      const drivers = (r.drivers ?? []).map((d) => ({
        number: d.driverNumber,
        abbr: d.abbreviation ?? `#${d.driverNumber}`,
        name: d.fullName ?? '',
        team: d.teamName ?? '',
        teamId: d.teamId ?? '',
        teamColour: d.teamColour ?? '#9ca3af',
      }))
      // Distinct constructors, in roster order, keyed by teamId (fallback name).
      const seen = new Set<string>()
      const constructors: Array<{ name: string; id: string; colour: string }> = []
      for (const d of drivers) {
        const key = d.teamId || d.team
        if (!key || seen.has(key)) continue
        seen.add(key)
        constructors.push({ name: d.team, id: d.teamId, colour: d.teamColour })
      }
      const gp = r.gp_name ?? r.session_key
      return {
        sessionKey: r.session_key,
        label: `${gp} ${r.season}${r.round != null ? ` · R${r.round}` : ''} (${r.session_type})`,
        season: r.season,
        round: r.round,
        sessionType: r.session_type,
        ready: r.positions_status === 'done',
        drivers,
        constructors,
      }
    })

    return NextResponse.json({ ok: true, sessions })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to list telemetry sessions' },
      { status: 500 },
    )
  }
}
