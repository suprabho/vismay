/**
 * OAuth 2.1 for the hosted Vismay MCP, so an MCP client signs in with a button
 * instead of carrying a publish token: paste https://vizmaya.fyi/api/mcp into
 * Claude, Claude Code or Cursor, click Connect, allow it on admin, done.
 *
 * The MCP endpoint is the protected resource; vizmaya.fyi is also its
 * authorization server (issuer = the site's origin). It speaks what the MCP
 * authorization spec asks of a server:
 *   - protected resource metadata (RFC 9728), linked from the 401's
 *     WWW-Authenticate header, at /.well-known/oauth-protected-resource[/api/mcp];
 *   - authorization server metadata (RFC 8414) at /.well-known/oauth-authorization-server;
 *   - dynamic client registration (RFC 7591), public clients and secret ones;
 *   - the authorization code grant with PKCE (S256 only) and refresh tokens;
 *   - resource indicators (RFC 8707): tokens are bound to this endpoint.
 *
 * People sign in on admin, never here: `authorize` sends the browser to admin's
 * consent page with a signed request, admin sends it back to `callback` with a
 * signed approval (@vismay/admin-core/mcpConsent, Scope B in docs/auth.md), and
 * only then is a code issued.
 *
 * Everything is stateless, so it runs on serverless functions with no table:
 * client ids, codes and tokens are HMAC-signed values (keys derived from
 * ADMIN_SESSION_SECRET, one per kind). The costs, accepted for a single-admin
 * service: a code can be redeemed more than once within its 5 minutes (PKCE
 * still binds it to the app that asked), and tokens can't be revoked one by
 * one. To sign every app out, bump MCP_TOKEN_GENERATION on the deployment.
 * Rotating ADMIN_SESSION_SECRET does that too, and signs admins out as well.
 */

import crypto from 'node:crypto'
import {
  readMcpConsentRequest,
  signMcpConsentRequest,
  verifyMcpConsentApproval,
} from '@vismay/admin-core/mcpConsent'

export const MCP_SCOPE = 'mcp'
const CODE_TTL = 5 * 60
const ACCESS_TTL = 60 * 60
const REFRESH_TTL = 30 * 24 * 60 * 60
/** A sign-in lasts at most this long however often it is refreshed; then the app asks again. */
const GRANT_MAX_AGE = 90 * 24 * 60 * 60
const MAX_TOKEN_LENGTH = 6000

type Kind = 'client' | 'code' | 'access' | 'refresh'
const PREFIX: Record<Kind, string> = { client: 'mcpc_', code: 'mcpk_', access: 'mcpa_', refresh: 'mcpr_' }

/** True when a bearer value is one of this server's access tokens (as opposed to a site publish token). */
export function isMcpAccessToken(value: string): boolean {
  return value.startsWith(PREFIX.access)
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function key(purpose: Kind | 'secret'): Buffer | null {
  const secret = env('ADMIN_SESSION_SECRET')
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(`vismay-mcp-oauth:${purpose}:v1`).digest()
}

/** Bumping MCP_TOKEN_GENERATION voids every code and token issued before. */
function generation(): string {
  return env('MCP_TOKEN_GENERATION') ?? '1'
}

const now = () => Math.floor(Date.now() / 1000)
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('base64url')
const hmac = (k: Buffer, s: string) => crypto.createHmac('sha256', k).update(s).digest('base64url')

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function seal(kind: Kind, payload: object): string {
  const k = key(kind)
  if (!k) throw new Error('ADMIN_SESSION_SECRET is not set')
  const body = b64(JSON.stringify(payload))
  return `${PREFIX[kind]}${body}.${hmac(k, `${PREFIX[kind]}${body}`)}`
}

function open<T>(kind: Kind, token: string | null | undefined): T | null {
  if (!token || token.length > MAX_TOKEN_LENGTH || !token.startsWith(PREFIX[kind])) return null
  const k = key(kind)
  if (!k) return null
  const parts = token.slice(PREFIX[kind].length).split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts as [string, string]
  if (!safeEqual(sig, hmac(k, `${PREFIX[kind]}${body}`))) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- URLs

export interface OAuthUrls {
  issuer: string
  /** The protected resource: the MCP endpoint every token is bound to. */
  resource: string
  resourceMetadata: string
  authorize: string
  token: string
  register: string
  callback: string
}

/** Everything is derived from the request's origin, so previews and local dev work without config. */
export function oauthUrls(req: Request): OAuthUrls {
  const origin = new URL(req.url).origin
  return {
    issuer: origin,
    resource: `${origin}/api/mcp`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp`,
    authorize: `${origin}/api/mcp/oauth/authorize`,
    token: `${origin}/api/mcp/oauth/token`,
    register: `${origin}/api/mcp/oauth/register`,
    callback: `${origin}/api/mcp/oauth/callback`,
  }
}

/** Admin's public URL, where people sign in (NEXT_PUBLIC_ADMIN_URL, as vizmaya-fyi's adminBaseUrl). */
function adminUrl(): string {
  return (env('NEXT_PUBLIC_ADMIN_URL') ?? 'https://vismay.xyz').replace(/\/$/, '')
}

function sameResource(requested: string, resource: string): boolean {
  return requested.replace(/\/$/, '') === resource
}

// ---------------------------------------------------------------- responses

export const OAUTH_CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-max-age': '86400',
}

/** The answer to a browser client's preflight on any OAuth endpoint. */
export function oauthPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...OAUTH_CORS_HEADERS, 'cache-control': 'no-store', ...headers } })
}

function oauthError(error: string, description: string, status = 400, headers: Record<string, string> = {}): Response {
  return json({ error, error_description: description }, status, headers)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** A plain page for errors that must not be sent to an unverified redirect URI. */
function errorPage(status: number, message: string): Response {
  const html =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Vismay MCP sign-in</title>' +
    '<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#111">' +
    `<h1 style="font-size:1.25rem">Couldn’t sign in to the Vismay MCP</h1><p>${escapeHtml(message)}</p></body>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' },
  })
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } })
}

