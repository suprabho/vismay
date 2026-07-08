import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getDcStockMarket } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// The tracked AI Data Centers stocks with their trailing close series, for the
// Pipeline tab's sparkline cards. Same reader the public
// /api/ai-data-centers/stocks route uses, but isAuthed()-gated for admin.
// The client filters by market (US comes from massive.com; the non-US names
// are hand-uploaded via the Stooq card), so the route returns every ticker.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const rawDays = Number(req.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 730) : 90
  const stocks = await getDcStockMarket(days)
  return NextResponse.json({ days, stocks })
}
