/**
 * The registrable-domain rule for admin session cookies, shared by BOTH the
 * server client ({@link import('./supabaseServer')}) and the browser client
 * ({@link import('../components/AdminAuth').default}).
 *
 * Returns `.vismay.xyz` for the vismay.xyz admin family (so one Supabase session
 * cookie is shared across `vismay.xyz` + every `*.vismay.xyz` hostname alias),
 * or `undefined` (host-only) for every other host — the per-vertical admin TLDs
 * (admin.footshorts.com, …), Vercel preview URLs, and localhost.
 *
 * Why this MUST be one function used on both sides: a cookie written with
 * `domain=.vismay.xyz` can only be refreshed or *cleared* by a writer that sets
 * the same domain. When the server set the domain but the browser client did
 * not, gotrue-js on the client could never clear an invalid session cookie — so
 * a stale refresh token looped against `/token` forever (`refresh_token_not_found`)
 * until it tripped Supabase's rate limiter (`over_request_rate_limit`). Keeping
 * the rule here means the two sides can't drift apart again.
 *
 * Note: this is the host-based rule only. The server additionally forces
 * host-only cookies in dev / Vercel preview and honours an `ADMIN_COOKIE_DOMAIN`
 * override (see `supabaseServer.ts`); those env signals aren't available in the
 * browser, but they don't need to be — preview runs on `*.vercel.app` and dev on
 * `localhost`, neither of which matches below, so both sides independently land
 * on host-only there.
 */
export function adminCookieDomainForHost(host: string | null | undefined): string | undefined {
  const h = (host ?? '').split(':')[0].toLowerCase()
  if (h === 'vismay.xyz' || h.endsWith('.vismay.xyz')) return '.vismay.xyz'
  return undefined
}
