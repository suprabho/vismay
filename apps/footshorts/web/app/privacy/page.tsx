import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Footshorts',
  description: 'What Footshorts collects, how it is processed, and how to delete your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg font-sans text-text">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-icon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-lg font-bold">Footshorts</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Effective July 2026</p>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">What we collect</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>
              <span className="text-text">Account email</span> — used to sign you in. If you sign
              in with Apple and share your name, we may store it as your display name.
            </li>
            <li>
              <span className="text-text">Follows</span> — the teams, leagues and players you
              choose to follow, so we can build your feed.
            </li>
            <li>
              <span className="text-text">Article views</span> — which stories you have seen, so we
              don&apos;t show them again. These are automatically deleted after 30 days.
            </li>
            <li>
              <span className="text-text">Theme preference</span> — stored on your device or in
              your browser, never on our servers.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">How it&apos;s processed</h2>
          <p className="text-sm leading-relaxed text-muted">
            Your data is stored and processed by Supabase (authentication and database). The web
            app uses Vercel Analytics for anonymous usage metrics. We do not sell your data and we
            do not show ads.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Deleting your data</h2>
          <p className="text-sm leading-relaxed text-muted">
            You can permanently delete your account and all associated data at any time from
            Profile → Delete account, in the app or on the web. You can also email us and we will
            delete it for you.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-sm leading-relaxed text-muted">
            Questions about this policy:{' '}
            <a href="mailto:hello@promad.design" className="text-accent hover:underline">
              hello@promad.design
            </a>
          </p>
        </section>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 text-xs text-muted">
          <span>© 2026 Footshorts</span>
          <Link href="/" className="hover:text-text">
            footshorts.com
          </Link>
        </div>
      </footer>
    </main>
  );
}
