/**
 * POST → scrape ONE match's Opta match centre on demand, via workflow_dispatch
 * on footshorts-theanalyst-match-facts.yml (`--fixture-id` mode). The compose
 * "Add match" picker calls this for a fixture whose commentary/insights haven't
 * been captured, so an editor can pull exactly the matches a story needs
 * instead of backfilling a season.
 *
 * One run writes that fixture's per-side stats, its goal events, and the whole
 * Opta-OS narrative feed (commentary + insights).
 *
 * Body: { fixtureId: string, competition: string } — the worker resolves the
 * theanalyst match id server-side, exactly as the full-competition run does.
 *
 * 200 { ok: true, mode: 'dispatched' | 'unconfigured' }
 *
 * The share-card studio's `share/extract-goals` route makes the same dispatch
 * for its own "Extract goals now" button; keep the two in step if the worker's
 * single-fixture contract changes.
 *
 * Admin-auth gated.
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
    competition?: string
  }
  const fixtureId = body.fixtureId?.trim()
  const competition = body.competition?.trim()
  if (!fixtureId || !competition) {
    return NextResponse.json(
      { error: 'fixtureId and competition are required' },
      { status: 400 },
    )
  }

  // No dispatch env (local dev without a PAT): say so rather than 500-ing, so
  // the picker can tell the editor to run the worker themselves.
  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    await dispatchWorker(THEANALYST_MATCH_FACTS_WORKER, {
      competition,
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
