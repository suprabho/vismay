'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthProvider';

export default function Index() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (!profile) return;
    if (!profile.onboarded_at) {
      router.replace('/onboarding/leagues');
      return;
    }
    router.replace('/feed');
  }, [loading, session, profile, router]);

  if (loading || session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">
          Short<span className="text-accent">Foot</span>
        </span>
        <Link
          href="/login"
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:border-muted"
        >
          Log in
        </Link>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-16 text-center sm:pt-24">
        <span className="mb-6 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          Football, distilled
        </span>

        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Every match, every headline —{' '}
          <span className="text-accent">in shorts.</span>
        </h1>

        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
          Follow your clubs and leagues, skim AI-summarized news, and catch up on
          fixtures and standings in seconds.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-bg sm:w-auto"
          >
            Log in to continue
          </Link>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium text-text hover:border-muted sm:w-auto"
          >
            Create an account
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
        <Feature
          title="Follow what matters"
          body="Pick your leagues and clubs. We keep the feed focused on them — no noise."
        />
        <Feature
          title="Shorter than a halftime"
          body="Headlines summarized into bite-sized briefs you can read between trains."
        />
        <Feature
          title="Fixtures & form"
          body="Upcoming matches, recent results, and league standings all in one place."
        />
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs text-muted">
          <span>© ShortFoot</span>
          <Link href="/login" className="hover:text-text">
            Log in
          </Link>
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}
