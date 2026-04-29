'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';
import { useFollows } from '@/lib/useFollows';

export default function ProfilePage() {
  const { session, signOut } = useAuth();
  const { data: follows } = useFollows();
  const email = session?.user?.email;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-text">Profile</h1>
      <p className="mb-8 text-sm text-muted">{email ?? 'Not signed in'}</p>

      <Link
        href="/following"
        className="mb-3 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-muted"
      >
        <span className="font-medium text-text">Following</span>
        <span className="text-sm text-muted">{follows?.length ?? 0} →</span>
      </Link>

      <Link
        href="/admin"
        className="mb-3 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-muted"
      >
        <span className="font-medium text-text">Pipeline stats</span>
        <span className="text-sm text-muted">→</span>
      </Link>

      <button
        type="button"
        onClick={signOut}
        className="mt-4 w-full rounded-lg border border-border bg-surface py-3 font-medium text-text hover:border-muted"
      >
        Sign out
      </button>
    </main>
  );
}
