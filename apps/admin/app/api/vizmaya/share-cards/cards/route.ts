import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createShareCard, listShareCards } from '@vismay/content-source/vizmayaShareCards'

export const dynamic = 'force-dynamic'

/** List saved share cards, newest first. Optionally scoped to one story. */
export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const storySlug = request.nextUrl.searchParams.get('storySlug') ?? undefined
  const cards = await listShareCards({ storySlug })
  return NextResponse.json({ ok: true, cards })
}

/** Save the current card snapshot under a name. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    storySlug?: string | null
    baseType?: string
    ratio?: string | null
    config?: unknown
  }
  const name = body.name?.trim()
  if (!name || !body.baseType || body.config == null) {
    return NextResponse.json({ error: 'name, baseType and config are required' }, { status: 400 })
  }
  const card = await createShareCard({
    name,
    storySlug: body.storySlug ?? null,
    baseType: body.baseType,
    ratio: body.ratio ?? null,
    config: body.config,
  })
  return NextResponse.json({ ok: true, card }, { status: 201 })
}
