import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL'
const ANON_ENV = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/**
 * Server-side Supabase client (Route Handlers / Server Components) bound to the
 * `next/headers` cookie jar. Used by `/auth/callback` to exchange an OAuth /
 * magic-link `?code` for a session and write the session cookies.
 *
 * Distinct from `./supabaseServer` (service-role, used by API routes for
 * privileged reads): this one is anon-keyed and cookie-bound so it acts as the
 * signed-in user.
 */
export async function createServerSupabase() {
  const url = process.env[URL_ENV]
  const key = process.env[ANON_ENV]
  if (!url || !key) throw new Error(`Missing ${URL_ENV} or ${ANON_ENV}`)
  const jar = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return jar.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            jar.set(name, value, options)
          }
        } catch {
          // Read-only cookie jar (Server Component). The browser client / a
          // subsequent request refreshes the session cookie.
        }
      },
    },
  })
}
