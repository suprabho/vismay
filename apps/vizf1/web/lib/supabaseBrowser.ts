'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let cached: SupabaseClient | null = null

export function supabaseBrowser(): SupabaseClient {
  if (cached) return cached
  if (!URL || !ANON_KEY) {
    throw new Error(
      'supabaseBrowser: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  cached = createClient(URL, ANON_KEY, {
    auth: {
      // Anonymous, read-only client: never holds a user session.
      persistSession: false,
      autoRefreshToken: false,
      // CRITICAL: a distinct storageKey from the cookie-based auth client
      // (`supabaseAuth`, default key `sb-<ref>-auth-token`). Without this both
      // clients share one GoTrueClient storage key and Web Lock, which supabase
      // -js warns is "undefined behavior when used concurrently under the same
      // storage key". Once a user signs in, the auth client's token refresh
      // contends with this client's concurrent public reads — and the telemetry
      // tab (two hooks + three viz modules reading at once) is where that
      // contention surfaced as a broken page.
      storageKey: 'sb-vizf1-public-readonly',
    },
  })
  return cached
}
