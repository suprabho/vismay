/**
 * Canva Connect API client — token refresh, asset upload, design creation.
 *
 * Single-tenant: one Canva account drives every push. Tokens live in the
 * `canva_tokens` table (id = 1) and refresh silently when within
 * REFRESH_BUFFER_MS of expiry. Bootstrap once via scripts/canva-bootstrap.ts
 * to populate the row; after that, server routes call `getValidAccessToken`
 * before any API call and never see auth.
 *
 * Asset upload is async: POST /v1/asset-uploads returns a job id, then the
 * job polls until `status: success` (or `failed`). Polling cap is generous
 * because a 60s 1080p autoplay MP4 typically takes 15–45s of server-side
 * processing.
 *
 * Required env (server only):
 *   CANVA_CLIENT_ID
 *   CANVA_CLIENT_SECRET
 *   CANVA_REDIRECT_URI    must match the value registered on the Canva app
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const CANVA_API = 'https://api.canva.com/rest/v1'
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'

/** Refresh the access token if it expires within this window. */
const REFRESH_BUFFER_MS = 60_000

/** Hard cap on asset-upload polling. ~2 minutes covers normal upload + transcode. */
const UPLOAD_POLL_TIMEOUT_MS = 120_000
const UPLOAD_POLL_INTERVAL_MS = 2_000

interface TokenRow {
  access_token: string
  refresh_token: string
  expires_at: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

export class CanvaConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvaConfigError'
  }
}

export class CanvaAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvaAuthError'
  }
}

export class CanvaApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'CanvaApiError'
  }
}

function requireEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.CANVA_CLIENT_ID
  const clientSecret = process.env.CANVA_CLIENT_SECRET
  const redirectUri = process.env.CANVA_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new CanvaConfigError(
      'CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI must all be set'
    )
  }
  return { clientId, clientSecret, redirectUri }
}

/**
 * HTTP Basic header for client_id:client_secret — Canva's token endpoint
 * accepts client credentials this way (and also as form fields, but Basic
 * is cleaner since the secret never lands in a request body).
 */
function basicAuthHeader(clientId: string, clientSecret: string): string {
  const b64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  return `Basic ${b64}`
}

/**
 * Returns a usable access token for the single Canva account, refreshing
 * via the stored refresh_token if needed. Persists the refreshed pair back
 * to `canva_tokens` (Canva rotates refresh tokens on every grant).
 *
 * Throws CanvaAuthError if no row exists (bootstrap hasn't run) or if the
 * refresh call returns an error — both cases mean the user needs to
 * re-run scripts/canva-bootstrap.ts.
 */
