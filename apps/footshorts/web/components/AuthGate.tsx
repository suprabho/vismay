'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthProvider';
import { useAuthModal } from '@/lib/AuthModalProvider';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { requireAuth } = useAuthModal();
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    if (!loading && !session) requireAuth(pathname);
  }, [loading, session, pathname, requireAuth]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg text-text">Sign in to continue</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => requireAuth(pathname)}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
          >
            Sign in
          </button>
          <Link
            href="/feed"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-text hover:border-muted"
          >
            Browse stories
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
