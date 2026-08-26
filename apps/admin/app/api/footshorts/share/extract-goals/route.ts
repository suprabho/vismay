/**
 * POST → one-off extraction of JUST the goal events for a single fixture from
 * theanalyst's Opta match-centre widget, via workflow_dispatch on
 * footshorts-theanalyst-match-facts.yml (--fixture-id mode). Manual
 * alternative to the 3-hourly cron for the share-card studio's Match
 * Timeline layer editor's "Extract goals now" button.
 *
 * Body: { fixtureId: string, competitionSlug: string } — both required; the
 * worker script resolves/uses the theanalyst match id server-side exactly as
 * it does for the full-competition run.
 *
 * 200 { ok: true, mode: 'dispatched' | 'unconfigured' }
 *
 * Admin-auth gated. Mirrors power-rankings/trigger/route.ts's convention.
 */
import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  THEANALYST_MATCH_FACTS_WORKER,
  dispatchWorker,
  isWorkerDispatchConfigured,
} from '@vismay/content-source/workerDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    fixtureId?: string
    competitionSlug?: string
  }
  const fixtureId = body.fixtureId?.trim()
  const competitionSlug = body.competitionSlug?.trim()
  if (!fixtureId || !competitionSlug) {
    return NextResponse.json(
      { error: 'fixtureId and competitionSlug are required' },
      { status: 400 },
    )
  }

  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    await dispatchWorker(THEANALYST_MATCH_FACTS_WORKER, {
      competition: competitionSlug,
      fixture_id: fixtureId,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}
