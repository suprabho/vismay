import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { unpublishPowerRanking } from '@vismay/content-source/footshortsPowerRankings'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Pull a published snapshot back to draft (hides it from consumers again). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  try {
    const ranking = await unpublishPowerRanking(id)
    return NextResponse.json({ ok: true, ranking })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unpublish failed' },
      { status: 500 },
    )
  }
}
