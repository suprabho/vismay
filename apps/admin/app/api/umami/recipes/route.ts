import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listFoodRecipesForAdmin } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// Browse/search the food recipe corpora (`?q&source&cuisine&offset&limit`).
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const num = (key: string): number | undefined => {
    const v = Number(url.searchParams.get(key))
    return Number.isFinite(v) && v >= 0 ? v : undefined
  }
  try {
    const { rows, total } = await listFoodRecipesForAdmin({
      q: url.searchParams.get('q') ?? undefined,
      source: url.searchParams.get('source') ?? undefined,
      cuisine: url.searchParams.get('cuisine') ?? undefined,
      offset: num('offset'),
      limit: num('limit'),
    })
    return NextResponse.json({ rows, total })
  } catch (e) {
    return NextResponse.json({ rows: [], total: 0, error: e instanceof Error ? e.message : 'failed' })
  }
}
