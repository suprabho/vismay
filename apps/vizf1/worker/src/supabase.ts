import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for the vizf1 worker.
 *
 * The worker only runs server-side (cron + local dev), so it always needs the
 * service-role key — bypassing RLS for writes. Throws fast if env is missing
 * so cron failures surface in CI logs.
 */
export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!url) {
    throw new Error('worker: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) required')
  }
  if (!key) {
    throw new Error('worker: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) required')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
