/**
 * Per-demo password gate.
 *
 * Each row in `demos` carries its own password_hash. Sales rotates passwords
 * per prospect; the cookie is HMAC-signed with the password_hash itself
 * mixed in, so rotating the password naturally invalidates any outstanding
 * session cookie without a separate revocation step.
 *
 * Hashing: Node's built-in scrypt — no new dependency. Format mirrors
 * `scrypt$N$r$p$salt_b64$hash_b64` so the params are self-describing and
 * future tuning doesn't break existing rows.
 */

import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_PREFIX = 'vmy_demo_'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const SCRYPT_SALT_BYTES = 16

/* ─── Password hashing ──────────────────────────────────────────────── */

export function hashPassword(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: empty password')
  }
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], 'base64')
    expected = Buffer.from(parts[5], 'base64')
  } catch {
    return false
  }
  let candidate: Buffer
  try {
    candidate = crypto.scryptSync(plain, salt, expected.length, { N, r, p })
  } catch {
    return false
  }
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

/* ─── Cookie HMAC ───────────────────────────────────────────────────── */

function getServerSecret(): string {
  // Reuses ADMIN_SESSION_SECRET when present, with ADMIN_PASSWORD as a
  // fallback for local dev — same convention as adminAuth.ts.
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || ''
}

/**
 * The cookie value commits to (clientSlug, passwordHash). Mixing the hash
 * in means rotating the demo's password invalidates outstanding cookies
 * automatically — re-deriving with the new hash produces a different MAC.
 */
function expectedToken(clientSlug: string, passwordHash: string): string | null {
  const secret = getServerSecret()
  if (!secret) return null
  return crypto
    .createHmac('sha256', secret)
    .update(`${clientSlug}:${passwordHash}`)
    .digest('hex')
}

export function cookieName(clientSlug: string): string {
  // Cookie names allow [a-zA-Z0-9!#$%&'*+\-.^_`|~] — strip everything else
  // defensively, though our slug regex already constrains it.
  return COOKIE_PREFIX + clientSlug.replace(/[^a-zA-Z0-9_-]/g, '')
}

export async function isDemoAuthed(clientSlug: string, passwordHash: string): Promise<boolean> {
  const expected = expectedToken(clientSlug, passwordHash)
  if (!expected) return false
  const jar = await cookies()
  const cookie = jar.get(cookieName(clientSlug))
  if (!cookie) return false
  const a = Buffer.from(cookie.value)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function setDemoCookie(clientSlug: string, passwordHash: string): Promise<void> {
  const token = expectedToken(clientSlug, passwordHash)
  if (!token) throw new Error('demo cookie secret missing (ADMIN_SESSION_SECRET / ADMIN_PASSWORD)')
  const jar = await cookies()
  jar.set(cookieName(clientSlug), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export async function clearDemoCookie(clientSlug: string): Promise<void> {
  const jar = await cookies()
  jar.delete(cookieName(clientSlug))
}

/* ─── Rate limiter ──────────────────────────────────────────────────── */

const ATTEMPT_WINDOW_MS = 5 * 60 * 1000
const ATTEMPT_LIMIT = 5

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * Returns null if the request can proceed, or the number of seconds until
 * the bucket resets if blocked. Per-clientSlug bucket — sales is fine
 * sharing the same demo URL for testing without locking each other out
 * across clients.
 */
export function checkRateLimit(clientSlug: string): number | null {
  const now = Date.now()
  const key = clientSlug
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return null
  }
  if (bucket.count >= ATTEMPT_LIMIT) {
    return Math.ceil((bucket.resetAt - now) / 1000)
  }
  bucket.count += 1
  return null
}

export function resetRateLimit(clientSlug: string): void {
  buckets.delete(clientSlug)
}
