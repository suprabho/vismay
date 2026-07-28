import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { setFoodHistoryEventStatus } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['reviewed', 'rejected', 'ai-draft'])

// Review action: PATCH { status: 'reviewed'|'rejected'|'ai-draft', note? }.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  let body: { status?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'status must be reviewed | rejected | ai-draft' }, { status: 400 })
  }
  try {
    const row = await setFoodHistoryEventStatus(
      id,
      body.status as 'reviewed' | 'rejected' | 'ai-draft',
      typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined
    )
    return NextResponse.json({ row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
