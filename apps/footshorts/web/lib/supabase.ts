import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * Cookie-based browser Supabase client (`@supabase/ssr`). Cookies (not
 * localStorage) hold the session and the OAuth/magic-link PKCE verifier, so the
 * server `/auth/callback` route can complete the code exchange. Same `.auth.*`
 * API the AuthProvider already uses.
 */
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
