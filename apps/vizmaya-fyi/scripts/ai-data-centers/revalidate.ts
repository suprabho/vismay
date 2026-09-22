/**
 * Ask vizmaya.fyi to re-render the edition pages after a publish.
 *
 * Published editions are static; only the on-demand revalidation hook
 * (`/api/ai-data-centers/editions/revalidate`) flushes `/ai-data-centers/daily`
 * and `/ai-data-centers/daily/[date]`. The hook verifies a signed URL made
 * with the shared ADMIN_SESSION_SECRET — the same stateless HMAC the admin
 * uses for gated render routes — so the cron needs no extra secret beyond
 * the one the render workflows already carry.
 *
 * Best-effort: a missing secret or an unreachable site logs a warning and
 * returns false; `/daily` also revalidates on a timer, so a missed ping
 * delays the new edition by minutes, never loses it.
 */

import { signOutputUrl } from '@vismay/admin-core/signedUrl'

export const REVALIDATE_PATH = '/api/ai-data-centers/editions/revalidate'

export function editionsSiteUrl(): string {
  return (process.env.EDITIONS_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://vizmaya.fyi').replace(/\/$/, '')
}

export async function pingEditionRevalidate(date: string): Promise<boolean> {
  if (!process.env.ADMIN_SESSION_SECRET) {
    console.warn('[editions] ADMIN_SESSION_SECRET not set — skipping the revalidate ping; /daily refreshes on its timer')
    return false
  }
  let url: string
  try {
    url = signOutputUrl({ baseUrl: editionsSiteUrl(), path: REVALIDATE_PATH, ttlSeconds: 120, query: { date } })
  } catch (err) {
    console.warn(`[editions] could not sign the revalidate URL: ${err instanceof Error ? err.message : err}`)
    return false
  }
  try {
    const res = await fetch(url, { method: 'POST' })
    const body = await res.text()
    if (!res.ok) {
      console.warn(`[editions] revalidate ping failed: ${res.status} ${body.slice(0, 200)}`)
      return false
    }
    console.log(`[editions] revalidated ${date}: ${body.slice(0, 200)}`)
    return true
  } catch (err) {
    console.warn(`[editions] revalidate ping errored: ${err instanceof Error ? err.message : err}`)
    return false
  }
}
