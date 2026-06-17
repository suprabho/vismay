import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { deleteShareCard, updateShareCard } from '@vismay/content-source/vizmayaShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Update a saved share card in place (re-save the snapshot under its id). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    storySlug?: string | null
    baseType?: string
    ratio?: string | null
    config?: unknown
  }
  const card = await updateShareCard(id, body)
  return NextResponse.json({ ok: true, card })
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
