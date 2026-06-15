'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { FeedCard } from '@/components/FeedCard';
import { ForYouMatchFeed } from '@/components/ForYouMatchFeed';
import { StoryRings } from '@/components/StoryRings';
import { EditorialMagazine } from '@/components/EditorialMagazine';
import { useAuth } from '@/lib/AuthProvider';
import { useAuthModal } from '@/lib/AuthModalProvider';
import { useDiscoverFeed } from '@/lib/useFeed';
import { useSeenArticles } from '@/lib/useSeenArticles';

type Tab = 'forYou' | 'discover' | 'editorial';

const TABS: Tab[] = ['forYou', 'discover', 'editorial'];
const isTab = (v: string | null): v is Tab => !!v && (TABS as string[]).includes(v);

// Tabs that require a signed-in user; Discover is public.
const GATED_TABS: Tab[] = ['forYou', 'editorial'];

const FEED_HEIGHT = 'h-[calc(100dvh-148px)] md:h-[calc(100dvh-104px)]';

function PillTabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'forYou', label: 'For you' },
    { key: 'discover', label: 'Discover' },
    { key: 'editorial', label: 'Editorial' },
  ];
  return (
    <div className="mx-auto mb-2 inline-flex rounded-full border border-border bg-surface/60 p-1">
      {tabs.map((t) => {
        const selected = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selected ? 'bg-accent text-bg font-semibold' : 'text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function DiscoverStack() {
  const discover = useDiscoverFeed();
  const { markSeen } = useSeenArticles();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            discover.hasNextPage &&
            !discover.isFetchingNextPage
          ) {
            discover.fetchNextPage();
          }
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [discover]);

  const items = discover.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (
      items.length === 0 &&
      discover.hasNextPage &&
      !discover.isFetchingNextPage &&
      !discover.isLoading
    ) {
      discover.fetchNextPage();
    }
  }, [items.length, discover]);

  if (discover.isLoading) {
    return (
      <div className={`${FEED_HEIGHT} flex items-center justify-center`}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (discover.error) {
    return (
      <div
        className={`${FEED_HEIGHT} flex flex-col items-center justify-center px-4 text-center`}
      >
        <p className="mb-2 text-lg text-text">Could not load</p>
        <p className="text-sm text-muted">{(discover.error as Error).message}</p>
      </div>
    );
  }

  if (items.length === 0 && !discover.hasNextPage) {
    return (
      <div
        className={`${FEED_HEIGHT} flex flex-col items-center justify-center px-4 text-center`}
      >
        <p className="mb-2 text-lg text-text">Nothing here yet</p>
        <p className="text-sm text-muted">No recent stories yet. Check back soon.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`${FEED_HEIGHT} flex items-center justify-center`}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className={`${FEED_HEIGHT} snap-y snap-mandatory overflow-y-auto overscroll-contain`}
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map((item) => (
        <div key={item.article_id} className={`${FEED_HEIGHT} snap-start`}>
          <div className="h-full">
            <FeedCard
              articleId={item.article_id}
              headline={item.headline}
              summary={item.summary}
              imageUrl={item.image_url}
              publisher={item.publisher}
              url={item.url}
              publishedAt={item.published_at}
              entities={item.entities}
              onSeen={markSeen}
            />
          </div>
        </div>
      ))}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {discover.isFetchingNextPage ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : null}
    </div>
  );
}

function FeedPageInner() {
  const { session } = useAuth();
  const { requireAuth } = useAuthModal();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  // The active tab is derived, not synced via effects: a tab the user picked
  // wins; otherwise an explicit `?tab=` (e.g. returning from OAuth, or carried
  // back after a modal sign-in) wins; otherwise logged-out visitors default to
  // Discover (the public tab) and signed-in users to For You.
  const [picked, setPicked] = useState<Tab | null>(isTab(tabParam) ? tabParam : null);
  const tab: Tab = picked ?? (isTab(tabParam) ? tabParam : session ? 'forYou' : 'discover');

  function handleTab(next: Tab) {
    if (GATED_TABS.includes(next) && !session) {
      requireAuth(`/feed?tab=${next}`);
      return;
    }
    setPicked(next);
  }

  const letter = (session?.user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <main className="mx-auto max-w-2xl px-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-center bg-bg/80 px-4 py-1 backdrop-blur">
        <Link
          href="/feed"
          className="absolute left-4 top-1/2 -translate-y-1/2 md:hidden"
          aria-label="Footshorts"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-[24%]" />
        </Link>
        <PillTabs active={tab} onChange={handleTab} />
        {session ? (
          <Link
            href="/profile"
            className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-text hover:border-muted md:hidden"
            aria-label="Profile"
          >
            {letter}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => requireAuth('/profile')}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-muted md:hidden"
          >
            Sign in
          </button>
        )}
      </div>
      {tab === 'forYou' && (
        <>
          <StoryRings />
          <ForYouMatchFeed />
        </>
      )}
      {tab === 'discover' && <DiscoverStack />}
      {tab === 'editorial' && (
        // Scroll the magazine in its own region below the pill bar — same as
        // DiscoverStack. Body-scrolling it instead let the translucent sticky
        // header overlap (and swallow clicks on) the topmost Epics strip.
        <div className={`${FEED_HEIGHT} overflow-y-auto overscroll-contain`} style={{ scrollbarWidth: 'none' }}>
          <EditorialMagazine />
        </div>
      )}
    </main>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedPageInner />
    </Suspense>
  );
}
