import { cookies } from 'next/headers'
import crypto from 'crypto'

export interface AuthOptions {
  cookieName: string
  passwordEnv: string
  secretEnv: string
  cookieDomain?: string
  maxAgeSeconds?: number
}

export interface Auth {
  cookieName: string
  expectedToken(): string | null
  isAuthed(): Promise<boolean>
  setAuthCookie(): Promise<void>
  clearAuthCookie(): Promise<void>
  checkPassword(input: string): boolean
}

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30

/**
 * Temporary password gate. Replace internals with Supabase Auth later —
 * the returned interface stays stable so call sites don't change.
 *
 * Env reads happen at call time so platforms that change env between cold
 * starts (Vercel) still pick up the right values.
 */
export function createAuth(options: AuthOptions): Auth {
  const { cookieName, passwordEnv, secretEnv, cookieDomain, maxAgeSeconds = DEFAULT_MAX_AGE } = options

  function getSecret(): string {
    return process.env[secretEnv] || process.env[passwordEnv] || ''
  }

  function expectedToken(): string | null {
    const pw = process.env[passwordEnv]
    const secret = getSecret()
    if (!pw || !secret) return null
    return crypto.createHmac('sha256', secret).update(pw).digest('hex')
  }

  async function isAuthed(): Promise<boolean> {
    const expected = expectedToken()
    if (!expected) return false
    const jar = await cookies()
    const cookie = jar.get(cookieName)
    if (!cookie) return false
    const a = Buffer.from(cookie.value)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  async function setAuthCookie(): Promise<void> {
    const token = expectedToken()
    if (!token) throw new Error(`${passwordEnv} not set`)
    const jar = await cookies()
    jar.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: maxAgeSeconds,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    })
  }

  async function clearAuthCookie(): Promise<void> {
    const jar = await cookies()
    jar.delete(cookieName)
  }

  function checkPassword(input: string): boolean {
    const pw = process.env[passwordEnv]
    if (!pw) return false
    const a = Buffer.from(input)
    const b = Buffer.from(pw)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  return { cookieName, expectedToken, isAuthed, setAuthCookie, clearAuthCookie, checkPassword }
}
