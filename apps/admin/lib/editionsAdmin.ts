/**
 * Server-side helpers behind the admin Editions tab: the public-site links,
 * the signed draft preview URL, the revalidate ping after a publish, and the
 * compose-workflow dispatch behind Recompose. Reuses the GitHub dispatch env
 * the other worker panels use (GITHUB_DISPATCH_TOKEN / _REPO / _REF) and the
 * shared ADMIN_SESSION_SECRET for the signed calls to vizmaya.fyi.
 */

import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { dispatchWorker, fetchWorkerStatus, isWorkerDispatchConfigured, type WorkerDef, type WorkerStatus } from '@vismay/content-source/workerDispatch'
import { vizmayaPublicUrl } from '@/lib/publicSite'

export const COMPOSE_WORKER: WorkerDef = {
  id: 'compose-dc-edition',
  workflowFile: 'compose-dc-edition.yml',
  label: 'Edition composer',
  description: 'Re-runs the daily snapshot composer on the same window; editor edits survive unless cleared.',
  schedule: 'Daily 08:15 UTC',
}

export const PUBLISH_WORKER: WorkerDef = {
  id: 'publish-dc-edition',
  workflowFile: 'publish-dc-edition.yml',
  label: 'Edition publish',
  description: 'Freezes the draft edition.',
  schedule: 'Daily 09:00 + 09:30 UTC',
}

export function editionPublicUrl(date: string): string {
  return `${vizmayaPublicUrl}/ai-data-centers/daily/${date}`
}

/** Signed preview of the current draft on vizmaya.fyi (10-minute token). */
export function draftPreviewUrl(): string | null {
  try {
    return signOutputUrl({ baseUrl: vizmayaPublicUrl, path: '/ai-data-centers/daily/preview', ttlSeconds: 600 })
  } catch {
    return null
  }
}

/** Ask vizmaya.fyi to re-render /daily and /daily/[date] after a publish. */
export async function pingEditionRevalidate(date: string): Promise<{ ok: boolean; detail: string }> {
  let url: string
  try {
    url = signOutputUrl({ baseUrl: vizmayaPublicUrl, path: '/api/ai-data-centers/editions/revalidate', ttlSeconds: 120, query: { date } })
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'could not sign the revalidate URL' }
  }
  try {
    const res = await fetch(url, { method: 'POST', cache: 'no-store' })
    const body = await res.text()
    return { ok: res.ok, detail: `${res.status} ${body.slice(0, 200)}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'revalidate request failed' }
  }
}

export function isRecomposeConfigured(): boolean {
  return isWorkerDispatchConfigured()
}

export async function dispatchRecompose(input: { date: string; clearEdits: boolean }): Promise<void> {
  await dispatchWorker(COMPOSE_WORKER, { date: input.date, clear_edits: input.clearEdits ? 'true' : 'false' })
}

/** Last run of the composer workflow, best-effort (null when dispatch isn't configured). */
export async function composerStatus(): Promise<WorkerStatus | null> {
  if (!isWorkerDispatchConfigured()) return null
  try {
    return await fetchWorkerStatus(COMPOSE_WORKER)
  } catch {
    return null
  }
}
