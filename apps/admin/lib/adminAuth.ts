import { createAuth } from '@vismay/admin-core/auth'

/**
 * Vizmaya-fyi's admin auth instance. Backed by @vismay/admin-core so the
 * /admin app and any other admin-protected surface (e.g. /story/:slug/share)
 * share one HMAC-cookie session.
 *
 * Set ADMIN_COOKIE_DOMAIN=.vizmaya.fyi in production once apps/admin/ is
 * deployed at admin.vizmaya.fyi so the cookie is readable across subdomains.
 */
export const auth = createAuth({
  cookieName: 'vmy_admin',
  passwordEnv: 'ADMIN_PASSWORD',
  secretEnv: 'ADMIN_SESSION_SECRET',
  cookieDomain: process.env.ADMIN_COOKIE_DOMAIN || undefined,
})

export const ADMIN_COOKIE_NAME = auth.cookieName
export const expectedToken = auth.expectedToken
export const isAuthed = auth.isAuthed
export const setAuthCookie = auth.setAuthCookie
export const clearAuthCookie = auth.clearAuthCookie
export const checkPassword = auth.checkPassword
