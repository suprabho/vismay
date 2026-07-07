/**
 * Footshorts worker control plane for the admin dashboard.
 *
 * The footshorts data pipeline runs as a set of scheduled GitHub Actions
 * "workers" (ingest, scores, fixtures, recap). This module is the shared
 * server-only helper the admin Pipeline tab uses to (a) fire any/all of them on
 * demand via `workflow_dispatch`, and (b) read back each one's most recent run
 * ("last deployed") so operators can see freshness at a glance.
 *
 * Mirrors recapDispatch.ts and reuses the same dispatch env so no new secrets
 * are needed:
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `actions` read + `workflow`
 *                          write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vismay")
 *   GITHUB_DISPATCH_REF    branch/tag the workflows run from (default: "main")
 */

/** A footshorts pipeline worker, keyed by its GitHub Actions workflow file. */
export interface WorkerDef {
  /** Stable id (== workflow file, minus .yml) used by the API + UI. */
  id: string
  /** Workflow file name, relative to .github/workflows/. */
  workflowFile: string
  /** Human label for the dashboard. */
  label: string
  /** One-line description of what the worker does. */
  description: string
  /** Cron summary shown next to the label (informational only). */
  schedule: string
}

/**
 * The footshorts workers, in pipeline order (data in → scores → fixtures →
 * recap). Keep in sync with .github/workflows/footshorts-*.yml.
 */
export const FOOTSHORTS_WORKERS: WorkerDef[] = [
  {
    id: 'footshorts-ingest',
    workflowFile: 'footshorts-ingest.yml',
    label: 'News ingest',
    description: 'Pulls RSS feeds, summarizes + tags each article via Gemini.',
    schedule: 'Hourly',
  },
  {
    id: 'footshorts-scores',
    workflowFile: 'footshorts-scores.yml',
    label: 'Scores refresh',
    description: 'Refreshes finished-match scores from football-data.org.',
    schedule: 'Every 3h',
  },
  {
    id: 'footshorts-fixtures',
    workflowFile: 'footshorts-fixtures.yml',
    label: 'Fixtures & standings',
    description: 'Syncs the fixture list + group standings.',
    schedule: 'Daily 05:00 UTC',
  },
  {
    id: 'footshorts-recap',
    workflowFile: 'footshorts-recap.yml',
    label: 'Daily recap',
    description:
      'Generates the editorial recap over a trailing window (scheduled run first hydrates match events).',
    schedule: 'Every 12h · manual ad-hoc',
  },
]

/**
 * The on-demand Sportradar WC match-timeline sync (footshorts-events-sr.yml).
 * Deliberately NOT in FOOTSHORTS_WORKERS: it has its own Pipeline-tab panel
 * with inputs (lookback days / dry run), and the scheduled Daily recap run
 * already hydrates WC events as one of its steps — so a generic entry here would
 * be redundant.
 */
export const SPORTRADAR_EVENTS_WORKER: WorkerDef = {
  id: 'footshorts-events-sr',
  workflowFile: 'footshorts-events-sr.yml',
  label: 'WC match timelines (Sportradar)',
  description: 'Hydrates finished World Cup fixtures with goals/cards/subs from Sportradar.',
  schedule: 'Manual · also runs inside Daily recap',
}

/** Most recent run of a worker's workflow, or null when it has never run. */
export interface WorkerLastRun {
  status: string | null
  conclusion: string | null
  /** ISO timestamp the run was created. */
  createdAt: string | null
  /** What triggered it: schedule, workflow_dispatch, push, … */
  event: string | null
  /** Link to the run on GitHub. */
  url: string | null
}

export interface WorkerStatus extends WorkerDef {
  lastRun: WorkerLastRun | null
}

export function isWorkerDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

function dispatchEnv(): { token: string; repo: string; ref: string } {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }
  return { token, repo, ref }
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Look up a worker by its id, or undefined if unknown. */
export function findWorker(id: string): WorkerDef | undefined {
  return FOOTSHORTS_WORKERS.find((w) => w.id === id)
}

/**
 * Fire a single worker's workflow_dispatch. Inputs are passed through verbatim;
 * the footshorts cron workers take none, while footshorts-recap takes optional
 * hours/competition/team (all default-able), so an empty object is always safe.
 */
export async function dispatchWorker(
  worker: WorkerDef,
  inputs: Record<string, string> = {}
): Promise<void> {
  const { token, repo, ref } = dispatchEnv()
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${worker.workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, inputs }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Dispatch of ${worker.id} failed: ${res.status} ${body.slice(0, 300)}`
    )
  }
  // 204 No Content on success.
}

/** Result of attempting to trigger every worker. */
export interface DispatchAllResult {
  id: string
  ok: boolean
  error?: string
}

/**
 * Trigger every footshorts worker. Each dispatch is independent — one failure
 * doesn't abort the rest — and the per-worker outcome is returned so the UI can
 * show which ones actually fired.
 */
export async function dispatchAllWorkers(): Promise<DispatchAllResult[]> {
  return Promise.all(
    FOOTSHORTS_WORKERS.map(async (w) => {
      try {
        await dispatchWorker(w)
        return { id: w.id, ok: true }
      } catch (e) {
        return {
          id: w.id,
          ok: false,
          error: e instanceof Error ? e.message : 'dispatch failed',
        }
      }
    })
  )
}

interface GhRun {
  status: string | null
  conclusion: string | null
  created_at: string | null
  event: string | null
  html_url: string | null
}

async function fetchLastRun(
  token: string,
  repo: string,
  worker: WorkerDef
): Promise<WorkerLastRun | null> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${worker.workflowFile}/runs?per_page=1`,
    { headers: ghHeaders(token), cache: 'no-store' }
  )
  if (!res.ok) {
    throw new Error(
      `Could not read runs for ${worker.id}: ${res.status}`
    )
  }
  const data = (await res.json()) as { workflow_runs?: GhRun[] }
  const run = data.workflow_runs?.[0]
  if (!run) return null
  return {
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    event: run.event,
    url: run.html_url,
  }
}

/**
 * Status (definition + last run) for a single worker — same best-effort
 * last-run read as fetchWorkerStatuses.
 */
export async function fetchWorkerStatus(worker: WorkerDef): Promise<WorkerStatus> {
  const { token, repo } = dispatchEnv()
  let lastRun: WorkerLastRun | null = null
  try {
    lastRun = await fetchLastRun(token, repo, worker)
  } catch {
    lastRun = null
  }
  return { ...worker, lastRun }
}

/**
 * Status (definition + last run) for every footshorts worker. The last-run read
 * is best-effort per worker: if one workflow's runs can't be fetched its
 * `lastRun` is null rather than failing the whole call.
 */
export async function fetchWorkerStatuses(): Promise<WorkerStatus[]> {
  const { token, repo } = dispatchEnv()
  return Promise.all(
    FOOTSHORTS_WORKERS.map(async (w) => {
      let lastRun: WorkerLastRun | null = null
      try {
        lastRun = await fetchLastRun(token, repo, w)
      } catch {
        lastRun = null
      }
      return { ...w, lastRun }
    })
  )
}
