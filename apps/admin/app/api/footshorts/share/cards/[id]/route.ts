import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { deleteShareCard } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

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
