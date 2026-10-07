'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { X } from '@phosphor-icons/react'
import { AuthWidget, createSupabaseAuthClient } from '@vismay/ui'
import { ChequeredFlagMark } from '@vizf1/brand/logos'
import { useAuth } from '@/lib/AuthProvider'
import { supabaseAuth } from '@/lib/supabaseAuth'

// Map vizf1's brand tokens (hex `--color-*`) onto the shared widget's `--auth-*`
// variables, so the widget renders in VizF1's brand. Same map as /login.
export const AUTH_BRAND_STYLE = {
  '--auth-bg': 'transparent',
  '--auth-surface': 'var(--color-surface)',
  '--auth-fg': 'var(--color-text)',
  '--auth-muted': 'var(--color-muted)',
  '--auth-border': 'var(--color-border)',
  '--auth-accent': 'var(--color-accent)',
  '--auth-accent-fg': 'var(--color-accent-text)',
} as CSSProperties

type AuthModalContextValue = {
  /**
   * Require a signed-in user. If already authed, navigates to `next`
   * immediately; otherwise opens the sign-in modal and lands the user on `next`
   * once they sign in (onboarding first for brand-new accounts).
   */
  requireAuth: (next?: string) => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

/**
 * Port of Footshorts' AuthModalProvider. Anything that needs an account asks
 * for one in place — a modal over the current page — instead of bouncing the
 * visitor to /login or failing a write with "Not signed in".
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  // /embed/* pages (framed in sandboxed stories) have no account features and
  // can't use the auth client: see AuthProvider.
  const pathname = usePathname()
  if (pathname?.startsWith('/embed/')) return <AuthModalContext.Provider value={NO_MODAL}>{children}</AuthModalContext.Provider>
  return <LiveAuthModalProvider>{children}</LiveAuthModalProvider>
}

const NO_MODAL: AuthModalContextValue = { requireAuth: () => {} }

function LiveAuthModalProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  const router = useRouter()
  const [requested, setRequested] = useState(false)
  const [next, setNext] = useState<string | null>(null)
  // Read only inside the post-auth effect (never during render): marks that a
  // sign-in is in flight so we navigate exactly once when the profile lands.
  const navPendingRef = useRef(false)
  const authClient = useMemo(() => createSupabaseAuthClient(supabaseAuth()), [])

  const requireAuth = useCallback(
    (dest?: string) => {
      if (session) {
        if (dest) router.push(dest)
        return
      }
      setNext(dest ?? null)
      navPendingRef.current = true
      setRequested(true)
    },
    [session, router],
  )

  const close = useCallback(() => {
    setRequested(false)
    setNext(null)
    navPendingRef.current = false
  }, [])

  // Password sign-in resolves in-page: AuthWidget's onAuthed hides the modal,
  // then once the session + profile land this effect routes the user on
  // (onboarding first for new accounts). It only navigates — never setState.
  // Google OAuth never reaches here: it leaves the page and returns via
  // /auth/callback?next=…, with its destination encoded in `redirectTo` below.
  useEffect(() => {
    if (!session || !profile || !navPendingRef.current) return
    navPendingRef.current = false
    if (!profile.onboarded_at) {
      router.replace('/onboarding/drivers')
      return
    }
    if (next) router.push(next)
  }, [session, profile, next, router])

  // Close on Escape.
  useEffect(() => {
    if (!requested || session) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requested, session, close])

  // Visible only while a request is pending and the user isn't signed in.
  const open = requested && !session

  // Computed at render time so Google OAuth returns to the intended page —
  // or, with no explicit destination, to the page the modal opened over.
  const oauthRedirect =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          next ?? `${window.location.pathname}${window.location.search}`,
        )}`
      : undefined

  return (
    <AuthModalContext.Provider value={{ requireAuth }}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in"
        >
          <button
            type="button"
            aria-label="Close sign in"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 text-muted transition-colors hover:text-text"
            >
              <X size={18} weight="bold" />
            </button>
            <AuthWidget
              authClient={authClient}
              providers={['password', 'google']}
              allowSignup
              redirectTo={oauthRedirect}
              brand={{ name: 'VizF1', logo: <ChequeredFlagMark className="h-6 w-auto text-accent" /> }}
              copy={{ signupSubtitle: 'Create an account to follow drivers and teams.' }}
              onAuthed={() => setRequested(false)}
              style={AUTH_BRAND_STYLE}
            />
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  )
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error('useAuthModal must be used inside AuthModalProvider')
  return ctx
}
