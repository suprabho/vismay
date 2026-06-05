'use client'

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { AuthClient, AuthProvider } from './client'

/**
 * Shared, brandable auth widget — sign in / sign up / Google OAuth / magic-link.
 *
 * Used by both the consumer apps and admin. It is purely presentational: auth
 * behavior is injected via {@link AuthClient} (see `./client`), and *all*
 * styling resolves from `--auth-*` CSS custom properties so the widget adopts
 * each app's brand without depending on its Tailwind version or token names.
 *
 * Brandable variables (set any subset on a parent element or via `style`):
 *   --auth-bg, --auth-surface, --auth-fg, --auth-muted, --auth-border,
 *   --auth-accent, --auth-accent-fg, --auth-radius, --auth-font
 * Sensible dark-theme defaults apply when unset.
 */

export interface AuthWidgetBrand {
  name: string
  /** Optional logo node rendered before the name (SVG, <img>, etc.). */
  logo?: ReactNode
}

export interface AuthWidgetCopy {
  signinTitle?: string
  signinSubtitle?: string
  signupTitle?: string
  signupSubtitle?: string
}

export interface AuthWidgetProps {
  authClient: AuthClient
  /** Methods to offer, in display order. Default `['password']`. */
  providers?: AuthProvider[]
  /** Show the sign-up toggle (password only). Default `true`. */
  allowSignup?: boolean
  /** Where OAuth / magic-link return to. Default `${origin}/auth/callback`. */
  redirectTo?: string
  brand?: AuthWidgetBrand
  copy?: AuthWidgetCopy
  /** Called after a successful password sign-in / sign-up (caller redirects). */
  onAuthed?: () => void
  className?: string
  /** Override `--auth-*` variables, e.g. `{ ['--auth-accent']: '#16a34a' }`. */
  style?: CSSProperties
}

