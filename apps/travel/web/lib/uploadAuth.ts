import { createAuth } from '@vismay/admin-core/auth'

/**
 * Gate for the /upload page — the trip OWNER's login (not the per-trip
 * viewer password). Reuses the shared admin password envs so the same
 * credentials work here and on vismay.xyz; the cookie is scoped to the
 * travel app's own domain.
 */
export const uploadAuth = createAuth({
  cookieName: 'travel_admin',
  passwordEnv: 'ADMIN_PASSWORD',
  secretEnv: 'ADMIN_SESSION_SECRET',
})
