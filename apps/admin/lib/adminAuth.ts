import { createAuth } from '@vismay/admin-core/auth'
import { createServerSupabase, isSupabaseConfigured } from '@/lib/supabaseServer'

/**
 * Admin session. Per-user **Supabase Auth** when the project is configured
 * (`NEXT_PUBLIC_SUPABASE_URL` set); otherwise falls back to the legacy shared-
 * password HMAC cookie so dev / preview / CI without Supabase still work.
 *
 * The `isAuthed()` boundary is identical in both modes — every admin page guard
 * and `/api/*` route (and `authedOrAction()` on top of them) calls it unchanged.
 * Only the implementation behind it swaps.
 *
 * The HMAC cookie was canonical to `vismay.xyz` and scoped to `.vismay.xyz` so
 * all admin subdomains share one login; the Supabase session cookies carry the
 * same domain scope (see `lib/supabaseServer.ts` → `cookieDomain`). Consumer
 * TLDs (vizmaya.fyi, vizf1.com, …) never carry the admin cookie — cross-TLD
 * authorization goes through signed URLs / action tokens. See docs/auth.md.
 */
const COOKIE_DOMAIN =
  process.env.NODE_ENV === 'production'
    ? process.env.ADMIN_COOKIE_DOMAIN ||
      (process.env.VERCEL_ENV === 'preview' ? undefined : '.vismay.xyz')
    : undefined

/** Legacy shared-password gate — used only when Supabase isn't configured. */
export const auth = createAuth({
  cookieName: 'vmy_admin',
  passwordEnv: 'ADMIN_PASSWORD',
  secretEnv: 'ADMIN_SESSION_SECRET',
  cookieDomain: COOKIE_DOMAIN,
})

export const ADMIN_COOKIE_NAME = auth.cookieName

/** True when auth is configured at all (Supabase project OR legacy password). */
export function isConfigured(): boolean {
  return isSupabaseConfigured() || auth.expectedToken() !== null
}

/** The auth boundary. Backed by a Supabase session, or the legacy HMAC cookie. */
export async function isAuthed(): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.getUser()
    return !error && Boolean(data.user)
  }
  return auth.isAuthed()
}

/**
 * Establish a session. Supabase mode verifies `email`+`password` and sets the
 * session cookies; legacy mode treats `password` as the shared password and
 * ignores `email`.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { ok: false, error: error.message } : { ok: true }
  }
  if (auth.checkPassword(password)) {
    await auth.setAuthCookie()
    return { ok: true }
  }
  return { ok: false, error: 'invalid password' }
}

/** Clear the session. */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase()
    await supabase.auth.signOut()
    return
  }
  await auth.clearAuthCookie()
}
