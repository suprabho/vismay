'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { FeedCardEntity } from '@footshorts/shared/schemas';

/**
 * Published share cards (shipped from the admin "Share cards" tool). A card is a
 * rendered PNG tagged with entities; it surfaces in Discover, in For You (by the
 * entities a user follows), and on the team / league pages it's tagged with —
 * mirroring how articles flow through `article_entities`.
 */
export type ShareCardItem = {
  id: string;
  name: string;
  image_url: string;
  ratio: string | null;
  published_at: string;
  entities: FeedCardEntity[];
};

const ENTITY_EMBED =
  'entity:entities(id, type, slug, name, crest_url, league_slug, primary_color)';
const CARD_COLS = 'id, name, image_url, ratio, published_at, status';

const DISCOVER_WINDOW_MS = 24 * 60 * 60 * 1000;

type DiscoverRow = {
  id: string;
  name: string;
  image_url: string | null;
  ratio: string | null;
  published_at: string | null;
  footshorts_share_card_entities: Array<{ entity: FeedCardEntity | null }> | null;
};

type CardEmbed = {
  id: string;
  name: string;
  image_url: string | null;
  ratio: string | null;
  published_at: string | null;
};

function discoverRowToItem(r: DiscoverRow): ShareCardItem | null {
  if (!r.image_url || !r.published_at) return null;
  const entities = (r.footshorts_share_card_entities ?? [])
    .map((j) => j.entity)
    .filter((e): e is FeedCardEntity => !!e);
  return {
    id: r.id,
    name: r.name,
    image_url: r.image_url,
    ratio: r.ratio,
    published_at: r.published_at,
    entities,
  };
}

function cardEmbedToItem(c: CardEmbed | null): ShareCardItem | null {
  if (!c || !c.image_url || !c.published_at) return null;
  return {
    id: c.id,
    name: c.name,
    image_url: c.image_url,
    ratio: c.ratio,
    published_at: c.published_at,
    entities: [],
  };
}

/** Recently shipped cards, newest-first — interleaved into the Discover feed. */
export function useDiscoverShareCards() {
  return useQuery({
    queryKey: ['shareCards', 'discover'],
    queryFn: async (): Promise<ShareCardItem[]> => {
      const since = new Date(Date.now() - DISCOVER_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from('footshorts_share_cards')
        .select(`id, name, image_url, ratio, published_at, footshorts_share_card_entities(${ENTITY_EMBED})`)
        .eq('status', 'published')
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data as unknown as DiscoverRow[]) ?? [])
        .map(discoverRowToItem)
        .filter((x): x is ShareCardItem => !!x);
    },
    staleTime: 60 * 1000,
  });
}

/** Published cards tagged with a single entity — for team / league pages. */
export function useEntityShareCards(entityId: string | undefined) {
  return useQuery({
    queryKey: ['shareCards', 'entity', entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<ShareCardItem[]> => {
      const { data, error } = await supabase
        .from('footshorts_share_card_entities')
        .select(`card:footshorts_share_cards!inner(${CARD_COLS})`)
        .eq('entity_id', entityId!)
        .eq('card.status', 'published')
        .order('published_at', { ascending: false, foreignTable: 'card' })
        .limit(24);
      if (error) throw error;
      const items: ShareCardItem[] = [];
      const seen = new Set<string>();
      for (const row of (data as unknown as Array<{ card: CardEmbed | null }>) ?? []) {
        const item = cardEmbedToItem(row.card);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
      // Latest first. Ordering on the embedded to-one `card` doesn't reliably
      // reorder the parent rows, so sort the assembled list explicitly.
      items.sort((a, b) => b.published_at.localeCompare(a.published_at));
      return items;
    },
    staleTime: 60 * 1000,
  });
}
