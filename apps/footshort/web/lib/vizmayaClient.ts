import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Anonymous read-only Supabase client pointed at vizmaya.fyi's project.
 *
 * Footshort renders Editorial stories sourced from Vizmaya. The Vizmaya
 * Supabase is completely separate from Footshort's own — different project,
 * different schema, different anon key. We use anon-tier read access; no
 * Editorial reads need auth, and Vizmaya's RLS already filters to published
 * + listed rows.
 */

let cached: SupabaseClient | null = null

export function getVizmayaClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_VIZMAYA_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_VIZMAYA_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_VIZMAYA_SUPABASE_URL and NEXT_PUBLIC_VIZMAYA_SUPABASE_ANON_KEY must be set ' +
        'for Footshort web to read Editorial stories from vizmaya.fyi.'
    )
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
