import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { loadRaceEvents } from '@/lib/raceEvents.server'

/**
 * GET /api/telemetry/<sessionKey>/events
 *
 * Lap-keyed race events for the Telemetry tab: safety car / VSC / red / yellow
 * flag periods and pit stops (lane + stationary time). See loadRaceEvents.
 */
export const dynamic = 'force-dynamic'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }

export async function GET(_req: Request, ctx: { params: Promise<{ sessionKey: string }> }) {
  const { sessionKey } = await ctx.params
  const events = await loadRaceEvents(supabaseServer(), sessionKey)
  if (!events) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404, headers: CORS_HEADERS })
  }
  return NextResponse.json(events, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600', ...CORS_HEADERS },
  })
}
