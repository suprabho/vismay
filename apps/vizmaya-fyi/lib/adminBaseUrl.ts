/**
 * Public base URL of the vismay.xyz admin app, used by editor pages on
 * vizmaya.fyi to point save fetches at admin's API directly (no more
 * /api/admin/* cookie-forwarding proxy — see docs/auth.md Phase 2a).
 *
 * Use the **canonical (`www`) hostname**, not the apex. Vercel 307s
 * `vismay.xyz/*` → `www.vismay.xyz/*` at the edge — including `/api/*` —
 * and CORS preflight requests cannot follow redirects, so an apex target
 * fails as "Redirect is not allowed for a preflight request" before any
 * admin middleware runs. If the deploy ever flips the canonical (or stops
 * redirecting), update both this fallback and `NEXT_PUBLIC_ADMIN_URL` so
 * they stay in lockstep.
 *
 * `NEXT_PUBLIC_ADMIN_URL` is the canonical env. We resolve it once per
 * server-render so the value reaches the client through props, not the
 * client bundle — keeps the build deterministic when the URL differs per
 * environment (staging vs prod).
 */
const FALLBACK = 'https://www.vismay.xyz'

export function adminBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_URL || FALLBACK).replace(/\/$/, '')
}
