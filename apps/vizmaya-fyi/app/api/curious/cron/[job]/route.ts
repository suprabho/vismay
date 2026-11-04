import { NextRequest, NextResponse } from 'next/server'
import { dispatchWorker, isWorkerDispatchConfigured, type WorkerDef } from '@vismay/content-source/workerDispatch'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron → GitHub Actions bridge for the Curious Desk's claim pipeline,
 * for the same reason as /api/ai-data-centers/cron: GitHub's scheduler is
 * best-effort, Vercel Cron is exact to the minute. The workflows keep
 * `workflow_dispatch` only, so the two schedulers never double-run.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`; fails closed.
 *
 * Jobs (the last path segment):
 *   collect-gdelt  — curious-collect.yml with source gdelt, 02:20 UTC
 *   collect-loc    — curious-collect.yml with source loc, 02:40 UTC
 *   detect         — curious-detect.yml (detect → grade → verify), 03:50 UTC
 */
const JOBS: Record<string, { worker: WorkerDef; inputs: Record<string, string> }> = {
  'collect-gdelt': {
    worker: { id: 'curious-collect', workflowFile: 'curious-collect.yml', label: 'Curious Desk collect (GDELT)', description: 'discover candidate news documents', schedule: '02:20 UTC' },
    inputs: { source: 'gdelt', limit: '2000' },
  },
  'collect-loc': {
    worker: { id: 'curious-collect', workflowFile: 'curious-collect.yml', label: 'Curious Desk collect (Library of Congress)', description: 'discover candidate historical documents', schedule: '02:40 UTC' },
    inputs: { source: 'loc', limit: '1500' },
  },
  detect: {
    worker: { id: 'curious-detect', workflowFile: 'curious-detect.yml', label: 'Curious Desk detect, grade, verify', description: 'turn fetched documents into graded candidate claims', schedule: '03:50 UTC' },
    inputs: {},
  },
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { job } = await ctx.params
  const def = JOBS[job]
  if (!def) return NextResponse.json({ error: `unknown job "${job}"`, jobs: Object.keys(JOBS) }, { status: 404 })
  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({ error: 'GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO are not set on this project' }, { status: 503 })
  }
  try {
    await dispatchWorker(def.worker, def.inputs)
    console.log(`[curious-cron] dispatched ${def.worker.workflowFile} for job "${job}" at ${new Date().toISOString()}`)
    return NextResponse.json({ ok: true, job, workflow: def.worker.workflowFile, inputs: def.inputs, at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[curious-cron] dispatch of ${def.worker.workflowFile} failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
