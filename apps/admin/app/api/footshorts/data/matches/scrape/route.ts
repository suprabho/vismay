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
 * Or { matches: [{ fixtureId, competition }, …] } (up to MAX_BATCH) — the
 * picker's "Fetch insights" for every ticked match: ONE run with comma lists,
 * since separate dispatches would cancel each other in the workflow's
 * concurrency group (it keeps one pending run).
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

/** The worker's MAX_FIXTURES_PER_RUN — the HTML-stories brief's match cap. */
const MAX_BATCH = 40

// Both end up in a comma list, so neither may carry one.
const ID_RE = /^[A-Za-z0-9_-]+$/
const SLUG_RE = /^[a-z0-9-]+$/

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    fixtureId?: string
    competition?: string
    matches?: Array<{ fixtureId?: string; competition?: string }>
  }
  const picks = Array.isArray(body.matches)
    ? body.matches
    : [{ fixtureId: body.fixtureId, competition: body.competition }]
  const fixtureIds = new Set<string>()
  const competitions = new Set<string>()
  for (const p of picks) {
    const fixtureId = typeof p?.fixtureId === 'string' ? p.fixtureId.trim() : ''
    const competition = typeof p?.competition === 'string' ? p.competition.trim() : ''
    if (!ID_RE.test(fixtureId) || !SLUG_RE.test(competition)) {
      return NextResponse.json(
        { error: 'every match needs a fixtureId and a competition slug' },
        { status: 400 },
      )
    }
    fixtureIds.add(fixtureId)
    competitions.add(competition)
  }
  if (fixtureIds.size === 0 || fixtureIds.size > MAX_BATCH) {
    return NextResponse.json(
      { error: `between 1 and ${MAX_BATCH} matches per scrape` },
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
      competition: [...competitions].join(','),
      fixture_id: [...fixtureIds].join(','),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}
