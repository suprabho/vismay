import { createServerSupabase, isSupabaseConfigured } from '@/lib/supabaseServer'

/**
 * The signed-in admin's email, for audit columns (`reviewed_by`, the
 * ai_generations edit rows). Null in legacy shared-password mode, where
 * there is no per-user identity.
 */
export async function adminEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    return data.user?.email ?? null
  } catch {
    return null
  }
}
