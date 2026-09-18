import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { findEspnCup, listEspnCups } from '@/lib/espnCups'
import { createServiceClient } from '@vismay/content-source/supabase'
import { currentCupSeason, importEspnCup, validCupSeason } from '@footshorts/shared/espnCups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const params = new URL(req.url).searchParams
  const season = Number(params.get('season') ?? currentCupSeason())
  const competition = params.get('competition') || undefined
  if (!validCupSeason(season) || (competition && !findEspnCup(competition))) {
    return NextResponse.json({ error: 'Invalid season or competition' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  try {
    return NextResponse.json({ rows: await listEspnCups(season, competition) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load matches' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}

// One cup per request keeps imports within route timeouts. The admin runs an
// "all cups" import sequentially and reports individual failures explicitly.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: PRIVATE_HEADERS })
  }
  let body: { competition?: unknown; season?: unknown }
  try {
    body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
  } catch {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  const cup = typeof body.competition === 'string' ? findEspnCup(body.competition) : undefined
  if (!cup || !validCupSeason(body.season)) {
    return NextResponse.json({ error: 'Invalid season or competition' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  try {
    const result = await importEspnCup(createServiceClient(), cup, body.season)
    return NextResponse.json(result, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 502, headers: PRIVATE_HEADERS })
  }
}
