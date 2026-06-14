'use client';

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
} from 'react';
import { useRouter } from 'next/navigation';
import { AuthWidget, createSupabaseAuthClient } from '@vismay/ui';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';

// Map footshorts' brand tokens (--sf-color-* are RGB channel triples) onto the
// widget's --auth-* variables, so the shared widget renders in Footshorts' brand.
const BRAND_STYLE = {
  '--auth-bg': 'transparent',
  '--auth-surface': 'rgb(var(--sf-color-surface))',
  '--auth-fg': 'rgb(var(--sf-color-text))',
  '--auth-muted': 'rgb(var(--sf-color-muted))',
  '--auth-border': 'rgb(var(--sf-color-border))',
  '--auth-accent': 'rgb(var(--sf-color-accent))',
  '--auth-accent-fg': 'rgb(var(--sf-color-accentText))',
} as CSSProperties;

type AuthModalContextValue = {
  /**
   * Require a signed-in user. If already authed, navigates to `next`
   * immediately; otherwise opens the OAuth modal and lands the user on `next`
   * once they sign in.
   */
  requireAuth: (next?: string) => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const router = useRouter();
  const [requested, setRequested] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  // Read only inside the post-auth effect (never during render): marks that a
  // sign-in is in flight so we navigate exactly once when the profile lands.
  const navPendingRef = useRef(false);
  const authClient = useMemo(() => createSupabaseAuthClient(supabase), []);

  const requireAuth = useCallback(
    (dest?: string) => {
      if (session) {
        if (dest) router.push(dest);
        return;
      }
      setNext(dest ?? null);
      navPendingRef.current = true;
      setRequested(true);
    },
    [session, router]
  );

  const close = useCallback(() => {
    setRequested(false);
    setNext(null);
    navPendingRef.current = false;
  }, []);

  // Password sign-in resolves in-page: AuthWidget's onAuthed hides the modal,
  // then once the session + profile land this effect routes the user on
  // (onboarding first for new accounts). It only navigates — never setState.
  // Google OAuth never reaches here: it leaves the page and returns via
  // /auth/callback?next=…, with its destination encoded in `redirectTo` below.
  useEffect(() => {
    if (!session || !profile || !navPendingRef.current) return;
    navPendingRef.current = false;
    if (!profile.onboarded_at) {
      router.replace('/onboarding/leagues');
      return;
    }
    if (next) router.push(next);
  }, [session, profile, next, router]);

  // Close on Escape.
  useEffect(() => {
    if (!requested || session) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requested, session, close]);

  // Visible only while a request is pending and the user isn't signed in.
  const open = requested && !session;

  // Computed at render time so Google OAuth returns to the intended page.
  const oauthRedirect =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ''
        }`
      : undefined;

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
              ✕
            </button>
            <AuthWidget
              authClient={authClient}
              providers={['password', 'google']}
              allowSignup
              redirectTo={oauthRedirect}
              brand={{ name: 'Footshorts' }}
              copy={{ signupSubtitle: 'Create an account to follow teams.' }}
              onAuthed={() => setRequested(false)}
              style={BRAND_STYLE}
            />
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used inside AuthModalProvider');
  return ctx;
}