function redirectWithError(redirectUri: string, state: string | undefined, error: string, description: string): Response {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state) url.searchParams.set('state', state)
  return redirect(url.toString())
}

// ---------------------------------------------------------------- metadata

/** RFC 9728: where clients learn which server issues tokens for /api/mcp. */
export function protectedResourceMetadata(req: Request): Response {
  const u = oauthUrls(req)
  return json(
    {
      resource: u.resource,
      authorization_servers: [u.issuer],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'Vismay MCP',
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  )
}

/** RFC 8414: the endpoints and what they support. */
export function authorizationServerMetadata(req: Request): Response {
  const u = oauthUrls(req)
  return json(
    {
      issuer: u.issuer,
      authorization_endpoint: u.authorize,
      token_endpoint: u.token,
      registration_endpoint: u.register,
      scopes_supported: [MCP_SCOPE],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  )
}

// ---------------------------------------------------------------- clients

type AuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic'
interface ClientRecord {
  /** Name, as the app registered it. */
  n: string
  /** Redirect URIs. */
  r: string[]
  /** Token endpoint auth method. */
  a: AuthMethod
  /** Issued at. */
  t: number
  /** Random, so two identical registrations are still two clients, with two secrets. */
  j: string
}

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'about:', 'blob:', 'ftp:', 'ws:', 'wss:'])

/** https, loopback http for desktop apps, or a native app's own scheme; never a fragment. */
export function isAllowedRedirectUri(uri: string): boolean {
  if (uri.length > 2000) return false
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.hash) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:') return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  return !BLOCKED_SCHEMES.has(u.protocol) && /^[a-z][a-z0-9+.-]*:$/.test(u.protocol)
}

function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : ''
  return s.slice(0, 80) || 'An MCP app'
}

function clientSecretFor(clientId: string): string {
  const k = key('secret')
  if (!k) throw new Error('ADMIN_SESSION_SECRET is not set')
  return hmac(k, clientId)
}

/** RFC 7591. Nothing is stored: the client id is the signed registration. */
export async function registerClient(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
  if (req.method !== 'POST') return oauthError('invalid_request', 'Register with POST.', 405)
  if (!key('client')) return oauthError('temporarily_unavailable', 'Sign-in is not configured on this deployment.', 503)
  const raw = await req.text()
  if (raw.length > 16_000) return oauthError('invalid_client_metadata', 'Registration too large.')
  let meta: Record<string, unknown>
  try {
    meta = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return oauthError('invalid_client_metadata', 'Send the client metadata as JSON.')
  }

  const uris = meta.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === 'string')) {
    return oauthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 URIs.')
  }
  const bad = (uris as string[]).find((u) => !isAllowedRedirectUri(u))
  if (bad) return oauthError('invalid_redirect_uri', `Not an allowed redirect URI: ${bad.slice(0, 200)}`)

  // RFC 7591's default is client_secret_basic.
  const requested = meta.token_endpoint_auth_method ?? 'client_secret_basic'
  if (requested !== 'none' && requested !== 'client_secret_post' && requested !== 'client_secret_basic') {
    return oauthError('invalid_client_metadata', `Unsupported token_endpoint_auth_method: ${String(requested)}.`)
  }
  const grantTypes = meta.grant_types
  if (Array.isArray(grantTypes) && !grantTypes.includes('authorization_code')) {
    return oauthError('invalid_client_metadata', 'Only the authorization_code grant (with refresh_token) is supported.')
  }
  const responseTypes = meta.response_types
  if (Array.isArray(responseTypes) && !responseTypes.includes('code')) {
    return oauthError('invalid_client_metadata', 'Only response_type code is supported.')
  }

  const record: ClientRecord = {
    n: cleanName(meta.client_name),
    r: uris as string[],
    a: requested,
    t: now(),
    j: crypto.randomBytes(12).toString('base64url'),
  }
  const clientId = seal('client', record)
  return json(
    {
      client_id: clientId,
      client_id_issued_at: record.t,
      ...(record.a === 'none' ? {} : { client_secret: clientSecretFor(clientId), client_secret_expires_at: 0 }),
      client_name: record.n,
      redirect_uris: record.r,
      token_endpoint_auth_method: record.a,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: MCP_SCOPE,
    },
    201,
  )
}

