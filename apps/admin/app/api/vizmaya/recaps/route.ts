import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  PIPELINE_EPICS,
  getPipelineEpic,
  listPipelineRecaps,
} from '@vismay/content-source/pipelines'

export const dynamic = 'force-dynamic'

// Merged recap-snapshot timeline across every epic with a recap worker
// (`?epic=` scopes to one). `epics` carries the recap-capable registry
// entries so the client can render its epic filter chips.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = req.nextUrl.searchParams
  const rawLimit = Number(params.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 60) : 20
  const epic = params.get('epic') ?? undefined
  if (epic && !getPipelineEpic(epic)) return NextResponse.json({ error: 'unknown epic' }, { status: 400 })

  const { recaps, errors } = await listPipelineRecaps({ epic, limit })
  return NextResponse.json({
    recaps,
    errors,
    epics: PIPELINE_EPICS.filter((e) => e.hasRecaps),
  })
}
