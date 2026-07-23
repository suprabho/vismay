import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { isHiddenEntity } from './hiddenContent';
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
/** Entity pages load cards a strip-page at a time (latest first). */
export const ENTITY_CARDS_PAGE_SIZE = 10;

/** Parse a `w:h` ratio string ('4:5' → 0.8, '9:16' → 0.5625); fallback on null/malformed. */
export function parseRatio(ratio: string | null | undefined, fallback = 4 / 5): number {
  if (!ratio) return fallback;
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return fallback;
  return w / h;
}

type DiscoverRow = {
  id: string;
  name: string;
  image_url: string | null;
  ratio: string | null;
  published_at: string | null;
  footshorts_share_card_entities: Array<{ entity: FeedCardEntity | null }> | null;
};

type CardRow = {
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
  // A card tagged with a hidden competition (see hiddenContent.ts) is that
  // competition's content — the watermark is baked into the PNG — so drop the
  // whole card, not just the tag.
  if (entities.some((e) => isHiddenEntity(e))) return null;
  return {
    id: r.id,
    name: r.name,
    image_url: r.image_url,
    ratio: r.ratio,
    published_at: r.published_at,
    entities,
  };
}

function cardRowToItem(c: CardRow | null): ShareCardItem | null {
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

/** Published cards tagged with a single entity — for team / league pages.
 *  Paged latest-first, {@link ENTITY_CARDS_PAGE_SIZE} at a time; the strip calls
 *  `fetchNextPage` as it nears its end. */
export function useEntityShareCards(entityId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['shareCards', 'entity', entityId],
    enabled: !!entityId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ShareCardItem[]> => {
      // Query from the cards side (inner-joined on the tag table) so order and
      // range apply to the cards themselves — ordering via the embedded to-one
      // `card` never reliably reordered the join rows, which would make offset
      // pagination unstable. `id` tiebreaks equal timestamps for stable pages.
      const { data, error } = await supabase
        .from('footshorts_share_cards')
        .select(`${CARD_COLS}, footshorts_share_card_entities!inner(entity_id)`)
        .eq('footshorts_share_card_entities.entity_id', entityId!)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + ENTITY_CARDS_PAGE_SIZE - 1);
      if (error) throw error;
      return ((data as unknown as CardRow[]) ?? [])
        .map(cardRowToItem)
        .filter((x): x is ShareCardItem => !!x);
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length < ENTITY_CARDS_PAGE_SIZE ? undefined : lastPageParam + ENTITY_CARDS_PAGE_SIZE,
    staleTime: 60 * 1000,
  });
}
