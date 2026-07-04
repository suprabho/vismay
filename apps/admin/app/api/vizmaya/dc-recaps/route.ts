import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listDcNewsRecaps } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// Timeline of dc_news_recaps snapshots (migration 066) for the DC Recaps tab.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const rawLimit = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 60) : 20
  try {
    const recaps = await listDcNewsRecaps(limit)
    return NextResponse.json({ recaps })
  } catch (e) {
    // Before migration 066 the table doesn't exist — surface a readable error.
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
