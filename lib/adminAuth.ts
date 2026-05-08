import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * Temporary password gate for /admin. Replace with Supabase Auth in phase 6.
 *
 * How it works: `ADMIN_PASSWORD` env var is the shared secret. On successful
 * login we set a cookie containing hmac(password, server-secret). Subsequent
 * requests compare the cookie against the expected hmac.
 *
 * This is NOT production-grade — one shared password, no rate limiting, no
 * rotation. Enough to keep drive-by visitors out until real auth lands.
 */

const COOKIE_NAME = 'vmy_admin'

function getSecret(): string {
  // ADMIN_SESSION_SECRET rotates sessions on deploy. Falls back to the
  // password itself so a single env var works for local dev. `||` (not `??`)
  // so an empty-string value — which is what GitHub Actions assigns when a
  // referenced secret doesn't exist — also triggers the fallback.
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || ''
}

export function expectedToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD
  const secret = getSecret()
  if (!pw || !secret) return null
  return crypto.createHmac('sha256', secret).update(pw).digest('hex')
}

export async function isAuthed(): Promise<boolean> {
  const expected = expectedToken()
  if (!expected) return false
  const jar = await cookies()
  const cookie = jar.get(COOKIE_NAME)
  if (!cookie) return false
  // Timing-safe compare.
  const a = Buffer.from(cookie.value)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function setAuthCookie() {
  const token = expectedToken()
  if (!token) throw new Error('ADMIN_PASSWORD not set')
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function clearAuthCookie() {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) return false
  const a = Buffer.from(input)
  const b = Buffer.from(pw)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME
