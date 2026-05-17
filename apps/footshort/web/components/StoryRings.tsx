'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useFollowedStories } from '@/lib/useFollowedStories';
import { useSeenArticles } from '@/lib/useSeenArticles';

const RING_UNREAD = '#00D26A';
const RING_SEEN = '#2a2a30';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function StoryRings() {
  const { data: groups } = useFollowedStories();
  const { seen } = useSeenArticles();

  const ordered = useMemo(() => {
    if (!groups) return [];
    const withIdx = groups.map((g, originalIndex) => ({
      g,
      originalIndex,
      allSeen: g.items.every((it) => seen.has(it.article_id)),
    }));
    return [...withIdx.filter((x) => !x.allSeen), ...withIdx.filter((x) => x.allSeen)];
  }, [groups, seen]);

  if (ordered.length === 0) return null;

  return (
    <div className="-mx-4 mb-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {ordered.map(({ g, originalIndex, allSeen }) => (
        <Link
          key={g.entity.id}
          href={`/story?start=${originalIndex}`}
          className="flex w-[72px] shrink-0 flex-col items-center"
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full p-[2px]"
            style={{ backgroundColor: allSeen ? RING_SEEN : RING_UNREAD }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-bg p-[2px]">
              <div
                className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface"
                style={{ opacity: allSeen ? 0.55 : 1 }}
              >
                {g.entity.crest_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.entity.crest_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-text">
                    {initialsOf(g.entity.name)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span
            className="mt-1 max-w-[72px] truncate text-[11px] text-muted"
            style={{ opacity: allSeen ? 0.6 : 1 }}
          >
            {g.entity.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
