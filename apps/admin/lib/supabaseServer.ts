import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'

/**
 * Supabase Auth wiring for admin (server side).
 *
 * Admin sign-in moved from the shared-password HMAC cookie to per-user Supabase
 * sessions. The session lives in `@supabase/ssr`-managed cookies; this module
 * builds the two server clients that read/refresh them:
 *
 *   - `createServerSupabase()`  — for Server Components + Route Handlers (bound
 *     to the `next/headers` cookie jar).
 *   - `createMiddlewareSupabase(req, res)` — for middleware (reads the request
 *     cookies, writes refreshed session cookies onto the response).
 *
 * Cookie domain is host-aware: the `.vismay.xyz` admin family shares one cookie,
 * while each consumer-TLD admin host (admin.vizmaya.fyi, admin.footshorts.com,
 * admin.vizf1.com) gets a host-only cookie — a different registrable domain
 * can't carry a `.vismay.xyz` cookie, so each runs its own independent
 * per-vertical session. Also host-only in dev / on Vercel preview URLs. See
 * docs/auth.md.
 */

const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL'
const ANON_ENV = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/** True when the Supabase project is wired in — gates the Supabase auth path. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env[URL_ENV] && process.env[ANON_ENV])
}

function requireEnv(): { url: string; key: string } {
  const url = process.env[URL_ENV]
  const key = process.env[ANON_ENV]
  if (!url || !key) throw new Error(`Missing ${URL_ENV} or ${ANON_ENV}`)
  return { url, key }
}

function cookieDomainForHost(host: string | null | undefined): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined
  if (process.env.ADMIN_COOKIE_DOMAIN) return process.env.ADMIN_COOKIE_DOMAIN
  if (process.env.VERCEL_ENV === 'preview') return undefined
  // Share ONE cookie across the vismay.xyz admin family (vismay.xyz +
  // *.vismay.xyz). Every other admin host — admin.vizmaya.fyi,
  // admin.footshorts.com, admin.vizf1.com — is a different registrable domain
  // that can't carry a `.vismay.xyz` cookie, so it gets a host-only cookie and
  // therefore its own independent per-vertical session.
  const h = (host ?? '').split(':')[0].toLowerCase()
  if (h === 'vismay.xyz' || h.endsWith('.vismay.xyz')) return '.vismay.xyz'
  return undefined
}

/** Merge the host-appropriate cookie domain into Supabase's per-cookie options. */
function withDomain(options: CookieOptions, host: string | null | undefined): CookieOptions {
  const domain = cookieDomainForHost(host)
  return domain ? { ...options, domain } : options
}

/** Server client for Server Components and Route Handlers. */
export async function createServerSupabase() {
  const { url, key } = requireEnv()
  const jar = await cookies()
  const host = (await headers()).get('host')
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return jar.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            jar.set(name, value, withDomain(options, host))
          }
        } catch {
          // `setAll` invoked from a Server Component, where the cookie jar is
          // read-only. Safe to ignore — the middleware refreshes the session
          // cookie on the next request.
        }
      },
    },
  })
}

/**
 * Middleware client. Reads the request cookies and writes any refreshed session
 * cookies onto BOTH the request (so a downstream read in this same pass sees
 * them) and the response (so the browser receives the Set-Cookie).
 */
export function createMiddlewareSupabase(req: NextRequest, res: NextResponse) {
  const { url, key } = requireEnv()
  const host = req.headers.get('host')
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          req.cookies.set(name, value)
        }
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, withDomain(options, host))
        }
      },
    },
  })
}
