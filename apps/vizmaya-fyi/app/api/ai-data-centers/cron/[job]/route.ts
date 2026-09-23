import { NextRequest, NextResponse } from 'next/server'
import { dispatchWorker, isWorkerDispatchConfigured, type WorkerDef } from '@vismay/content-source/workerDispatch'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron → GitHub Actions bridge for the daily edition.
 *
 * GitHub's scheduler is best-effort: on the edition's first two days the
 * 06:45 scrape ran at 12:03, the 08:15 chain never started, and the 09:00 /
 * 09:30 publish crons did not fire at all. Chaining the jobs fixed their
 * ordering but not whether they start. Vercel Cron is exact to the minute,
 * so it is the trigger now: at each time in vercel.json it calls this route,
 * which dispatches the matching workflow with the same GitHub token the
 * video / PDF renders already use. The workflows keep `workflow_dispatch`
 * only — no `schedule:` — so the two schedulers never double-run a day.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron
 * invocation when the project has that env var. Fails closed without it,
 * so the route can never be fired anonymously.
 *
 * Jobs (the last path segment):
 *   morning       — dc-morning-edition.yml (scrape → papers → compose), 08:15 UTC
 *   publish       — publish-dc-edition.yml, 09:00 UTC
 *   publish-late  — the same publish workflow, 09:30 UTC (the post-hold catch-up)
 */
const JOBS: Record<string, WorkerDef> = {
  morning: {
    id: 'dc-morning-edition',
    workflowFile: 'dc-morning-edition.yml',
    label: 'AI Data Centers morning edition',
    description: 'scrape → papers → compose for the window that just closed',
    schedule: '08:15 UTC',
  },
  publish: {
    id: 'publish-dc-edition',
    workflowFile: 'publish-dc-edition.yml',
    label: 'AI Data Centers publish',
    description: 'freeze the draft as the day’s edition',
    schedule: '09:00 UTC',
  },
  'publish-late': {
    id: 'publish-dc-edition',
    workflowFile: 'publish-dc-edition.yml',
    label: 'AI Data Centers publish (after a hold)',
    description: 'publish a draft an editor held past 09:00',
    schedule: '09:30 UTC',
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
  const worker = JOBS[job]
  if (!worker) return NextResponse.json({ error: `unknown job "${job}"`, jobs: Object.keys(JOBS) }, { status: 404 })
  if (!isWorkerDispatchConfigured()) {
    return NextResponse.json({ error: 'GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO are not set on this project' }, { status: 503 })
  }
  try {
    await dispatchWorker(worker)
    console.log(`[dc-cron] dispatched ${worker.workflowFile} for job "${job}" at ${new Date().toISOString()}`)
    return NextResponse.json({ ok: true, job, workflow: worker.workflowFile, at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[dc-cron] dispatch of ${worker.workflowFile} failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
