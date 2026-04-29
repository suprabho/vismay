'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthProvider';

export default function Index() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (session && !profile) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!profile?.onboarded_at) {
      router.replace('/onboarding/leagues');
      return;
    }
    router.replace('/feed');
  }, [loading, session, profile, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
