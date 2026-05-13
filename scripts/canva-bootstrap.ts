/**
 * One-time Canva OAuth bootstrap.
 *
 * The OAuth flow lands on the deployed Next.js route at
 * `${CANVA_REDIRECT_URI}` (typically https://vizmaya.fyi/api/canva/callback).
 * That route runs the code-for-token exchange and writes the tokens into
 * the `canva_tokens` row.
 *
 * This script:
 *   1. Generates a PKCE verifier in-memory.
 *   2. Signs the verifier into the OAuth `state` param (HMAC over the
 *      payload using SUPABASE_SERVICE_ROLE_KEY — see lib/canva.ts).
 *   3. Opens the Canva authorization URL in your browser.
 *   4. Polls `canva_tokens.updated_at` and exits once the row appears.
 *
 * The signed-state design keeps the verifier out of any database/temp
 * file: the deployed callback pulls it back out of `state`, runs the
 * token exchange, and writes the row. No new tables needed.
 *
 * Setup:
 *   1. Create a Canva integration at canva.com/developers (Connect API)
 *   2. Register redirect URL `${YOUR_DOMAIN}/api/canva/callback`
 *   3. Enable scopes: asset:read, asset:write, design:meta:read,
 *      design:content:write
 *   4. Set env vars in .env:
 *        CANVA_CLIENT_ID=...
 *        CANVA_CLIENT_SECRET=...
 *        CANVA_REDIRECT_URI=https://vizmaya.fyi/api/canva/callback
 *      (CLIENT_ID + CLIENT_SECRET must also be set on the deployed app
 *      so the callback route can exchange the code.)
 *   5. Run `pnpm canva:bootstrap`
 *
 * Usage:
 *   pnpm canva:bootstrap
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { exec } from 'child_process'
import { createClient } from '@supabase/supabase-js'

const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const SCOPES = [
  'asset:read',
  'asset:write',
  'design:meta:read',
  'design:content:write',
]

// How long to wait for the callback to finish and write the row.
const POLL_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 1500

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function signState(verifier: string, signingKey: string): string {
  const payload = {
    verifier,
    nonce: b64url(crypto.randomBytes(12)),
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.createHmac('sha256', signingKey).update(payloadB64).digest()
  return `${payloadB64}.${b64url(sig)}`
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`
  exec(cmd, (err) => {
    if (err) {
      console.error('Could not open browser automatically. Open this URL manually:')
      console.error(url)
    }
  })
}

async function main() {
  const clientId = process.env.CANVA_CLIENT_ID
  const redirectUri = process.env.CANVA_REDIRECT_URI
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!clientId) {
    console.error('Missing CANVA_CLIENT_ID in .env')
    process.exit(1)
  }
  if (!redirectUri) {
    console.error(
      'Missing CANVA_REDIRECT_URI in .env (e.g. https://vizmaya.fyi/api/canva/callback)'
    )
    process.exit(1)
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const { verifier, challenge } = generatePkcePair()
  const state = signState(verifier, serviceKey)

  const authUrl = new URL('https://www.canva.com/api/oauth/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', SCOPES.join(' '))
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)

  console.log('Opening Canva authorization in your browser…')
  console.log(`Redirect URI: ${redirectUri}`)
  console.log(`If the browser doesn't open, visit:\n  ${authUrl.toString()}\n`)
  openBrowser(authUrl.toString())

  // Snapshot the existing row (if any) so we can detect a fresh write.
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: before } = await supabase
    .from('canva_tokens')
    .select('updated_at')
    .eq('id', 1)
    .maybeSingle<{ updated_at: string }>()
  const baselineUpdatedAt = before?.updated_at ?? null

  console.log('Waiting for the callback to land tokens in canva_tokens…')
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const { data, error } = await supabase
      .from('canva_tokens')
      .select('updated_at, scope, expires_at')
      .eq('id', 1)
      .maybeSingle<{ updated_at: string; scope: string | null; expires_at: string }>()
    if (error) {
      console.error(`Poll error: ${error.message}`)
      continue
    }
    if (data && data.updated_at !== baselineUpdatedAt) {
      console.log('\n✓ Canva tokens stored.')
      console.log(`  Scopes: ${data.scope ?? '(none returned)'}`)
      console.log(`  Access token expires: ${data.expires_at}`)
      console.log('  Refresh token will rotate automatically on each refresh.')
      process.exit(0)
    }
    process.stdout.write('.')
  }

  console.error('\nTimed out after 5 min. Check the deployed callback logs:')
  console.error('  - is the redirect URI in Canva exactly the one you set in .env?')
  console.error('  - is CANVA_CLIENT_ID / CANVA_CLIENT_SECRET set on the deployed app?')
  console.error('  - did Canva return an error in the browser tab?')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
