import crypto from 'crypto'

/**
 * Action tokens — stateless bearer grants for cross-TLD admin actions.
 *
 * Companion to `signedUrl.ts`. Where `signOutputUrl` says "this person can
 * GET this path until exp," `signActionToken` says "this person can take
 * `scope` action on `subject` until exp." The signed URL gates page loads
 * across consumer TLDs (Scope B in docs/auth.md); the action token gates
 * mutating API calls from inside those pages back to admin.
 *
 * Why a separate primitive: the signed URL ties the grant to a specific
 * pathname, which is the right shape for "GET /share." Saves go to a
 * different path than the page that hosts the editor (page = /story/<slug>
 * /share on vizmaya.fyi; save = /api/vizmaya/stories/<slug> on
 * vismay.xyz), so the URL signature can't double as the save credential.
 * The action token carries the editor's authority over to the API call.
 *
 * Token shape: `v1.<exp>.<scope>.<subject>.<sig>`
 *   exp     — unix seconds (decimal string)
 *   scope   — short identifier; allowed chars `[a-zA-Z0-9_-]`
 *   subject — slug or id; allowed chars `[a-zA-Z0-9_-]`
 *   sig     — base64url HMAC-SHA256 over `v1|exp|scope|subject`
 *
 * The signature covers all four parts plus the version prefix, so a
 * scope-swap or subject-swap is a verification failure. Extra headers on
 * the request are unsigned and free to vary.
 *
 * Wire convention: pass the token in the `x-action-token` request header.
 * Use `ACTION_TOKEN_HEADER` so call sites stay in lockstep.
 */

const TOKEN_VERSION = 'v1'
const DEFAULT_TTL_SECONDS = 24 * 60 * 60
const DEFAULT_SECRET_ENV = 'ADMIN_SESSION_SECRET'
const SAFE_RE = /^[a-zA-Z0-9_-]+$/

export const ACTION_TOKEN_HEADER = 'x-action-token'

export interface SignActionTokenOptions {
  /** Short identifier for what the token grants. Must match `/^[a-zA-Z0-9_-]+$/`. */
  scope: string
  /** Slug or id this grant applies to. Must match `/^[a-zA-Z0-9_-]+$/`. */
  subject: string
  /** Token lifetime in seconds. Default 24h — matches the editing-session TTL. */
  ttlSeconds?: number
  /** Env var holding the signing secret. Default 'ADMIN_SESSION_SECRET'. */
  secretEnv?: string
}

export interface VerifyActionTokenOptions {
  scope: string
  subject: string
  secretEnv?: string
}

function getSecret(secretEnv: string): string {
  const secret = process.env[secretEnv]
  if (!secret) throw new Error(`${secretEnv} is not set; cannot sign action token`)
  return secret
}

function computeSig(secret: string, exp: number, scope: string, subject: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${TOKEN_VERSION}|${exp}|${scope}|${subject}`)
    .digest('base64url')
}

/**
 * Sign an action token. Throws if scope/subject contain anything outside
 * `[a-zA-Z0-9_-]` (delimiter collision would let a caller forge a different
 * grant) or if the signing secret isn't set.
 */
export function signActionToken(options: SignActionTokenOptions): string {
  const {
    scope,
    subject,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    secretEnv = DEFAULT_SECRET_ENV,
  } = options
  if (!SAFE_RE.test(scope)) throw new Error(`signActionToken: invalid scope "${scope}"`)
  if (!SAFE_RE.test(subject)) throw new Error(`signActionToken: invalid subject "${subject}"`)
  const secret = getSecret(secretEnv)
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const sig = computeSig(secret, exp, scope, subject)
  return `${TOKEN_VERSION}.${exp}.${scope}.${subject}.${sig}`
}

/**
 * Verify an action token. Returns true iff:
 *   - the token parses,
 *   - `exp` is in the future,
 *   - scope and subject match the expected values,
 *   - and the signature recomputes from the secret.
 *
 * Never throws.
 */
export function verifyActionToken(
  token: string | null | undefined,
  options: VerifyActionTokenOptions
): boolean {
  const { scope, subject, secretEnv = DEFAULT_SECRET_ENV } = options
  if (!token) return false
  const secret = process.env[secretEnv]
  if (!secret) return false

  const parts = token.split('.')
  if (parts.length !== 5) return false
  const [version, expStr, tokenScope, tokenSubject, sig] = parts
  if (version !== TOKEN_VERSION) return false
  if (tokenScope !== scope) return false
  if (tokenSubject !== subject) return false

  const exp = Number(expStr)
  if (!Number.isFinite(exp)) return false
  if (Math.floor(Date.now() / 1000) > exp) return false

  let expected: string
  try {
    expected = computeSig(secret, exp, tokenScope, tokenSubject)
  } catch {
    return false
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
