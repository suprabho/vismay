import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { searchFootshortsEntities } from '@vismay/content-source/footshortsData'

/**
 * Team crest / competition logo search for the share-card badge picker.
 * `?q=<name>&type=team|league&limit=<n>`. Only entities with a crest are
 * returned. The client drops a result onto the card as a draggable overlay.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || undefined
  const typeRaw = url.searchParams.get('type')?.trim()
  const type = typeRaw === 'team' || typeRaw === 'league' ? typeRaw : undefined
  const limitRaw = url.searchParams.get('limit')?.trim()
  const limit = limitRaw ? Number(limitRaw) : undefined
  try {
    const items = await searchFootshortsEntities({
      q,
      type,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    return NextResponse.json({ ok: true, items })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to search entities' },
      { status: 500 },
    )
  }
}
