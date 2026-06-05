'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Auth client abstraction for {@link AuthWidget}.
 *
 * The widget is purely presentational — it never imports a Supabase client
 * directly. Instead each app injects an {@link AuthClient} that decides *how* a
 * session is established. Two adapters ship here:
 *
 *   - {@link createSupabaseAuthClient} — consumer apps. Every method runs
 *     through the browser Supabase client.
 *   - {@link createAdminAuthClient} — admin. Password posts to `/api/login`
 *     (server-side allow-list gate + host-only cookie); OAuth / magic-link go
 *     through the browser client and land on `/auth/callback`.
 *
 * OAuth and magic-link are redirect flows: they need a cookie-based browser
 * client so the PKCE verifier lands in a cookie the server `/auth/callback`
 * route can read. {@link createAuthBrowserClient} builds exactly that on top of
 * `@supabase/ssr` `createBrowserClient`.
 */

export type AuthProvider = 'password' | 'google' | 'magic'

export interface AuthResult {
  /** Human-readable error, or null on success. */
  error: string | null
}

export interface AuthClient {
  signInWithPassword(email: string, password: string): Promise<AuthResult>
  signUp(email: string, password: string): Promise<AuthResult>
  /** Starts an OAuth redirect; resolves only if *starting* it failed. */
  signInWithOAuth(provider: 'google', redirectTo: string): Promise<AuthResult>
  /** Sends a magic-link / OTP email. */
  signInWithOtp(email: string, redirectTo: string): Promise<AuthResult>
}

/**
 * Cookie-based browser Supabase client. Use one per app (singleton). Sessions
 * and the PKCE code verifier are stored in cookies — readable by the matching
 * server `/auth/callback` route, which is what makes OAuth / magic-link work
 * uniformly across consumer apps and admin.
 */
export function createAuthBrowserClient(url: string, anonKey: string): SupabaseClient {
  return createBrowserClient(url, anonKey)
}

/** Consumer adapter: all methods go through the browser Supabase client. */
export function createSupabaseAuthClient(supabase: SupabaseClient): AuthClient {
  return {
    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password })
      return { error: error?.message ?? null }
    },
    async signInWithOAuth(provider, redirectTo) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      })
      return { error: error?.message ?? null }
    },
    async signInWithOtp(email, redirectTo) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      })
      return { error: error?.message ?? null }
    },
  }
}

/**
 * Admin adapter. Password is sent to the admin `/api/login` route so the
 * server enforces the `ADMIN_ALLOWED_EMAILS` allow-list and sets the host-only
 * session cookie. OAuth / magic-link reuse the consumer browser-client methods;
 * the admin `/auth/callback` route re-checks the allow-list after the exchange.
 */
export function createAdminAuthClient(opts: {
  supabase: SupabaseClient
  loginEndpoint?: string
}): AuthClient {
  const loginEndpoint = opts.loginEndpoint ?? '/api/login'
  const base = createSupabaseAuthClient(opts.supabase)
  return {
    ...base,
    async signInWithPassword(email, password) {
      const res = await fetch(loginEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) return { error: null }
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { error: body.error ?? 'Wrong email or password' }
    },
  }
}
