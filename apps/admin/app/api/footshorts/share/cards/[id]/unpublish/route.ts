import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { unpublishShareCard } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Pull a shipped card back to draft (removes it from the product). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  try {
    const card = await unpublishShareCard(id)
    return NextResponse.json({ ok: true, card })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unpublish failed' },
      { status: 500 },
    )
  }
}