export async function getValidAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('canva_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('id', 1)
    .maybeSingle<TokenRow>()
  if (error) throw new Error(`canva_tokens read: ${error.message}`)
  if (!data) {
    throw new CanvaAuthError(
      'No Canva tokens stored — run `pnpm canva:bootstrap` to authorize first'
    )
  }

  const expiresMs = new Date(data.expires_at).getTime()
  if (expiresMs - Date.now() > REFRESH_BUFFER_MS) {
    return data.access_token
  }

  const refreshed = await refreshAccessToken(data.refresh_token)
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const { error: upErr } = await supabase
    .from('canva_tokens')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: expiresAt,
      scope: refreshed.scope ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (upErr) throw new Error(`canva_tokens update: ${upErr.message}`)
  return refreshed.access_token
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireEnv()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new CanvaAuthError(`Canva token refresh failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

/**
 * Exchange a freshly minted OAuth `code` for an access + refresh token pair.
 * Called once during bootstrap from /api/canva/callback. PKCE: the same
 * `code_verifier` that was used to derive the `code_challenge` on the auth
 * request must be passed back here.
 */
export async function exchangeAuthCode(args: {
  code: string
  codeVerifier: string
}): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireEnv()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: redirectUri,
    code_verifier: args.codeVerifier,
  })
  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new CanvaAuthError(`Canva code exchange failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

/**
 * Upload a video to Canva by passing the public Supabase URL directly.
 * Uses POST /v1/url-asset-uploads so Canva fetches the file from its CDN
 * rather than us streaming bytes — more reliable and avoids the duplex-half
 * fragility that caused assets to upload silently but never appear in the
 * Canva editor's Uploads tab.
 */
export async function uploadAssetFromUrl(args: {
  videoUrl: string
  accessToken: string
  name: string
}): Promise<{ assetId: string; thumbnailUrl?: string }> {
  const trimmedName = args.name.length > 255 ? args.name.slice(0, 255) : args.name

  const uploadRes = await fetch(`${CANVA_API}/url-asset-uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: trimmedName, url: args.videoUrl }),
  })

  if (!uploadRes.ok) {
    const text = await uploadRes.text()
    throw new CanvaApiError(
      `asset upload failed: ${uploadRes.status} ${text.slice(0, 300)}`,
      uploadRes.status
    )
  }

  const initial = (await uploadRes.json()) as {
    job: { id: string; status: string; asset?: { id: string; thumbnail?: { url: string } } }
  }

  const terminal = await pollUrlAssetUpload(initial.job.id, args.accessToken, initial.job)
  if (terminal.status !== 'success' || !terminal.asset) {
    throw new CanvaApiError(`asset upload did not succeed: ${terminal.status}`, 500)
  }
  return {
    assetId: terminal.asset.id,
    thumbnailUrl: terminal.asset.thumbnail?.url,
  }
}

async function pollUrlAssetUpload(
  jobId: string,
  accessToken: string,
  seed: { status: string; asset?: { id: string; thumbnail?: { url: string } } }
): Promise<{ status: string; asset?: { id: string; thumbnail?: { url: string } } }> {
  if (seed.status === 'success' || seed.status === 'failed') return seed

  const deadline = Date.now() + UPLOAD_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, UPLOAD_POLL_INTERVAL_MS))
    const res = await fetch(`${CANVA_API}/url-asset-uploads/${jobId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new CanvaApiError(
        `url-asset-upload poll failed: ${res.status} ${text.slice(0, 200)}`,
        res.status
      )
    }
    const body = (await res.json()) as {
      job: { status: string; asset?: { id: string; thumbnail?: { url: string } } }
    }
    if (body.job.status === 'success' || body.job.status === 'failed') return body.job
  }
  throw new CanvaApiError('asset-upload timed out after 2 min', 504)
}

/**
 * Create a blank Canva design at the correct aspect-ratio canvas. The
 * uploaded video lands in the user's Canva "Uploads" sidebar (via
 * `uploadAssetFromUrl`) but we can't embed it programmatically: Canva
 * Connect's `/v1/designs` only accepts `asset_id` for **image** assets,
 * not video. So instead we create a properly-sized blank design and let
 * the user drag the asset onto the canvas from the sidebar.
 *
 * Dimensions follow Canva's social-video conventions:
 *   9:16  → 1080×1920 (Instagram Reels / TikTok)
 *   16:9  → 1920×1080 (YouTube)
 *
 * Returns id + edit_url + thumbnail.
 */
export async function createBlankDesignForAspect(args: {
  aspect: '9:16' | '16:9'
  accessToken: string
  title: string
}): Promise<{ designId: string; editUrl: string; thumbnailUrl?: string }> {
  const dims =
    args.aspect === '9:16'
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 }

  const res = await fetch(`${CANVA_API}/designs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_type: { type: 'custom', width: dims.width, height: dims.height },
      title: args.title,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new CanvaApiError(
      `design create failed: ${res.status} ${text.slice(0, 300)}`,
      res.status
    )
  }
  const body = (await res.json()) as {
    design: {
      id: string
      urls: { edit_url: string; view_url?: string }
      thumbnail?: { url: string }
    }
  }
  return {
    designId: body.design.id,
    editUrl: body.design.urls.edit_url,
    thumbnailUrl: body.design.thumbnail?.url,
  }
}

/**
 * Look up an existing canva_designs row for (slug, aspect). Used by the
 * admin UI to flip the button to "Open in Canva" without re-uploading.
 */
export interface CanvaDesignRow {
  slug: string
  aspect: '9:16' | '16:9'
  design_id: string
  edit_url: string
  thumbnail_url: string | null
  pushed_at: string
}

export async function getCanvaDesign(
  supabase: SupabaseClient,
  slug: string,
  aspect: '9:16' | '16:9'
): Promise<CanvaDesignRow | null> {
  const { data, error } = await supabase
    .from('canva_designs')
    .select('slug, aspect, design_id, edit_url, thumbnail_url, pushed_at')
    .eq('slug', slug)
    .eq('aspect', aspect)
    .maybeSingle()
  if (error) {
    console.error(`[canva] design lookup failed: ${error.message}`)
    return null
  }
  return (data as CanvaDesignRow | null) ?? null
}

/**
 * Sign + encode the OAuth `state` parameter so the bootstrap script can
 * round-trip the PKCE verifier through Canva to a deployed callback route
 * without a server-side scratch table.
 *
 * Payload: { v: verifier, n: nonce, exp: unix-seconds }. Signed with HMAC-
 * SHA256 keyed by SUPABASE_SERVICE_ROLE_KEY (the only secret both the
 * bootstrap script and the deployed callback already have access to). The
 * threat model is single-tenant: an attacker would need the service role
 * key to forge a state, in which case they already own the database.
 *
 * Wire format: `<base64url(payload)>.<base64url(sig)>`.
 */
const STATE_TTL_SEC = 10 * 60

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function getStateSigningKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new CanvaConfigError('SUPABASE_SERVICE_ROLE_KEY must be set to sign OAuth state')
  return key
}

export interface OAuthStatePayload {
  verifier: string
  nonce: string
  exp: number
}

export function signOAuthState(verifier: string): string {
  const payload: OAuthStatePayload = {
    verifier,
    nonce: b64url(crypto.randomBytes(12)),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SEC,
  }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.createHmac('sha256', getStateSigningKey()).update(payloadB64).digest()
  return `${payloadB64}.${b64url(sig)}`
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const dot = state.indexOf('.')
  if (dot === -1) throw new CanvaAuthError('malformed state')
  const payloadB64 = state.slice(0, dot)
  const sigB64 = state.slice(dot + 1)

  const expected = crypto.createHmac('sha256', getStateSigningKey()).update(payloadB64).digest()
  const actual = fromB64url(sigB64)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new CanvaAuthError('state signature mismatch')
  }

  let payload: OAuthStatePayload
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8')) as OAuthStatePayload
  } catch {
    throw new CanvaAuthError('state payload not JSON')
  }
  if (typeof payload.verifier !== 'string' || typeof payload.exp !== 'number') {
    throw new CanvaAuthError('state payload invalid')
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new CanvaAuthError('state expired — re-run pnpm canva:bootstrap')
  }
  return payload
}

/**
 * Write a freshly minted token pair from the callback into the singleton
 * canva_tokens row. Caller passes the raw response from Canva's token
 * endpoint; this normalises `expires_in` into an `expires_at` timestamp.
 */
export async function storeTokens(
  supabase: SupabaseClient,
  token: { access_token: string; refresh_token: string; expires_in: number; scope?: string }
): Promise<void> {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()
  const { error } = await supabase.from('canva_tokens').upsert(
    {
      id: 1,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: expiresAt,
      scope: token.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  if (error) throw new Error(`canva_tokens upsert: ${error.message}`)
}

export async function upsertCanvaDesign(
  supabase: SupabaseClient,
  row: {
    slug: string
    aspect: '9:16' | '16:9'
    asset_id: string
    design_id: string
    edit_url: string
    thumbnail_url?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from('canva_designs').upsert(
    {
      slug: row.slug,
      aspect: row.aspect,
      asset_id: row.asset_id,
      design_id: row.design_id,
      edit_url: row.edit_url,
      thumbnail_url: row.thumbnail_url ?? null,
      pushed_at: new Date().toISOString(),
    },
    { onConflict: 'slug,aspect' }
  )
  if (error) throw new Error(`canva_designs upsert: ${error.message}`)
}
