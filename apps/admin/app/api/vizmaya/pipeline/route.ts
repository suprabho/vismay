import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getPipelineOverview } from '@vismay/content-source/pipelines'

export const dynamic = 'force-dynamic'

// Per-epic health snapshot of every registered content pipeline for the
// Pipeline tab. Failures (e.g. a migration not applied yet) come back per
// epic in entry.error rather than 500-ing the whole overview.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const overview = await getPipelineOverview()
  return NextResponse.json({ overview })
}
