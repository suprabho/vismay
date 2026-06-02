import { createAuth } from '@vismay/admin-core/auth'

/**
 * Admin's HMAC-cookie session. Canonical to `vismay.xyz` — the cookie is
 * scoped to `.vismay.xyz` in production so all admin subdomains
 * (`vizmaya.vismay.xyz`, `vizf1.vismay.xyz`, `footshorts.vismay.xyz`) share
 * one login. Consumer TLDs (vizmaya.fyi, vizf1.com, footshorts.com) never
 * carry this cookie — cross-TLD authorization there goes through
 * `signOutputUrl()` instead. See [docs/auth.md](../../../docs/auth.md).
 *
 * `ADMIN_COOKIE_DOMAIN` env var overrides the default for staging hosts that
 * use a different parent (e.g. `.vismay-staging.dev`); leaving it unset in
 * dev keeps the cookie host-only on `localhost`.
 *
 * Vercel **preview** deployments (`VERCEL_ENV === 'preview'`) run with
 * `NODE_ENV=production` but are served from `*.vercel.app`, which can't carry a
 * `.vismay.xyz` cookie — the browser silently drops the `Set-Cookie` and login
 * loops back to `/login`. On preview we leave the domain unset so the cookie is
 * host-only and sticks to the preview URL. Auth stays fully on (the password is
 * still required); only the cookie's domain scope changes. An explicit
 * `ADMIN_COOKIE_DOMAIN` still wins, so a custom preview domain can opt back
 * into a shared cookie.
 */
const COOKIE_DOMAIN =
  process.env.NODE_ENV === 'production'
    ? process.env.ADMIN_COOKIE_DOMAIN ||
      (process.env.VERCEL_ENV === 'preview' ? undefined : '.vismay.xyz')
    : undefined

export const auth = createAuth({
  cookieName: 'vmy_admin',
  passwordEnv: 'ADMIN_PASSWORD',
  secretEnv: 'ADMIN_SESSION_SECRET',
  cookieDomain: COOKIE_DOMAIN,
})

export const ADMIN_COOKIE_NAME = auth.cookieName
export const expectedToken = auth.expectedToken
export const isAuthed = auth.isAuthed
export const setAuthCookie = auth.setAuthCookie
export const clearAuthCookie = auth.clearAuthCookie
export const checkPassword = auth.checkPassword
