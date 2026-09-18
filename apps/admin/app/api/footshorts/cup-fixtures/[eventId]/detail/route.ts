import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { extractEspnMatchDetail, getEspnCupFixture, getEspnMatchDetail } from '@/lib/espnCups'

/**
 * ESPN match detail for one imported cup fixture — the data behind the ESPN
 * match / stats / lineups / commentary pages, rendered inside the admin
 * (espn.com sets `frame-ancestors` to its own domains, so the page itself
 * cannot be iframed).
 *
 * GET  → { fixture, detail | null, detailError? }   stored extraction, if any
 *        (detailError = storage unavailable, e.g. migration not applied)
 * POST → { fixture, detail }                        fetch from ESPN, store, return
 *
 * Private admin storage only: never writes fixtures / fixture_events /
 * opta_match_facts. Admin-auth gated; responses are never cached.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

type Params = { params: Promise<{ eventId: string }> }

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
}

async function eventIdOf({ params }: Params): Promise<string | null> {
  const { eventId } = await params
  return /^\d+$/.test(eventId) ? eventId : null
}

export async function GET(_req: Request, ctx: Params) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  const eventId = await eventIdOf(ctx)
  if (!eventId) return fail('Invalid match id', 400)
  try {
    const fixture = await getEspnCupFixture(eventId)
    if (!fixture) return fail('Match not found in the imported cup fixtures', 404)
    // The fixture always renders; a missing detail table only disables extraction.
    try {
      const detail = await getEspnMatchDetail(eventId)
      return NextResponse.json({ fixture, detail }, { headers: PRIVATE_HEADERS })
    } catch (error) {
      const detailError = error instanceof Error ? error.message : 'Could not load match detail'
      return NextResponse.json({ fixture, detail: null, detailError }, { headers: PRIVATE_HEADERS })
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not load match', 500)
  }
}

export async function POST(req: Request, ctx: Params) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  const eventId = await eventIdOf(ctx)
  if (!eventId) return fail('Invalid match id', 400)
  try {
    const fixture = await getEspnCupFixture(eventId)
    if (!fixture) return fail('Match not found in the imported cup fixtures', 404)
    const detail = await extractEspnMatchDetail(eventId)
    return NextResponse.json({ fixture, detail }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Extraction failed', 502)
  }
}
