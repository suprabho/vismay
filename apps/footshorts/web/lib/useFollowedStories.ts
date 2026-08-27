'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { Entity } from './useEntities';

/** A news article surfaced as a story slide. */
export type StoryArticle = {
  kind: 'article';
  id: string;
  headline: string;
  summary: string;
  image_url: string | null;
  publisher: string;
  url: string;
  published_at: string;
  cluster_id: string | null;
};

/** A shipped share card (rendered PNG) surfaced as a story slide. */
export type StoryShareCard = {
  kind: 'card';
  id: string;
  name: string;
  image_url: string;
  ratio: string | null;
  published_at: string;
};

export type StoryItem = StoryArticle | StoryShareCard;

export type StoryGroup = {
  entity: Entity;
  items: StoryItem[];
};

/** Stable identity for seen-tracking — namespaced so card and article ids can't collide. */
export const storyItemKey = (it: StoryItem): string => `${it.kind}:${it.id}`;

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ARTICLES_PER_ENTITY = 10;
const MAX_CARDS_PER_ENTITY = 10;

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

type CardRow = {
  entity_id: string;
  card: {
    id: string;
    name: string;
    image_url: string | null;
    ratio: string | null;
    published_at: string | null;
    status: string;
  } | null;
};

/**
 * Stories for the entities the signed-in user follows, grouped per entity. Each
 * group leads with the entity's shipped share cards (rendered PNGs) and is then
 * followed by its recent news articles — so the polished match cards play first
 * inside the full-screen story viewer.
 */
export function useFollowedStories() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: ['followedStories', userId],
    enabled: !!userId,
    queryFn: async (): Promise<StoryGroup[]> => {
      const { data: follows, error: fErr } = await supabase
        .from('follows')
        .select('entity_id, created_at, entity:entities(id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color, avatar_bg_color)')
        .order('created_at', { ascending: false });
      if (fErr) throw fErr;

      const followRows = (follows as unknown as FollowRow[]) ?? [];
      if (followRows.length === 0) return [];

      const entityIds = followRows.map((f) => f.entity_id);
      const since = new Date(Date.now() - WINDOW_MS).toISOString();

      const [aeRes, cardRes] = await Promise.all([
        supabase
          .from('article_entities')
          .select(
            'entity_id, article:articles!inner(id, headline, summary, image_url, publisher, url, published_at, cluster_id, is_cluster_lead, status)'
          )
          .in('entity_id', entityIds)
          .eq('article.status', 'summarized')
          .gte('article.published_at', since)
          .order('published_at', { ascending: false, foreignTable: 'article' })
          .limit(500),
        supabase
          .from('footshorts_share_card_entities')
          .select(
            'entity_id, card:footshorts_share_cards!inner(id, name, image_url, ratio, published_at, status)'
          )
          .in('entity_id', entityIds)
          .eq('card.status', 'published')
          .gte('card.published_at', since)
          .order('published_at', { ascending: false, foreignTable: 'card' })
          .limit(300),
      ]);
      if (aeRes.error) throw aeRes.error;
      if (cardRes.error) throw cardRes.error;

      // Articles per entity — collapse clusters to their lead, cap per entity.
      const articlesByEntity = new Map<
        string,
        { items: StoryArticle[]; seenClusters: Set<string> }
      >();
      for (const row of (aeRes.data as unknown as AERow[]) ?? []) {
        const art = row.article;
        if (!art) continue;
        if (art.cluster_id && !art.is_cluster_lead) continue;

        let g = articlesByEntity.get(row.entity_id);
        if (!g) {
          g = { items: [], seenClusters: new Set() };
          articlesByEntity.set(row.entity_id, g);
        }
        if (art.cluster_id) {
          if (g.seenClusters.has(art.cluster_id)) continue;
          g.seenClusters.add(art.cluster_id);
        }
        if (g.items.length >= MAX_ARTICLES_PER_ENTITY) continue;

        g.items.push({
          kind: 'article',
          id: art.id,
          headline: art.headline,
          summary: art.summary,
          image_url: art.image_url,
          publisher: art.publisher,
          url: art.url,
          published_at: art.published_at,
          cluster_id: art.cluster_id,
        });
      }

      // Share cards per entity — dedupe by card id, cap per entity.
      const cardsByEntity = new Map<string, { items: StoryShareCard[]; seen: Set<string> }>();
      for (const row of (cardRes.data as unknown as CardRow[]) ?? []) {
        const card = row.card;
        if (!card || !card.image_url || !card.published_at) continue;

        let g = cardsByEntity.get(row.entity_id);
        if (!g) {
          g = { items: [], seen: new Set() };
          cardsByEntity.set(row.entity_id, g);
        }
        if (g.seen.has(card.id)) continue;
        g.seen.add(card.id);
        if (g.items.length >= MAX_CARDS_PER_ENTITY) continue;

        g.items.push({
          kind: 'card',
          id: card.id,
          name: card.name,
          image_url: card.image_url,
          ratio: card.ratio,
          published_at: card.published_at,
        });
      }

      // Cards lead, then articles — preserving the follow order of entities.
      return followRows
        .map((f) => ({
          entity: f.entity,
          items: [
            ...(cardsByEntity.get(f.entity_id)?.items ?? []),
            ...(articlesByEntity.get(f.entity_id)?.items ?? []),
          ] as StoryItem[],
        }))
        .filter((g) => g.items.length > 0);
    },
  });
}
