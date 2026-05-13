/**
 * GET /api/canva/callback?code=…&state=…
 *
 * One-time OAuth landing for the Canva Connect bootstrap. The companion
 * `pnpm canva:bootstrap` script generates a PKCE verifier, signs it into
 * the `state` query param with the service-role key, and opens the
 * Canva auth URL pointing here.
 *
 * On a successful redirect we verify the state signature, exchange the
 * `code` for an access + refresh token pair, and upsert into the single
 * canva_tokens row (id = 1). The script polls the row's `updated_at` and
 * exits once it sees the write land.
 *
 * NOT admin-gated by intent: the security boundary is the HMAC on `state`,
 * keyed by the service role key. Anyone who could forge a valid state
 * already has database write access and could write tokens directly.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  CanvaAuthError,
  CanvaConfigError,
  exchangeAuthCode,
  storeTokens,
  verifyOAuthState,
} from '@/lib/canva'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function html(status: number, title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
     <style>body{font:14px/1.4 system-ui;padding:2rem;max-width:40rem;margin:auto}
     pre{background:#f4f4f5;padding:.75rem;border-radius:.25rem;overflow:auto}</style>
     </head><body><h1>${title}</h1>${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (oauthError) {
    return html(
      400,
      'Canva auth failed',
      `<p>Canva returned an error.</p><pre>${oauthError}</pre>
       <p>Re-run <code>pnpm canva:bootstrap</code> and try again.</p>`
    )
  }
  if (!code || !state) {
    return html(400, 'Missing code or state', '<p>Bad redirect from Canva.</p>')
  }

  let verifier: string
  try {
    verifier = verifyOAuthState(state).verifier
  } catch (err) {
    const message = err instanceof CanvaAuthError ? err.message : 'state verification failed'
    return html(
      400,
      'State verification failed',
      `<p>${message}</p><p>Re-run <code>pnpm canva:bootstrap</code> — state is one-time use and 10-minute TTL.</p>`
    )
  }

  let token
  try {
    token = await exchangeAuthCode({ code, codeVerifier: verifier })
  } catch (err) {
    const message =
      err instanceof CanvaAuthError || err instanceof CanvaConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'token exchange failed'
    return html(
      500,
      'Token exchange failed',
      `<pre>${message}</pre><p>Re-run <code>pnpm canva:bootstrap</code>.</p>`
    )
  }

  try {
    const supabase = createServiceClient()
    await storeTokens(supabase, token)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'token store failed'
    return html(500, 'Token store failed', `<pre>${message}</pre>`)
  }

  return html(
    200,
    'Canva authorized',
    `<p>Tokens stored. You can close this tab — the bootstrap script will exit on its own.</p>`
  )
}
