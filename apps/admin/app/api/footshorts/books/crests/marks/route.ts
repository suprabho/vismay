import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { isCrestSeason } from '@/lib/seasonBooks/crests'
import { CrestStoreError } from '@/lib/seasonBooks/crestStore'
import { confirmMark, generateMark, overrideMark, type MarkOverrides } from '@/lib/seasonBooks/clubMarkStore'

/**
 * POST { season, wiki, action } → { crest }: the club-mark review queue.
 *   generate  run toClubMark() for the club and store the row (an E_NO_KIT etc. is stored, not thrown)
 *   override  { overrides: { family?, code?, pattern?, c1?, c2? } } written back into the input, then regenerate
 *   confirm   the generated family and code become overrides; the row leaves the queue
 * Admin-auth gated, same-origin.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  let body: { season?: unknown; wiki?: unknown; action?: unknown; overrides?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail('Expected a JSON object', 400)
  }
  const { season, wiki, action } = body ?? {}
  if (!isCrestSeason(season) || typeof wiki !== 'string' || !wiki || wiki.length > 300) return fail('Invalid season or club', 400)
  const by = await adminEmail()
  try {
    if (action === 'generate') return NextResponse.json({ crest: await generateMark(season, wiki, by) }, { headers: PRIVATE_HEADERS })
    if (action === 'confirm') return NextResponse.json({ crest: await confirmMark(season, wiki, by) }, { headers: PRIVATE_HEADERS })
    if (action === 'override') {
      if (!body.overrides || typeof body.overrides !== 'object') return fail('Missing overrides', 400)
      return NextResponse.json({ crest: await overrideMark(season, wiki, body.overrides as MarkOverrides, by) }, { headers: PRIVATE_HEADERS })
    }
    return fail('Unknown action', 400)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not update the club mark', error instanceof CrestStoreError ? error.status : 500)
  }
}
