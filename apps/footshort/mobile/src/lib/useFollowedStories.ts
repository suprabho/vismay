import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { Entity } from './useEntities';
import type { FeedCard } from '@shortfoot/shared/schemas';

export type StoryGroup = {
  entity: Entity;
  items: FeedCard[];
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_ENTITY = 10;

type FollowRow = {
  entity_id: string;
  created_at: string;
  entity: Entity;
};

type AERow = {
  entity_id: string;
  article: {
    id: string;
    headline: string;
    summary: string;
    image_url: string | null;
    publisher: string;
    url: string;
    published_at: string;
    cluster_id: string | null;
    is_cluster_lead: boolean;
    status: string;
  } | null;
};

export function useFollowedStories() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: ['followedStories', userId],
    enabled: !!userId,
    queryFn: async (): Promise<StoryGroup[]> => {
      const { data: follows, error: fErr } = await supabase
        .from('follows')
        .select('entity_id, created_at, entity:entities(id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color)')
        .order('created_at', { ascending: false });
      if (fErr) throw fErr;

      const followRows = (follows as unknown as FollowRow[]) ?? [];
      if (followRows.length === 0) return [];

      const entityIds = followRows.map((f) => f.entity_id);
      const since = new Date(Date.now() - WINDOW_MS).toISOString();

      const { data: aeRows, error: aeErr } = await supabase
        .from('article_entities')
        .select(
          'entity_id, article:articles!inner(id, headline, summary, image_url, publisher, url, published_at, cluster_id, is_cluster_lead, status)'
        )
        .in('entity_id', entityIds)
        .eq('article.status', 'summarized')
        .gte('article.published_at', since)
        .order('published_at', { ascending: false, foreignTable: 'article' })
        .limit(500);
      if (aeErr) throw aeErr;

      const grouped = new Map<string, { items: FeedCard[]; seenClusters: Set<string> }>();
      for (const row of (aeRows as unknown as AERow[]) ?? []) {
        const art = row.article;
        if (!art) continue;
        if (art.cluster_id && !art.is_cluster_lead) continue;

        let g = grouped.get(row.entity_id);
        if (!g) {
          g = { items: [], seenClusters: new Set() };
          grouped.set(row.entity_id, g);
        }
        if (art.cluster_id) {
          if (g.seenClusters.has(art.cluster_id)) continue;
          g.seenClusters.add(art.cluster_id);
        }
        if (g.items.length >= MAX_PER_ENTITY) continue;

        g.items.push({
          article_id: art.id,
          headline: art.headline,
          summary: art.summary,
          image_url: art.image_url,
          publisher: art.publisher,
          url: art.url,
          published_at: art.published_at,
          cluster_id: art.cluster_id,
        });
      }

      return followRows
        .map((f) => ({ entity: f.entity, items: grouped.get(f.entity_id)?.items ?? [] }))
        .filter((g) => g.items.length > 0);
    },
  });
}
