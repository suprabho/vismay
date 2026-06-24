import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createShareCard, listShareCardSummaries } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

/**
 * List saved share cards, newest first — paginated summaries only (no `config`
 * snapshot, which can be multiple MB per card). The gallery lazy-loads a card's
 * full config from `/share/cards/[id]` when it's opened.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = request.nextUrl.searchParams
  const limit = Number(params.get('limit')) || undefined
  const offset = Number(params.get('offset')) || undefined
  try {
    const page = await listShareCardSummaries({ limit, offset })
    return NextResponse.json({ ok: true, ...page })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list cards' },
      { status: 500 },
    )
  }
}

/** Save the current card snapshot under a name. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    cardType?: string
    config?: unknown
  }
  const name = body.name?.trim()
  if (!name || !body.cardType || body.config == null) {
    return NextResponse.json({ error: 'name, cardType and config are required' }, { status: 400 })
  }
  const card = await createShareCard({ name, cardType: body.cardType, config: body.config })
  return NextResponse.json({ ok: true, card }, { status: 201 })
}
