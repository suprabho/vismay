'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';

export function AppHeader() {
  const { session } = useAuth();
  const letter = (session?.user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/feed" className="text-lg font-bold text-text">
          ShortFoot
        </Link>
        <Link
          href="/profile"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-text hover:border-muted"
          aria-label="Profile"
        >
          {letter}
        </Link>
      </div>
    </header>
  );
}
