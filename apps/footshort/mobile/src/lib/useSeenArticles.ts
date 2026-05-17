import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: ReadonlySet<string> = new Set();

type SeenQueryKey = readonly ['seenArticles', string | null];

export function useSeenArticles() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  const queryKey: SeenQueryKey = ['seenArticles', userId];

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

  return { seen: query.data ?? EMPTY, markSeen };
}
