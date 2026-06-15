'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthProvider';

/**
 * Root route is a thin redirector — users land straight in the app rather than
 * on a marketing page. The marketing/landing content now lives at /about-us.
 *
 * - Logged-out visitors → /feed, which defaults to the public Discover tab.
 * - Signed-in, not-yet-onboarded → /onboarding/leagues.
 * - Signed-in, onboarded → /feed?tab=discover (Discover is the default landing
 *   for everyone; For You is one tap away).
 */
export default function Index() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (session && profile && !profile.onboarded_at) {
      router.replace('/onboarding/leagues');
      return;
    }
    router.replace('/feed?tab=discover');
  }, [loading, session, profile, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
