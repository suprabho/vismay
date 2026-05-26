/**
 * Public base URL of the vismay.xyz admin app, used by editor pages on
 * vizmaya.fyi to point save fetches at admin's API directly (no more
 * /api/admin/* cookie-forwarding proxy — see docs/auth.md Phase 2a).
 *
 * `NEXT_PUBLIC_ADMIN_URL` is the canonical env. We resolve it once per
 * server-render so the value reaches the client through props, not the
 * client bundle — keeps the build deterministic when the URL differs per
 * environment (staging vs prod).
 */
const FALLBACK = 'https://vismay.xyz'

export function adminBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_URL || FALLBACK).replace(/\/$/, '')
}