// ---------------------------------------------------------------- authorize and callback

/** The parts of a pending grant vizmaya.fyi needs back from admin. */
interface Grant extends Record<string, string> {
  /** sha256 of the client id. */
  cid: string
  /** Redirect URI. */
  ru: string
  /** PKCE code challenge (S256). */
  cc: string
  /** The client's state, echoed back. */
  st: string
  /** Resource the tokens will be bound to. */
  rs: string
}

/** Validate the app's request, then send the person to admin to allow it. */
export function authorize(req: Request): Response {
  if (!key('client')) return errorPage(503, 'Sign-in is not configured on this deployment (ADMIN_SESSION_SECRET is not set).')
  const u = oauthUrls(req)
  const p = new URL(req.url).searchParams
  const clientId = p.get('client_id')
  const client = open<ClientRecord>('client', clientId)
  if (!client || !clientId) return errorPage(400, 'The app sent an unknown client id. Start connecting again from the app.')
  const redirectUri = p.get('redirect_uri') ?? (client.r.length === 1 ? client.r[0]! : null)
  if (!redirectUri || !client.r.includes(redirectUri)) {
    return errorPage(400, 'The app’s redirect URI doesn’t match what it registered. Start connecting again from the app.')
  }

  // The redirect URI is the app's own from here on, so errors go back to it.
  const state = p.get('state') ?? undefined
  if (p.get('response_type') !== 'code') return redirectWithError(redirectUri, state, 'unsupported_response_type', 'Only response_type=code is supported.')
  if (state && state.length > 1000) return redirectWithError(redirectUri, undefined, 'invalid_request', 'state is too long.')
  const challenge = p.get('code_challenge')
  if (p.get('code_challenge_method') !== 'S256' || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return redirectWithError(redirectUri, state, 'invalid_request', 'PKCE is required, with code_challenge_method=S256.')
  }
  const resource = p.get('resource')
  if (resource && !sameResource(resource, u.resource)) {
    return redirectWithError(redirectUri, state, 'invalid_target', `This server only issues tokens for ${u.resource}.`)
  }

  const grant: Grant = { cid: sha(clientId), ru: redirectUri, cc: challenge, st: state ?? '', rs: u.resource }
  const request = signMcpConsentRequest({
    clientName: client.n,
    redirectUri,
    callback: u.callback,
    scope: MCP_SCOPE,
    grant,
  })
  return redirect(`${adminUrl()}/mcp/authorize/${request}`)
}

/** Admin's decision comes back here; an approved request becomes an authorization code. */
export function callback(req: Request): Response {
  const p = new URL(req.url).searchParams
  const token = p.get('request')
  const request = readMcpConsentRequest(token)
  if (!request || !token) return errorPage(400, 'This sign-in link has expired. Start connecting again from the app.')
  const g = request.grant as Partial<Grant>
  if (!g.cid || !g.ru || !g.cc || !g.rs || g.ru !== request.redirectUri) {
    return errorPage(400, 'This sign-in link is not valid. Start connecting again from the app.')
  }
  if (p.get('denied') === '1') return redirectWithError(g.ru, g.st || undefined, 'access_denied', 'The sign-in was cancelled.')
  if (!verifyMcpConsentApproval(token, p.get('approval'))) {
    return errorPage(403, 'This sign-in was not approved. Start connecting again from the app.')
  }
  const code = seal('code', { cid: g.cid, ru: g.ru, cc: g.cc, rs: g.rs, exp: now() + CODE_TTL, g: generation() })
  const url = new URL(g.ru)
  url.searchParams.set('code', code)
  if (g.st) url.searchParams.set('state', g.st)
  return redirect(url.toString())
}

// ---------------------------------------------------------------- token

