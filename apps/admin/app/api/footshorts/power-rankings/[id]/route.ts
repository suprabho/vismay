import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  deletePowerRanking,
  getPowerRanking,
  updatePowerRanking,
  type PowerRankingEntry,
} from '@vismay/content-source/footshortsPowerRankings'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Fetch one snapshot with its full `rankings` list (lazy-loaded by the tab —
 *  the list endpoint returns metadata only). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  try {
    const ranking = await getPowerRanking(id)
    if (!ranking) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, ranking })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to load power ranking' },
      { status: 500 },
    )
  }
}

/** Editor corrections before publish (fix a mis-resolved team, narrative, week label). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as {
    rankings?: PowerRankingEntry[]
    narrative?: string | null
    weekLabel?: string | null
  }
  if (body.rankings === undefined && body.narrative === undefined && body.weekLabel === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }
  if (body.rankings !== undefined && !Array.isArray(body.rankings)) {
    return NextResponse.json({ error: 'rankings must be an array' }, { status: 400 })
  }
  try {
    const ranking = await updatePowerRanking(id, {
      rankings: body.rankings,
      narrative: body.narrative,
      weekLabel: body.weekLabel,
    })
    return NextResponse.json({ ok: true, ranking })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 },
    )
  }
}

/** Delete a snapshot (e.g. a bad scrape). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  await deletePowerRanking(id)
  return NextResponse.json({ ok: true })
}
