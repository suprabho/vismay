import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { isCrestSeason } from '@/lib/seasonBooks/crests'
import { CrestStoreError, listCrestSeasons, listCrests } from '@/lib/seasonBooks/crestStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

/**
 * `?season=2003-04` (default: the newest season with crests) → { seasons, season, crests }.
 * Each crest carries `image_url`: a signed URL for an upload, else the picked crest's thumbnail.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const asked = new URL(req.url).searchParams.get('season')
  if (asked !== null && !isCrestSeason(asked)) return NextResponse.json({ error: 'Invalid season' }, { status: 400, headers: PRIVATE_HEADERS })
  try {
    const seasons = await listCrestSeasons()
    const season = asked ?? seasons[0] ?? null
    return NextResponse.json({ seasons, season, crests: season ? await listCrests(season) : [] }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    const status = error instanceof CrestStoreError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load crests' }, { status, headers: PRIVATE_HEADERS })
  }
}