interface CodeRecord {
  cid: string
  ru: string
  cc: string
  rs: string
  exp: number
  g: string
}
interface RefreshRecord {
  cid: string
  rs: string
  /** When the person allowed it: refreshes never outlive GRANT_MAX_AGE from here. */
  t0: number
  exp: number
  g: string
}
export interface AccessRecord {
  aud: string
  sc: string
  cid: string
  exp: number
  g: string
}

/** RFC 6749 §2.3.1: Basic credentials are form-encoded first. Malformed escapes stay as they are. */
function formDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get('content-type') ?? ''
  const raw = await req.text()
  if (raw.length > 16_000) return new URLSearchParams()
  if (type.includes('application/json')) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>
      return new URLSearchParams(Object.entries(body).filter(([, v]) => typeof v === 'string') as Array<[string, string]>)
    } catch {
      return new URLSearchParams()
    }
  }
  return new URLSearchParams(raw)
}

function issueTokens(cid: string, rs: string, t0: number): Response {
  const g = generation()
  const issued = now()
  const access = seal('access', { aud: rs, sc: MCP_SCOPE, cid, exp: issued + ACCESS_TTL, g } satisfies AccessRecord)
  const refresh = seal('refresh', {
    cid,
    rs,
    t0,
    exp: Math.min(issued + REFRESH_TTL, t0 + GRANT_MAX_AGE),
    g,
  } satisfies RefreshRecord)
  return json(
    { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: MCP_SCOPE },
    200,
    { pragma: 'no-cache' },
  )
}

/** The token endpoint: authorization_code (with PKCE) and refresh_token. */
export async function token(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
  if (req.method !== 'POST') return oauthError('invalid_request', 'Use POST.', 405)
  if (!key('client')) return oauthError('temporarily_unavailable', 'Sign-in is not configured on this deployment.', 503)
  const u = oauthUrls(req)
  const p = await readParams(req)

  // Client authentication: Basic header, or client_id (+ client_secret) in the body.
  let clientId = p.get('client_id')
  let secret = p.get('client_secret')
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
  if (basic) {
    const decoded = Buffer.from(basic, 'base64').toString('utf8')
    const i = decoded.indexOf(':')
    if (i < 0) return oauthError('invalid_client', 'Malformed Basic credentials.', 401, { 'www-authenticate': 'Basic' })
    clientId = formDecode(decoded.slice(0, i))
    secret = formDecode(decoded.slice(i + 1))
  }
  const client = open<ClientRecord>('client', clientId)
  const clientFail = () =>
    oauthError('invalid_client', 'Unknown client or wrong secret. Register again.', basic ? 401 : 400, basic ? { 'www-authenticate': 'Basic' } : {})
  if (!client || !clientId) return clientFail()
  if (client.a !== 'none' && (!secret || !safeEqual(secret, clientSecretFor(clientId)))) return clientFail()
  const cid = sha(clientId)
  const resource = p.get('resource')
  const t = now()

  const grantType = p.get('grant_type')
  if (grantType === 'authorization_code') {
    const code = open<CodeRecord>('code', p.get('code'))
    if (!code || code.exp < t || code.g !== generation() || code.cid !== cid) {
      return oauthError('invalid_grant', 'The authorization code is invalid or expired.')
    }
    const redirectUri = p.get('redirect_uri')
    if (redirectUri && redirectUri !== code.ru) return oauthError('invalid_grant', 'redirect_uri does not match the authorization request.')
    const verifier = p.get('code_verifier')
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || sha(verifier) !== code.cc) {
      return oauthError('invalid_grant', 'The PKCE code_verifier does not match.')
    }
    if (resource && !sameResource(resource, code.rs)) return oauthError('invalid_target', `Tokens are only issued for ${code.rs}.`)
    return issueTokens(cid, code.rs, t)
  }

  if (grantType === 'refresh_token') {
    const refresh = open<RefreshRecord>('refresh', p.get('refresh_token'))
    if (!refresh || refresh.exp < t || refresh.g !== generation() || refresh.cid !== cid || t > refresh.t0 + GRANT_MAX_AGE) {
      return oauthError('invalid_grant', 'The refresh token is invalid or expired. Sign in again.')
    }
    if (resource && !sameResource(resource, refresh.rs)) return oauthError('invalid_target', `Tokens are only issued for ${refresh.rs}.`)
    if (refresh.rs !== u.resource) return oauthError('invalid_grant', 'This refresh token belongs to another deployment.')
    return issueTokens(cid, refresh.rs, refresh.t0)
  }

  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.')
}

/** Verify an access token for this resource. Null when forged, expired, revoked or meant for another resource. */
export function verifyAccessToken(value: string, resource: string): AccessRecord | null {
  const record = open<AccessRecord>('access', value)
  if (!record || record.exp < now() || record.g !== generation() || record.aud !== resource || record.sc !== MCP_SCOPE) {
    return null
  }
  return record
}
