'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@footshorts/brand/web';
import type { ThemeName } from '@footshorts/brand';
import { useAuth } from '@/lib/AuthProvider';
import { useFollows } from '@/lib/useFollows';

const THEME_OPTIONS: { name: ThemeName; label: string }[] = [
  { name: 'classic', label: 'Classic' },
  { name: 'pitch', label: 'Pitch' },
  { name: 'terrace', label: 'Terrace' },
];

export default function ProfilePage() {
  const { session, signOut } = useAuth();
  const { data: follows } = useFollows();
  const { themeName, setTheme } = useTheme();
  const router = useRouter();
  const email = session?.user?.email;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text hover:border-muted md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-5 w-5"
        >
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
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
    </main>
  );
}
