import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listFoodHistoryEventsForAdmin, listFoodHistorySubjects } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// Browse/filter the food-history review queue
// (`?subjectKind&subjectSlug&kind&status&q&offset&limit`), or `?subjects=1`
// for the subject list that drives the filter dropdown.
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  try {
    if (url.searchParams.get('subjects')) {
      const subjects = await listFoodHistorySubjects()
      return NextResponse.json({ subjects })
    }
    const num = (key: string): number | undefined => {
      const v = Number(url.searchParams.get(key))
      return Number.isFinite(v) && v >= 0 ? v : undefined
    }
    const { rows, total } = await listFoodHistoryEventsForAdmin({
      subjectKind: url.searchParams.get('subjectKind') ?? undefined,
      subjectSlug: url.searchParams.get('subjectSlug') ?? undefined,
      kind: url.searchParams.get('kind') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
      offset: num('offset'),
      limit: num('limit'),
    })
    return NextResponse.json({ rows, total })
  } catch (e) {
    return NextResponse.json({ rows: [], total: 0, error: e instanceof Error ? e.message : 'failed' })
  }
}
