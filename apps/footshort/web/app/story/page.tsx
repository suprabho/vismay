'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFollowedStories, type StoryGroup } from '@/lib/useFollowedStories';
import { useSeenArticles } from '@/lib/useSeenArticles';

const STORY_DURATION_MS = 6000;
const HOLD_THRESHOLD_MS = 180;

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StoryViewer() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: groups, isLoading } = useFollowedStories();
  const { seen, markSeen } = useSeenArticles();

  const startParam = params.get('start');
  const initial = Math.max(0, Math.min(Number(startParam) || 0, (groups?.length ?? 1) - 1));

  const snapshotRef = useRef<Set<string>>(new Set());
  const snapshotEntityRef = useRef<number>(-1);

  const [entityIdx, setEntityIdx] = useState(initial);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const close = useCallback(() => router.back(), [router]);

  const group = groups?.[entityIdx];
  const story = group?.items[storyIdx];

  const nextUnseenIdx = (g: StoryGroup, from: number): number => {
    const snap = snapshotRef.current;
    for (let i = from + 1; i < g.items.length; i++) {
      const it = g.items[i];
      if (it && !snap.has(it.article_id)) return i;
    }
    return -1;
  };

  const prevUnseenIdx = (g: StoryGroup, from: number): number => {
    const snap = snapshotRef.current;
    for (let i = from - 1; i >= 0; i--) {
      const it = g.items[i];
      if (it && !snap.has(it.article_id)) return i;
    }
    return -1;
  };

  const goNext = useCallback(() => {
    if (!groups) return;
    const g = groups[entityIdx];
    if (!g) {
      close();
      return;
    }
    const next = nextUnseenIdx(g, storyIdx);
    if (next >= 0) setStoryIdx(next);
    else if (entityIdx + 1 < groups.length) setEntityIdx(entityIdx + 1);
    else close();
  }, [groups, entityIdx, storyIdx, close]);

  const goPrev = useCallback(() => {
    if (!groups) return;
    const g = groups[entityIdx];
    if (!g) return;
    const prev = prevUnseenIdx(g, storyIdx);
    if (prev >= 0) {
      setStoryIdx(prev);
      return;
    }
    if (entityIdx > 0) {
      const prevI = entityIdx - 1;
      const prevGroup = groups[prevI];
      if (!prevGroup) return;
      snapshotEntityRef.current = prevI;
      snapshotRef.current = new Set();
      setEntityIdx(prevI);
      setStoryIdx(Math.max(0, prevGroup.items.length - 1));
    }
  }, [groups, entityIdx, storyIdx]);

  // Re-snapshot + jump to first unseen on entity change
  useEffect(() => {
    if (!groups) return;
    const g = groups[entityIdx];
    if (!g) return;
    if (snapshotEntityRef.current === entityIdx) return;
    snapshotEntityRef.current = entityIdx;
    const snap = new Set(seen);
    const first = g.items.findIndex((it) => !snap.has(it.article_id));
    snapshotRef.current = first < 0 ? new Set() : snap;
    setStoryIdx(first >= 0 ? first : 0);
  }, [entityIdx, groups, seen]);

  // Mark current story seen
  useEffect(() => {
    if (story) markSeen(story.article_id);
  }, [story, markSeen]);

  // ESC to close, arrow keys to navigate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, goNext, goPrev]);

  const pressStartRef = useRef<number>(0);
  const onPressDown = () => {
    pressStartRef.current = Date.now();
    setPaused(true);
  };
  const onPressUp = (onTap: () => void) => {
    setPaused(false);
    const held = Date.now() - pressStartRef.current;
    if (held < HOLD_THRESHOLD_MS) onTap();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!groups || groups.length === 0 || !group || !story) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6">
        <p className="mb-4 text-lg text-text">No stories</p>
        <button type="button" onClick={close} className="text-accent">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      {story.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={story.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-black/30" />

      <button
        type="button"
        aria-label="Previous"
        onMouseDown={onPressDown}
        onMouseUp={() => onPressUp(goPrev)}
        onTouchStart={onPressDown}
        onTouchEnd={() => onPressUp(goPrev)}
        className="absolute inset-y-0 left-0 z-10 w-1/3"
      />
      <button
        type="button"
        aria-label="Next"
        onMouseDown={onPressDown}
        onMouseUp={() => onPressUp(goNext)}
        onTouchStart={onPressDown}
        onTouchEnd={() => onPressUp(goNext)}
        className="absolute inset-y-0 right-0 z-10 w-2/3"
      />

      <div className="relative z-20 flex flex-col px-2 pt-4">
        <div className="flex gap-1">
          {group.items.map((_, i) => (
            <ProgressBar
              key={`${entityIdx}-${storyIdx}-${i}`}
              state={i < storyIdx ? 'done' : i === storyIdx ? 'active' : 'pending'}
              paused={paused}
              onComplete={goNext}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center px-1">
          <div className="h-7 w-7 overflow-hidden rounded-full bg-white">
            {group.entity.crest_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.entity.crest_url} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <span className="ml-2 flex-1 truncate text-sm font-semibold text-text">
            {group.entity.name}
          </span>
          <span className="ml-2 text-xs text-text/70">{relativeTime(story.published_at)}</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="z-30 ml-3 text-xl text-text"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative z-20 mt-auto m-2 overflow-hidden rounded-xl bg-surface/70 px-4 pb-10 pt-8 backdrop-blur">
        <span className="mb-3 inline-block rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-text">
          {story.publisher}
        </span>
        <h1 className="mb-3 text-2xl font-bold leading-tight text-text">{story.headline}</h1>
        {story.summary ? (
          <p className="line-clamp-6 text-[15px] leading-[22px] text-text/90">{story.summary}</p>
        ) : null}
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
        >
          Read at source →
        </a>
      </div>
    </div>
  );
}

function ProgressBar({
  state,
  paused,
  onComplete,
}: {
  state: 'done' | 'active' | 'pending';
  paused: boolean;
  onComplete: () => void;
}) {
  return (
    <div className="h-[3px] flex-1 overflow-hidden rounded-sm bg-white/30">
      <div
        onAnimationEnd={state === 'active' ? onComplete : undefined}
        className="h-full w-full bg-white"
        style={{
          transformOrigin: 'left',
          transform:
            state === 'done' ? 'scaleX(1)' : state === 'pending' ? 'scaleX(0)' : undefined,
          animation:
            state === 'active'
              ? `story-progress ${STORY_DURATION_MS}ms linear forwards`
              : 'none',
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      }
    >
      <StoryViewer />
    </Suspense>
  );
}
