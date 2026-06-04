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

/**
 * Admin allowlist. The Supabase project is **shared** with footshorts (which has
 * open consumer self-signup), so a valid Supabase session is NOT sufficient —
 * the session email must be explicitly allowed. Set `ADMIN_ALLOWED_EMAILS` to a
 * comma-separated list; an entry starting with `@` matches a whole domain
 * (e.g. `@promad.design`). Fails CLOSED: unset/empty ⇒ nobody is admin.
 */
function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.ADMIN_ALLOWED_EMAILS
  if (!raw) return false
  const target = email.trim().toLowerCase()
  const domain = target.slice(target.indexOf('@')) // includes '@'
  for (const entryRaw of raw.split(',')) {
    const entry = entryRaw.trim().toLowerCase()
    if (!entry) continue
    if (entry.startsWith('@')) {
      if (domain === entry) return true
    } else if (entry === target) {
      return true
    }
  }
  return false
}

/**
 * The auth boundary. In Supabase mode the session user must also be in the
 * admin allowlist (see `isAllowedEmail`). Legacy mode keeps the HMAC cookie.
 */
export async function isAuthed(): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.getUser()
    return !error && isAllowedEmail(data.user?.email)
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
    if (error) return { ok: false, error: error.message }
    // Credentials are valid, but this project also holds consumer (footshorts)
    // users — only allowlisted emails may hold an admin session. Reject and
    // drop the just-created session so no dangling cookie is left behind.
    if (!isAllowedEmail(email)) {
      await supabase.auth.signOut()
      return { ok: false, error: 'This account is not an authorized admin.' }
    }
    return { ok: true }
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
