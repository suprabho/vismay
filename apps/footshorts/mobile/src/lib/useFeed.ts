import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { FeedCard, FeedCardEntity } from '@footshorts/shared/schemas';

const PAGE_SIZE = 20;

// Columns the FeedCard placeholder cares about — team/league crests + colors.
const ENTITY_COLS = 'id, type, slug, name, crest_url, league_slug, primary_color';

type Page = {
  items: FeedCard[];
  // Cursor derived from the raw (pre-filter) last row so pagination stops
  // only when the DB actually has no more rows, not just because the page
  // was heavily filtered by the seen-set.
  cursor: string | null;
};

type ArticleEntityJoin = { confidence: number | null; entity: FeedCardEntity | null };

// Keep only team/league entities (those carry crests + brand colors) and order
// by Gemini confidence so the placeholder picks the most relevant crests first.
function pickCardEntities(joins: ArticleEntityJoin[] | null | undefined): FeedCardEntity[] {
  return (joins ?? [])
    .filter(
      (ae): ae is { confidence: number | null; entity: FeedCardEntity } =>
        !!ae.entity && (ae.entity.type === 'team' || ae.entity.type === 'league')
    )
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map((ae) => ae.entity);
}

function getSeenSet(qc: ReturnType<typeof useQueryClient>, userId: string | null): ReadonlySet<string> {
  return qc.getQueryData<Set<string>>(['seenArticles', userId]) ?? new Set();
}

/**
 * Fetch card entities for a set of articles, grouped by article_id. Used by the
 * personalized feed, which reads the `user_feed` view — a view PostgREST can't
 * embed relations through, so we resolve entities in a second round-trip.
 */
async function fetchEntitiesByArticle(articleIds: string[]): Promise<Map<string, FeedCardEntity[]>> {
  const result = new Map<string, FeedCardEntity[]>();
  if (articleIds.length === 0) return result;

  const { data, error } = await supabase
    .from('article_entities')
    .select(`article_id, confidence, entity:entities(${ENTITY_COLS})`)
    .in('article_id', articleIds);
  if (error) throw error;

  const rows =
    (data as unknown as Array<{ article_id: string } & ArticleEntityJoin>) ?? [];
  const grouped = new Map<string, ArticleEntityJoin[]>();
  for (const r of rows) {
    const arr = grouped.get(r.article_id) ?? [];
    arr.push({ confidence: r.confidence, entity: r.entity });
    grouped.set(r.article_id, arr);
  }
  for (const [id, joins] of grouped) result.set(id, pickCardEntities(joins));
  return result;
}

/**
 * Personalized feed for the current user, filtered against the seen snapshot
 * at query time. Items marked seen during the session are NOT removed from
 * already-fetched pages; they only disappear on the next refetch.
 */
export function useFeed() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  return useInfiniteQuery<Page>({
    queryKey: ['feed', userId],
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!userId) return { items: [], cursor: null };
      let query = supabase
        .from('user_feed')
        .select('*')
        .eq('user_id', userId)
        .order('published_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) query = query.lt('published_at', pageParam as string);

      const { data, error } = await query;
      if (error) throw error;
      const raw = (data ?? []) as FeedCard[];

      const entityMap = await fetchEntitiesByArticle(raw.map((r) => r.article_id));
      const enriched = raw.map((r) => ({ ...r, entities: entityMap.get(r.article_id) ?? [] }));

      const seen = getSeenSet(qc, userId);
      const items = enriched.filter((r) => !seen.has(r.article_id));
      const cursor =
        raw.length < PAGE_SIZE ? null : (raw[raw.length - 1]?.published_at ?? null);
      return { items, cursor };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
}

/**
 * Discover feed — cluster leads from the last 24h, same seen-filter behavior.
 */
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
           article_entities(confidence, entity:entities(${ENTITY_COLS}))`
        )
        .eq('status', 'summarized')
        .or('is_cluster_lead.eq.true,cluster_id.is.null')
        .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('published_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) query = query.lt('published_at', pageParam as string);

      const { data, error } = await query;
      if (error) throw error;
      const rows =
        (data as unknown as Array<{
          id: string;
          headline: string;
          summary: string;
          image_url: string | null;
          publisher: string;
          url: string;
          published_at: string;
          cluster_id: string | null;
          article_entities: ArticleEntityJoin[] | null;
        }>) ?? [];
      const raw: FeedCard[] = rows.map((r) => ({
        article_id: r.id,
        headline: r.headline,
        summary: r.summary,
        image_url: r.image_url,
        publisher: r.publisher,
        url: r.url,
        published_at: r.published_at,
        cluster_id: r.cluster_id,
        entities: pickCardEntities(r.article_entities),
      }));

      const seen = getSeenSet(qc, userId);
      const items = raw.filter((r) => !seen.has(r.article_id));
      const cursor =
        raw.length < PAGE_SIZE ? null : (raw[raw.length - 1]?.published_at ?? null);
      return { items, cursor };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
}
