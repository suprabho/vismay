'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTheme } from '@footshorts/brand/web';
import type { ThemeName } from '@footshorts/brand';
import { BackButton } from '@/components/BackButton';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useFollows } from '@/lib/useFollows';

const THEME_OPTIONS: { name: ThemeName; label: string }[] = [
  { name: 'classic', label: 'Classic' },
  { name: 'pitch', label: 'Pitch' },
  { name: 'terrace', label: 'Terrace' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: follows } = useFollows();
  const { themeName, setTheme } = useTheme();
  const email = session?.user?.email;
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Play's Data Safety form requires a web-accessible deletion path; the
  // mobile app has the same flow (Profile → Delete account).
  async function deleteAccount() {
    if (
      !window.confirm(
        'Permanently delete your account, follows and reading history? This cannot be undone.',
      )
    ) {
      return;
    }
    setDeleteError(null);
    const { error } = await supabase.rpc('delete_account');
    if (error) {
      setDeleteError(error.message);
      return;
    }
    // Server-side sessions are cascade-deleted with the user; only clear local state.
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/');
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <BackButton className="mb-4" />
      <h1 className="mb-1 text-2xl font-bold text-text">Profile</h1>
      <p className="mb-8 text-sm text-muted">{email ?? 'Not signed in'}</p>

      <Link
        href="/following"
        className="mb-3 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-muted"
      >
        <span className="font-medium text-text">Following</span>
        <span className="text-sm text-muted">{follows?.length ?? 0} →</span>
      </Link>

      <div className="mb-3 rounded-lg border border-border bg-surface px-4 py-3">
        <p className="mb-2 text-sm font-medium text-text">Theme</p>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => {
            const active = opt.name === themeName;
            return (
              <button
                key={opt.name}
                type="button"
                onClick={() => setTheme(opt.name)}
                className={
                  active
                    ? 'flex-1 rounded-md border border-accent bg-accent py-2 text-sm font-medium text-accent-text'
                    : 'flex-1 rounded-md border border-border bg-bg py-2 text-sm font-medium text-text hover:border-muted'
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={signOut}
        className="mt-4 w-full rounded-lg border border-border bg-surface py-3 font-medium text-text hover:border-muted"
      >
        Sign out
      </button>

      {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
      <button
        type="button"
        onClick={deleteAccount}
        className="mt-3 w-full rounded-lg border border-red-500/40 py-3 font-medium text-red-400 hover:border-red-500"
      >
        Delete account
      </button>

      <Link href="/privacy" className="mt-6 block text-center text-xs text-muted hover:text-text">
        Privacy policy
      </Link>
    </main>
  );
}
