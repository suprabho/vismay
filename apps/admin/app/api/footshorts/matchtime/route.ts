/**
 * Sportradar match-timeline control plane for the Pipeline tab.
 *
 * GET  → hydration coverage (every finished WC fixture + its event count) plus
 *        the footshorts-events-sr.yml workflow's last run. Coverage is read
 *        best-effort so a Supabase hiccup still returns the dispatch state, and
 *        vice versa: `mode: 'unconfigured'` (dispatch envs unset, e.g. local
 *        dev) still returns coverage.
 *
 * POST → fire the sync via workflow_dispatch. Body (all optional):
 *   days  lookback window in days (1–90). Blank = script default (14).
 *   dry   true → match + parse, write nothing.
 *
 * Admin-auth gated. Mirrors the workers route's `unconfigured` convention.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { fetchMatchtimeCoverage } from '@vismay/content-source/footshortsData'
import {
  SPORTRADAR_EVENTS_WORKER,
  dispatchWorker,
  fetchWorkerStatus,
  isWorkerDispatchConfigured,
  type WorkerStatus,
} from '@vismay/content-source/workerDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const configured = isWorkerDispatchConfigured()
  let worker: WorkerStatus = { ...SPORTRADAR_EVENTS_WORKER, lastRun: null }
  if (configured) {
    worker = await fetchWorkerStatus(SPORTRADAR_EVENTS_WORKER)
  }

  let coverage = null
  let coverageError: string | undefined
  try {
    coverage = await fetchMatchtimeCoverage()
  } catch (e) {
    coverageError = e instanceof Error ? e.message : 'failed to load coverage'
  }

  return NextResponse.json({
    ok: true,
    mode: configured ? 'configured' : 'unconfigured',
    worker,
    coverage,
    coverageError,
  })
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    days?: number | string
    dry?: boolean
  }

  const inputs: Record<string, string> = {}
  if (body.days !== undefined && body.days !== '') {
    const n = Number(body.days)
    if (!Number.isInteger(n) || n <= 0 || n > 90) {
      return NextResponse.json(
        { error: 'days must be a whole number between 1 and 90' },
        { status: 400 },
      )
    }
    inputs.days = String(n)
  }
  if (body.dry) inputs.dry = 'true'

  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    await dispatchWorker(SPORTRADAR_EVENTS_WORKER, inputs)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}
