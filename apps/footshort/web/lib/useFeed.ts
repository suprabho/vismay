'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { FeedCard, FeedCardEntity } from '@shortfoot/shared/schemas';

const PAGE_SIZE = 20;

type Page = {
  items: FeedCard[];
  cursor: string | null;
};

type ArticleRow = {
  id: string;
  headline: string;
  summary: string;
  image_url: string | null;
  publisher: string;
  url: string;
  published_at: string;
  cluster_id: string | null;
  article_entities:
    | Array<{ confidence: number | null; entity: FeedCardEntity | null }>
    | null;
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
        .select(
          `id, headline, summary, image_url, publisher, url, published_at, cluster_id,
           article_entities(confidence, entity:entities(id, type, slug, name, crest_url, league_slug, primary_color))`
        )
        .eq('status', 'summarized')
        .or('is_cluster_lead.eq.true,cluster_id.is.null')
        .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('published_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) query = query.lt('published_at', pageParam as string);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data as unknown as ArticleRow[]) ?? [];
      const raw: FeedCard[] = rows.map((r) => {
        const entities = (r.article_entities ?? [])
          .filter(
            (ae): ae is { confidence: number | null; entity: FeedCardEntity } =>
              !!ae.entity && (ae.entity.type === 'team' || ae.entity.type === 'league')
          )
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .map((ae) => ae.entity);
        return {
          article_id: r.id,
          headline: r.headline,
          summary: r.summary,
          image_url: r.image_url,
          publisher: r.publisher,
          url: r.url,
          published_at: r.published_at,
          cluster_id: r.cluster_id,
          entities,
        };
      });

      const seen = getSeenSet(qc, userId);
      const items = raw.filter((r) => !seen.has(r.article_id));
      const cursor =
        raw.length < PAGE_SIZE ? null : (raw[raw.length - 1]?.published_at ?? null);
      return { items, cursor };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
}
