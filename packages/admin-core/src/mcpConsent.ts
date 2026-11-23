import crypto from 'crypto'

/**
 * MCP sign-in handoff: Scope B in docs/auth.md, in both directions.
 *
 * The hosted Vismay MCP (vizmaya.fyi/api/mcp) runs its own OAuth server, but
 * people sign in on admin, the only place with an admin session. So the OAuth
 * `authorize` step on vizmaya.fyi packs the pending sign-in into a signed
 * request and sends the browser to admin's consent page; admin checks the
 * session, shows who is asking, and on Allow signs an approval for exactly that
 * request and sends the browser back to the callback the request names.
 * vizmaya.fyi checks both signatures before it issues an authorization code.
 *
 * Both deployments already hold ADMIN_SESSION_SECRET (signed output URLs), so
 * nothing new is shared. Each token type uses its own key derived from it, so a
 * request can never pass for an approval or for any other signed value.
 *
 * Token shape: `v1.<base64url JSON>.<base64url HMAC-SHA256>`.
 */

const VERSION = 'v1'
const SECRET_ENV = 'ADMIN_SESSION_SECRET'
const MAX_TOKEN_LENGTH = 8000
const DEFAULT_TTL_SECONDS = 15 * 60

export interface McpConsentRequest {
  /** The app's own name for itself, as it registered. Self-declared: show it with the redirect host. */
  clientName: string
  /** Where the app receives the result. Its host is what tells a real app from a lookalike. */
  redirectUri: string
  /** The vizmaya.fyi URL admin sends the decision to. */
  callback: string
  /** What the grant covers, for display. */
  scope: string
  /** Unix seconds after which the request is void. */
  exp: number
  /** Everything vizmaya.fyi needs back to finish the grant. Opaque to admin. */
  grant: Record<string, string>
}

function key(purpose: 'request' | 'approval'): Buffer | null {
  const secret = process.env[SECRET_ENV]
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(`vismay-mcp-consent:${purpose}:${VERSION}`).digest()
}

function mac(k: Buffer, data: string): string {
  return crypto.createHmac('sha256', k).update(data).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function isCallback(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

/** Sign a pending sign-in (vizmaya.fyi side). Throws when ADMIN_SESSION_SECRET is unset. */
export function signMcpConsentRequest(
  request: Omit<McpConsentRequest, 'exp'>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const k = key('request')
  if (!k) throw new Error(`${SECRET_ENV} is not set; cannot sign an MCP sign-in request`)
  if (!isCallback(request.callback)) throw new Error('signMcpConsentRequest: callback must be https')
  const body: McpConsentRequest = { ...request, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  const token = `${VERSION}.${payload}.${mac(k, `${VERSION}.${payload}`)}`
  if (token.length > MAX_TOKEN_LENGTH) throw new Error('signMcpConsentRequest: request too large')
  return token
}

/** Verify and read a pending sign-in (both sides). Null when forged, expired or malformed. Never throws. */
export function readMcpConsentRequest(token: string | null | undefined): McpConsentRequest | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null
  const k = key('request')
  if (!k) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  const [, payload, sig] = parts as [string, string, string]
  if (!safeEqual(sig, mac(k, `${VERSION}.${payload}`))) return null
  let body: unknown
  try {
    body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const r = body as Partial<McpConsentRequest>
  if (
    typeof r.clientName !== 'string' ||
    typeof r.redirectUri !== 'string' ||
    typeof r.callback !== 'string' ||
    typeof r.scope !== 'string' ||
    typeof r.exp !== 'number' ||
    !r.grant ||
    typeof r.grant !== 'object'
  ) {
    return null
  }
  if (Math.floor(Date.now() / 1000) > r.exp) return null
  if (!isCallback(r.callback)) return null
  return r as McpConsentRequest
}

/** Approve a pending sign-in (admin side, after checking the session). Null when the request is not valid. */
export function approveMcpConsentRequest(token: string): string | null {
  const k = key('approval')
  if (!k || !readMcpConsentRequest(token)) return null
  return mac(k, token)
}

/** Check an approval against the request it claims to approve (vizmaya.fyi side). Never throws. */
export function verifyMcpConsentApproval(token: string | null | undefined, approval: string | null | undefined): boolean {
  if (!token || !approval) return false
  const k = key('approval')
  if (!k || !readMcpConsentRequest(token)) return false
  return safeEqual(approval, mac(k, token))
}

/** Where admin sends the decision: the request's callback with the request and either the approval or a denial. */
export function mcpConsentDecisionUrl(token: string, decision: { approval: string } | { denied: true }): string | null {
  const request = readMcpConsentRequest(token)
  if (!request) return null
  const url = new URL(request.callback)
  url.searchParams.set('request', token)
  if ('approval' in decision) url.searchParams.set('approval', decision.approval)
  else url.searchParams.set('denied', '1')
  return url.toString()
}
