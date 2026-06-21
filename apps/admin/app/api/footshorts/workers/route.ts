/**
 * Footshorts worker control plane.
 *
 * GET  → status of every worker (definition + last run), so the Pipeline tab can
 *        show "when were they last deployed". When dispatch envs aren't set
 *        (local dev) returns `mode: 'unconfigured'` with the worker defs but no
 *        last-run data.
 *
 * POST → trigger workers via workflow_dispatch. Body { worker?: string }:
 *        omit `worker` (or pass 'all') to fire every worker; pass an id to fire
 *        one. Returns per-worker outcomes so the UI can show which fired.
 *
 * Admin-auth gated. Mirrors the recap trigger's `unconfigured` convention.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  FOOTSHORTS_WORKERS,
  dispatchAllWorkers,
  dispatchWorker,
  fetchWorkerStatuses,
  findWorker,
  isWorkerDispatchConfigured,
} from '@vismay/content-source/workerDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({
      ok: true,
      mode: 'unconfigured',
      workers: FOOTSHORTS_WORKERS.map((w) => ({ ...w, lastRun: null })),
    })
  }

  try {
    const workers = await fetchWorkerStatuses()
    return NextResponse.json({ ok: true, mode: 'configured', workers })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to load workers' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { worker?: string }
  const target = body.worker?.trim()

  if (target && target !== 'all' && !findWorker(target)) {
    return NextResponse.json({ error: `unknown worker '${target}'` }, { status: 400 })
  }

  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    if (!target || target === 'all') {
      const results = await dispatchAllWorkers()
      return NextResponse.json({ ok: true, mode: 'dispatched', results })
    }
    const worker = findWorker(target)!
    await dispatchWorker(worker)
    return NextResponse.json({
      ok: true,
      mode: 'dispatched',
      results: [{ id: worker.id, ok: true }],
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 },
    )
  }
}
