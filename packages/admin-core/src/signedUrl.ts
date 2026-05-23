import crypto from 'crypto'

const DEFAULT_TTL_SECONDS = 60 * 10
const DEFAULT_SECRET_ENV = 'ADMIN_SESSION_SECRET'
const TOKEN_PARAM = 't'
const EXP_PARAM = 'exp'

export interface SignOptions {
  /** Absolute base URL of the target consumer, e.g. 'https://vizmaya.fyi'. */
  baseUrl: string
  /** Pathname being signed, e.g. '/story/abc/share'. Query string is NOT part of the signature. */
  path: string
  /** Token lifetime in seconds. Default 600 (10 minutes). */
  ttlSeconds?: number
  /** Additional query params to append (after the signed t & exp). Not covered by the HMAC — safe to vary freely. */
  query?: Record<string, string | number | boolean | undefined | null>
  /** Env var name for the signing secret. Default 'ADMIN_SESSION_SECRET'. */
  secretEnv?: string
}

export interface VerifyContext {
  pathname: string
  searchParams: URLSearchParams
}

export interface VerifyOptions {
  secretEnv?: string
}

function getSecret(secretEnv: string): string {
  const secret = process.env[secretEnv]
  if (!secret) throw new Error(`${secretEnv} is not set; cannot sign URL`)
  return secret
}

function computeToken(secret: string, path: string, exp: number): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${path}|${exp}`)
    .digest('base64url')
}

/**
 * Sign a URL pointing at a gated consumer-domain output route.
 *
 * Token = HMAC-SHA256(ADMIN_SESSION_SECRET, `${path}|${exp}`) base64url-encoded,
 * carried in `?t=...&exp=...`. The signature covers the pathname and expiry
 * only; extra query params (e.g. `?ratio=1:1`) can be added freely.
 *
 * Why not cookies: cookies can't cross top-level domains, so a vismay.xyz
 * login can't auth requests to vizmaya.fyi / vizf1.com / footshorts.com.
 * Signed URLs are stateless, TLD-agnostic, and need no per-domain config
 * beyond the shared ADMIN_SESSION_SECRET env var.
 */
export function signOutputUrl(options: SignOptions): string {
  const {
    baseUrl,
    path,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    query,
    secretEnv = DEFAULT_SECRET_ENV,
  } = options
  const secret = getSecret(secretEnv)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const token = computeToken(secret, normalizedPath, exp)

  const url = new URL(normalizedPath, baseUrl)
  url.searchParams.set(TOKEN_PARAM, token)
  url.searchParams.set(EXP_PARAM, String(exp))
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

/**
 * Verify a request carries a valid signed-URL token. Never throws.
 *
 * Returns true iff `t` and `exp` are present, `exp` is in the future, and
 * the HMAC recomputed from (pathname, exp) matches `t`.
 */
export function verifySignedRequest(
  ctx: VerifyContext,
  options: VerifyOptions = {}
): boolean {
  const { secretEnv = DEFAULT_SECRET_ENV } = options
  const secret = process.env[secretEnv]
  if (!secret) return false

  const token = ctx.searchParams.get(TOKEN_PARAM)
  const expStr = ctx.searchParams.get(EXP_PARAM)
  if (!token || !expStr) return false

  const exp = Number(expStr)
  if (!Number.isFinite(exp)) return false
  if (Math.floor(Date.now() / 1000) > exp) return false

  let expected: string
  try {
    expected = computeToken(secret, ctx.pathname, exp)
  } catch {
    return false
  }
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
