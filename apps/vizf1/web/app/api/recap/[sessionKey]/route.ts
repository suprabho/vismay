import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { loadRecap } from '@/lib/recap/loadRecap.server'

/**
 * GET /api/recap/<sessionKey>
 *
 * The race recap (@vismay/f1-viz/recap) built from the session's stored
 * telemetry: lap 1, the pit-stop swing and the pass of the race when there was
 * one, and the result. 404 when the session isn't ingested; the recap page
 * then shows its sample story.
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ sessionKey: string }> }) {
  const { sessionKey } = await ctx.params
  try {
    const recap = await loadRecap(supabaseServer(), sessionKey)
    if (!recap) return NextResponse.json({ message: `No telemetry ingested for "${sessionKey}"` }, { status: 404 })
    return NextResponse.json(recap, {
      // A finished race doesn't change; an hour keeps a re-ingest fresh enough.
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
    })
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'recap build failed' },
      { status: 500 },
    )
  }
}
