import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { deleteShareCard, updateShareCard } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Overwrite a saved share card in place (re-save keeps the same row). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    cardType?: string
    config?: unknown
  }
  if (body.config == null && body.cardType == null && body.name == null) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }
  try {
    const card = await updateShareCard(id, {
      name: body.name?.trim() || undefined,
      cardType: body.cardType,
      config: body.config,
    })
    return NextResponse.json({ ok: true, card })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 },
    )
  }
}

/** Delete a saved share card. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deleteShareCard(id)
  return NextResponse.json({ ok: true })
}
