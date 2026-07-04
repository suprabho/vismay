import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getDcPipelineStats } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// Health snapshot of the AI Data Centers news + stock pipeline (dc_news /
// dc_news_recaps / dc_stocks / dc_stock_prices) for the DC Pipeline tab.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const stats = await getDcPipelineStats()
    return NextResponse.json({ stats })
  } catch (e) {
    // Before migrations 065/066 the dc_* tables don't exist — surface that as
    // a readable error instead of a 500 stack.
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
