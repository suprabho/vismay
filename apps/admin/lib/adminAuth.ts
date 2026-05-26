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
 */
const COOKIE_DOMAIN =
  process.env.NODE_ENV === 'production'
    ? process.env.ADMIN_COOKIE_DOMAIN || '.vismay.xyz'
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
