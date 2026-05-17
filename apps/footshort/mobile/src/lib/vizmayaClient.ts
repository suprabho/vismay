import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Anonymous read-only Supabase client pointed at vizmaya.fyi's project.
 *
 * Mobile twin of apps/footshort/web/lib/vizmayaClient.ts. The Editorial mode
 * on mobile (a WebView shell over vizmaya.fyi) only needs this for the
 * magazine-feed metadata; the WebView itself runs against vizmaya.fyi
 * directly.
 */

let cached: SupabaseClient | null = null

export function getVizmayaClient(): SupabaseClient {
  if (cached) return cached
  const url =
    process.env.EXPO_PUBLIC_VIZMAYA_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_VIZMAYA_SUPABASE_URL
  const key =
    process.env.EXPO_PUBLIC_VIZMAYA_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_VIZMAYA_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'EXPO_PUBLIC_VIZMAYA_SUPABASE_URL and EXPO_PUBLIC_VIZMAYA_SUPABASE_ANON_KEY must be set ' +
        'for Footshort mobile to read Editorial stories from vizmaya.fyi.'
    )
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