const CSS = `
.vmy-auth {
  --_surface: var(--auth-surface, rgba(255,255,255,0.05));
  --_fg: var(--auth-fg, #ededed);
  --_muted: var(--auth-muted, #a1a1a1);
  --_border: var(--auth-border, rgba(255,255,255,0.12));
  --_accent: var(--auth-accent, #ffffff);
  --_accent-fg: var(--auth-accent-fg, #0a0a0a);
  --_radius: var(--auth-radius, 10px);
  width: 100%; max-width: 360px; color: var(--_fg);
  font-family: var(--auth-font, inherit); background: var(--auth-bg, transparent);
}
.vmy-auth *, .vmy-auth *::before, .vmy-auth *::after { box-sizing: border-box; }
.vmy-auth__brand { display: flex; align-items: center; gap: 10px; margin-bottom: 1.25rem; }
.vmy-auth__brand-name { font-size: 1.05rem; font-weight: 700; }
.vmy-auth__title { font-size: 1.25rem; font-weight: 600; margin: 0; }
.vmy-auth__subtitle { font-size: .875rem; color: var(--_muted); margin: .25rem 0 0; }
.vmy-auth__field {
  width: 100%; display: block; margin-top: .75rem; background: var(--_surface);
  border: 1px solid var(--_border); border-radius: var(--_radius);
  padding: 12px 16px; color: var(--_fg); font-size: 16px; line-height: 1.2; outline: none;
}
.vmy-auth__field::placeholder { color: var(--_muted); }
.vmy-auth__field:focus { border-color: var(--_accent); }
.vmy-auth__btn {
  width: 100%; margin-top: .75rem; border-radius: var(--_radius); padding: 12px 16px;
  font-weight: 600; font-size: .95rem; cursor: pointer; border: 1px solid transparent;
}
.vmy-auth__btn:disabled { opacity: .5; cursor: default; }
.vmy-auth__btn--primary { background: var(--_accent); color: var(--_accent-fg); }
.vmy-auth__btn--secondary {
  background: var(--_surface); color: var(--_fg); border-color: var(--_border);
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.vmy-auth__error { color: #f87171; font-size: .875rem; margin-top: .75rem; }
.vmy-auth__note { font-size: .9rem; color: var(--_muted); margin-top: .75rem; }
.vmy-auth__divider {
  display: flex; align-items: center; gap: 12px; margin: 1rem 0 .25rem;
  color: var(--_muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em;
}
.vmy-auth__divider::before, .vmy-auth__divider::after {
  content: ''; flex: 1; height: 1px; background: var(--_border);
}
.vmy-auth__toggle {
  margin-top: 1rem; width: 100%; background: none; border: none; cursor: pointer;
  color: var(--_muted); font-size: .875rem; text-align: center;
}
.vmy-auth__toggle:hover { color: var(--_fg); }
`

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export function AuthWidget({
  authClient,
  providers = ['password'],
  allowSignup = true,
  redirectTo,
  brand,
  copy,
  onAuthed,
  className,
  style,
}: AuthWidgetProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)

  const hasPassword = providers.includes('password')
  const hasGoogle = providers.includes('google')
  const hasMagic = providers.includes('magic')
  const canSignup = allowSignup && hasPassword

  const resolvedRedirect =
    redirectTo ??
    (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback')

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    if (!hasPassword || pending) return
    setError(null)
    setPending(true)
    const fn = mode === 'signin' ? authClient.signInWithPassword : authClient.signUp
    const { error: err } = await fn(email.trim(), password)
    setPending(false)
    if (err) setError(err)
    else onAuthed?.()
  }

  async function googleSignIn() {
    setError(null)
    setPending(true)
    const { error: err } = await authClient.signInWithOAuth('google', resolvedRedirect)
    // On success the browser navigates to Google; we only land here on failure.
    if (err) {
      setError(err)
      setPending(false)
    }
  }

  async function magicLink() {
    const target = email.trim()
    if (!target) {
      setError('Enter your email first.')
      return
    }
    setError(null)
    setPending(true)
    const { error: err } = await authClient.signInWithOtp(target, resolvedRedirect)
    setPending(false)
    if (err) setError(err)
    else setOtpSent(true)
  }

  const title =
    mode === 'signin'
      ? copy?.signinTitle ?? 'Sign in'
      : copy?.signupTitle ?? 'Create account'
  const subtitle =
    mode === 'signin'
      ? copy?.signinSubtitle ?? (brand ? `Sign in to ${brand.name}.` : undefined)
      : copy?.signupSubtitle ?? 'Sign up to get started.'

  return (
    <div className={className ? `vmy-auth ${className}` : 'vmy-auth'} style={style}>
      <style>{CSS}</style>

      {brand && (
        <div className="vmy-auth__brand">
          {brand.logo}
          <span className="vmy-auth__brand-name">{brand.name}</span>
        </div>
      )}

      <h1 className="vmy-auth__title">{title}</h1>
      {subtitle && <p className="vmy-auth__subtitle">{subtitle}</p>}

      {otpSent ? (
        <p className="vmy-auth__note">
          Check <strong>{email.trim()}</strong> for a sign-in link.
        </p>
      ) : (
        <>
          <form onSubmit={submitPassword}>
            {(hasPassword || hasMagic) && (
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                className="vmy-auth__field"
              />
            )}
            {hasPassword && (
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="vmy-auth__field"
              />
            )}
            {error && <p className="vmy-auth__error">{error}</p>}
            {hasPassword && (
              <button
                type="submit"
                disabled={pending || !email || !password}
                className="vmy-auth__btn vmy-auth__btn--primary"
              >
                {pending ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            )}
          </form>

          {(hasGoogle || hasMagic) && hasPassword && <div className="vmy-auth__divider">or</div>}

          {hasGoogle && (
            <button
              type="button"
              onClick={googleSignIn}
              disabled={pending}
              className="vmy-auth__btn vmy-auth__btn--secondary"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          )}

          {hasMagic && (
            <button
              type="button"
              onClick={magicLink}
              disabled={pending || !email}
              className="vmy-auth__btn vmy-auth__btn--secondary"
            >
              Email me a magic link
            </button>
          )}

          {!hasPassword && error && <p className="vmy-auth__error">{error}</p>}

          {canSignup && (
            <button
              type="button"
              className="vmy-auth__toggle"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
