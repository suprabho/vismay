'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { FeedCard } from '@shortfoot/shared/schemas';

const PAGE_SIZE = 20;

type Page = {
  items: FeedCard[];
  cursor: string | null;
};

function getSeenSet(qc: ReturnType<typeof useQueryClient>, userId: string | null): ReadonlySet<string> {
  return qc.getQueryData<Set<string>>(['seenArticles', userId]) ?? new Set();
}

export function useDiscoverFeed() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  return useInfiniteQuery<Page>({
    queryKey: ['feed', 'discover'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('articles')
        .select('id, headline, summary, image_url, publisher, url, published_at, cluster_id')
        .eq('status', 'summarized')
        .or('is_cluster_lead.eq.true,cluster_id.is.null')
        .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('published_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) query = query.lt('published_at', pageParam as string);

      const { data, error } = await query;
      if (error) throw error;
      const raw = (data ?? []).map((r) => ({ article_id: r.id, ...r })) as FeedCard[];

      const seen = getSeenSet(qc, userId);
      const items = raw.filter((r) => !seen.has(r.article_id));
      const cursor =
        raw.length < PAGE_SIZE ? null : (raw[raw.length - 1]?.published_at ?? null);
      return { items, cursor };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
}
