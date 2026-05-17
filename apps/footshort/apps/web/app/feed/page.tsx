'use client';

import { useEffect, useRef, useState } from 'react';
import { FeedCard } from '@/components/FeedCard';
import { ForYouMatchFeed } from '@/components/ForYouMatchFeed';
import { StoryRings } from '@/components/StoryRings';
import { useDiscoverFeed } from '@/lib/useFeed';
import { useSeenArticles } from '@/lib/useSeenArticles';

type Tab = 'forYou' | 'discover';

const FEED_HEIGHT = 'h-[calc(100dvh-168px)] md:h-[calc(100dvh-104px)]';

function PillTabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'forYou', label: 'For you' },
    { key: 'discover', label: 'Discover' },
  ];
  return (
    <div className="mx-auto mb-4 inline-flex rounded-full border border-border bg-surface/60 p-1">
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
          <div className="h-full px-3">
            <FeedCard
              articleId={item.article_id}
              headline={item.headline}
              summary={item.summary}
              imageUrl={item.image_url}
              publisher={item.publisher}
              url={item.url}
              publishedAt={item.published_at}
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

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>('forYou');

  return (
    <main className="mx-auto max-w-2xl px-4 pb-6">
      <div className="sticky top-[64px] z-10 -mx-4 flex justify-center bg-bg/80 px-4 pt-6 backdrop-blur md:top-0">
        <PillTabs active={tab} onChange={setTab} />
      </div>
      {tab === 'forYou' ? (
        <>
          <StoryRings />
          <ForYouMatchFeed />
        </>
      ) : (
        <DiscoverStack />
      )}
    </main>
  );
}
