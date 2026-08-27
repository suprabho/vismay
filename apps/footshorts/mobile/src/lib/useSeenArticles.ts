import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { StoryItem } from './useFollowedStories';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: ReadonlySet<string> = new Set();

type SeenQueryKey = readonly ['seenArticles', string | null];
type SeenCardsKey = readonly ['seenShareCards', string | null];

export function useSeenArticles() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  const queryKey = useMemo<SeenQueryKey>(() => ['seenArticles', userId] as const, [userId]);

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      const since = new Date(Date.now() - WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from('article_views')
        .select('article_id')
        .gte('viewed_at', since);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.article_id as string));
    },
  });

  // Share-card views aren't persisted (no DB table); we track them in a
  // client-only cache so the rings grey out and the viewer skips seen cards
  // within a session. Disabled so no fetch ever runs (an in-flight fetch would
  // clobber an optimistic markCardSeen) — the set is built purely via setQueryData.
  const cardsKey = useMemo<SeenCardsKey>(() => ['seenShareCards', userId] as const, [userId]);
  const cardsQuery = useQuery({
    queryKey: cardsKey,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<Set<string>> => new Set<string>(),
  });

  const markSeen = useCallback(
    (articleId: string) => {
      if (!userId) return;
      const current = qc.getQueryData<Set<string>>(queryKey);
      if (current?.has(articleId)) return;

      qc.setQueryData<Set<string>>(queryKey, (prev) => {
        const next = new Set(prev ?? []);
        next.add(articleId);
        return next;
      });

      void supabase
        .from('article_views')
        .upsert(
          { user_id: userId, article_id: articleId },
          { onConflict: 'user_id,article_id', ignoreDuplicates: true }
        )
        .then(({ error }) => {
          if (error) console.warn('[markSeen]', error.message);
        });
    },
    [userId, qc, queryKey]
  );

  const markCardSeen = useCallback(
    (cardId: string) => {
      if (!userId) return;
      qc.setQueryData<Set<string>>(cardsKey, (prev) => {
        if (prev?.has(cardId)) return prev;
        const next = new Set(prev ?? []);
        next.add(cardId);
        return next;
      });
    },
    [userId, qc, cardsKey]
  );

  const seen = query.data ?? EMPTY;
  const seenCards = cardsQuery.data ?? EMPTY;

  const isStorySeen = useCallback(
    (it: StoryItem): boolean =>
      it.kind === 'card' ? seenCards.has(it.id) : seen.has(it.id),
    [seen, seenCards]
  );

  const markStorySeen = useCallback(
    (it: StoryItem) => {
      if (it.kind === 'card') markCardSeen(it.id);
      else markSeen(it.id);
    },
    [markCardSeen, markSeen]
  );

  return { seen, seenCards, markSeen, markCardSeen, isStorySeen, markStorySeen };
}
