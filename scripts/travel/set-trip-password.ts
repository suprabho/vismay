/**
 * Create/update a travel trip's password gate row.
 *
 *   pnpm travel:set-password <slug> <password> [--name "New York"] [--status live]
 *
 * Upserts into travel_trips (migration 073) with a scrypt hash. Rotating the
 * password automatically invalidates every outstanding viewer cookie — the
 * session HMAC mixes the hash in (see content-source/demoAuth.ts).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Inline scrypt hash matching @vismay/content-source/demoAuth `hashPassword`
// (kept dependency-free so this script runs with just root devDeps).
function hashPassword(plain: string): string {
  const N = 16384
  const r = 8
  const p = 1
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(plain, salt, 32, { N, r, p })
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}

async function main() {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const [slug, password] = positional
  if (!slug || !password) {
    console.error(
      'usage: pnpm travel:set-password <slug> <password> [--name "Trip name"] [--status draft|live|archived]'
    )
    process.exit(1)
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(slug)) {
    console.error(`bad slug "${slug}" — lowercase letters/digits/dashes only`)
    process.exit(1)
  }
  const status = getFlag('status') ?? 'live'
  if (!['draft', 'live', 'archived'].includes(status)) {
    console.error(`bad --status "${status}"`)
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const { error } = await supabase.from('travel_trips').upsert(
    {
      slug,
      name: getFlag('name') ?? slug,
      password_hash: hashPassword(password),
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'slug' }
  )
  if (error) {
    console.error(`upsert failed: ${error.message}`)
    process.exit(1)
  }
  console.log(
    `✓ trip "${slug}" gate ${status === 'live' ? 'LIVE' : status.toUpperCase()} — password set (old viewer cookies are now invalid).`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
