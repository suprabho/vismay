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
    auth: { persistSession: false },
  })
  return cached
}
