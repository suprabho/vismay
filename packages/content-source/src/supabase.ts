import { createClient } from '@supabase/supabase-js'

/**
 * Browser/client-side Supabase client (uses anon key).
 * Safe to use in client components — only has public access.
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createClient(url, anonKey)
}

/**
 * Server-side Supabase client (uses service role key).
 * Only use in server components, API routes, or scripts — never in the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, serviceKey)
}

/**
 * Postgres "undefined column" (42703). Lets a read degrade gracefully when
 * the code is deployed ahead of the migration that adds the column — retry
 * with the older column list instead of 500-ing the page.
 */
export function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}
