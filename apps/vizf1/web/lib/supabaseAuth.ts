'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let cached: SupabaseClient | null = null

/**
 * Cookie-based browser Supabase client (`@supabase/ssr`). Unlike
 * {@link import('./supabaseBrowser').supabaseBrowser} — which is an anonymous,
 * sessionless client for public reads — this one persists the session and the
 * OAuth/magic-link PKCE verifier in cookies, so the server `/auth/callback`
 * route can complete the code exchange. Use this for anything that needs the
 * signed-in user (AuthProvider, follows/profile reads + writes).
 */
export function supabaseAuth(): SupabaseClient {
  if (cached) return cached
  if (!URL || !ANON_KEY) {
    throw new Error(
      'supabaseAuth: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  cached = createBrowserClient(URL, ANON_KEY)
  return cached
}
