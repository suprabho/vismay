import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function supabaseServer(): SupabaseClient {
  if (!URL) throw new Error('supabaseServer: missing NEXT_PUBLIC_SUPABASE_URL')
  const key = SERVICE_ROLE_KEY ?? ANON_KEY
  if (!key) {
    throw new Error(
      'supabaseServer: missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)',
    )
  }
  return createClient(URL, key, {
    auth: { persistSession: false },
  })
}
