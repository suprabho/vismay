/**
 * Provision an admin user in Supabase Auth.
 *
 * Admin signup is closed (no public sign-up page) — users are created here with
 * the service-role key. The `054_admin_profiles` trigger auto-creates the
 * matching `public.profiles` row.
 *
 * Run:
 *   pnpm --filter admin run create-admin-user <email> <password>
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (already in .env;
 * loaded via the script's `tsx --env-file=.env`).
 */
import { createClient } from '@supabase/supabase-js'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('usage: pnpm --filter admin run create-admin-user <email> <password>')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // internal tool — skip the confirmation email
  })
  if (error) {
    console.error('failed to create user:', error.message)
    process.exit(1)
  }
  console.log('created user:', data.user?.email, '·', data.user?.id)

  // This Supabase project is shared with footshorts; admin access is gated by
  // the ADMIN_ALLOWED_EMAILS allowlist (see lib/adminAuth.ts), not by merely
  // existing. Warn if the new account won't actually be able to reach admin.
  const allow = (process.env.ADMIN_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const target = (email ?? '').trim().toLowerCase()
  const domain = target.slice(target.indexOf('@'))
  const allowed = allow.some((e) => (e.startsWith('@') ? e === domain : e === target))
  if (!allowed) {
    console.warn(
      `\n⚠️  ${email} is NOT in ADMIN_ALLOWED_EMAILS — it can sign in to Supabase but will be denied admin.\n` +
        `   Add it to ADMIN_ALLOWED_EMAILS in apps/admin/.env (comma-separated; '@domain' allowed).`,
    )
  }
}

main()
