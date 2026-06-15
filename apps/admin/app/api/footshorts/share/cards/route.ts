import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createShareCard, listShareCards } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

/** List saved share cards, newest first. */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const cards = await listShareCards()
  return NextResponse.json({ ok: true, cards })
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
