import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { assembleReplayFixture } from '@/lib/replay/supabaseSource'

/**
 * GET /api/replay/<ref>
 *
 * Returns the `ReplayFixture` wire shape assembled from the Supabase telemetry
 * tables. `ref` is a session_key ("2024_monaco_R"), "<year>-<round>", or a bare
 * round number (resolved against the current season's race). The fixture-fetch
 * client (`createFixtureDataSource`) consumes this with zero changes.
 */
export const dynamic = 'force-dynamic'

// Public read-only data, also fetched cross-origin by f1: viz modules rendering
// on the shared vizmaya.fyi render surface (admin canvas / compose previews).
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  const { ref } = await ctx.params
  const seasonHint = new Date().getFullYear()
  try {
    const fixture = await assembleReplayFixture(supabaseServer(), ref, { seasonHint })
    if (!fixture) {
      return NextResponse.json(
        { message: `No telemetry ingested for "${ref}"` },
        { status: 404, headers: CORS_HEADERS },
      )
    }
    return NextResponse.json(fixture, {
      headers: { 'Cache-Control': 'public, max-age=300, must-revalidate', ...CORS_HEADERS },
    })
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'replay assembly failed' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
