'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthProvider';
import { initAnalytics, setAnalyticsUser, trackSignedIn } from '@/lib/analytics';

/**
 * Boots Amplitude once on the client and keeps the Amplitude identity in sync
 * with the Supabase session. Rendered inside AuthProvider in the root layout,
 * so every route initializes analytics on first paint. `initAnalytics`
 * no-ops without an API key, so this is safe to mount unconditionally.
 *
 * Sign-ins are detected here (rather than at the individual auth call sites)
 * because web auth funnels through the shared `AuthWidget`, including the
 * Google OAuth redirect which never returns to a call site. The user-id
 * transition (none → some, or a different user) is the one reliable signal
 * that covers every method.
 */
export default function AmplitudeProvider() {
  const { session, loading } = useAuth();
  // Sentinel 'init' skips the restored-session case: an id already present on
  // the first settled render is a returning session, not a fresh sign-in.
  const lastUserIdRef = useRef<string | null | 'init'>('init');

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (loading) return;
    const userId = session?.user.id ?? null;
    setAnalyticsUser(userId);

    const last = lastUserIdRef.current;
    lastUserIdRef.current = userId;
    if (last === 'init' || userId === null || userId === last) return;

    const createdAt = session?.user.created_at ? Date.parse(session.user.created_at) : NaN;
    const method = session?.user.app_metadata?.provider as
      | 'password'
      | 'google'
      | 'apple'
      | 'email'
      | undefined;
    trackSignedIn({
      method: method === 'email' ? 'password' : method,
      // Freshly created account ⇒ this sign-in is also the sign-up.
      is_new_user: Number.isFinite(createdAt) ? Date.now() - createdAt < 5 * 60_000 : undefined,
    });
  }, [session, loading]);

  return null;
}
