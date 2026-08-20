import { useQuery } from '@tanstack/react-query';
import type { FeedCardEntity } from '@footshorts/shared/schemas';
import { supabase } from './supabase';
import { isHiddenCompetition, isHiddenEntity } from './hiddenContent';

/**
 * Public data for the logged-out landing carousel.
 *
 * Both queries run without a session: `articles`, `entities` and
 * `article_entities` are all `public read using (true)` (see the init
 * migration), which is the same grant the web Discover tab relies on for
 * logged-out visitors. Neither hook is gated on auth, and both fail soft —
 * the slides carry static fallbacks so a cold start with no network still
 * renders the screen it was designed as.
 */

const ENTITY_COLS = 'id, type, slug, name, crest_url, league_slug, primary_color';

export type LandingBrief = {
  id: string;
  headline: string;
  summary: string;
  publisher: string;
  publishedAt: string;
  imageUrl: string | null;
  entities: FeedCardEntity[];
};

type ArticleEntityJoin = { confidence: number | null; entity: FeedCardEntity | null };

type ArticleRow = {
  id: string;
  headline: string;
  summary: string | null;
  publisher: string;
  published_at: string;
  image_url: string | null;
  article_entities: ArticleEntityJoin[] | null;
};



/**
 * Team/league entities in Gemini-confidence order — the crests and brand
 * colours the card is built from. Mirrors `pickCardEntities` in useFeed so the
 * landing mock and the real feed pick the same clubs off the same article.
 */
function cardEntities(row: ArticleRow): FeedCardEntity[] {
  return (row.article_entities ?? [])
    .filter(
      (ae): ae is { confidence: number | null; entity: FeedCardEntity } =>
        !!ae.entity &&
        (ae.entity.type === 'team' || ae.entity.type === 'league') &&
        !isHiddenEntity(ae.entity),
    )
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map((ae) => ae.entity);
}

/** The `count` most recent published briefs, for the landing carousel's deck. */
export function useLandingBriefs(count: number) {
  return useQuery({
    queryKey: ['landing', 'briefs', count],
    queryFn: async (): Promise<LandingBrief[]> => {
      const { data, error } = await supabase
        .from('articles')
        .select(
          `id, headline, summary, publisher, published_at, image_url,
           article_entities(confidence, entity:entities(${ENTITY_COLS}))`,
        )
        .eq('status', 'summarized')
        // The deck card is photo-led, so a story without one has nothing to
        // show. Mirrors the web about-us stack this is a port of.
        .not('image_url', 'is', null)
        // One card per story — without this a busy match night fills the deck
        // with the same fixture from three different publishers.
        .or('is_cluster_lead.eq.true,cluster_id.is.null')
        .order('published_at', { ascending: false })
        .limit(count * 2);
      if (error) throw error;
      return ((data as unknown as ArticleRow[]) ?? [])
        .filter((row) => !!row.summary)
        .slice(0, count)
        .map((row) => ({
          id: row.id,
          headline: row.headline,
          summary: row.summary as string,
          publisher: row.publisher,
          publishedAt: row.published_at,
          imageUrl: row.image_url,
          // Kept for the hero's fallback: an image that fails to load drops
          // back to the two-club colour band.
          entities: cardEntities(row),
        }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type LandingCrest = {
  id: string;
  slug: string;
  name: string;
  type: 'team' | 'league';
  /** Always set on live rows (the query filters them out otherwise); null on
   *  the slides' static cold-start stand-ins. */
  crestUrl: string | null;
  color: string | null;
};

type CrestRow = {
  id: string;
  slug: string;
  name: string;
  type: 'team' | 'league';
  crest_url: string | null;
  primary_color: string | null;
};

/** Every fourth tile is a competition, so the grid reads as leagues *and* clubs. */
const LEAGUE_EVERY = 4;

/**
 * Competitions people recognise, first.
 *
 * Every seeded league row has `popularity = 0` — the curated ranking in the
 * entity_popularity migration only covers clubs — so without this the grid
 * fills its competition slots alphabetically, putting the Brasileirão and the
 * Championship ahead of the Premier League. Anything unlisted keeps its
 * alphabetical position behind these.
 */
const MARQUEE_LEAGUES = [
  'premier-league',
  'champions-league',
  'primera-division',
  'serie-a',
  'bundesliga',
  'ligue-1',
];

function marqueeRank(slug: string): number {
  const i = MARQUEE_LEAGUES.indexOf(slug);
  return i === -1 ? MARQUEE_LEAGUES.length : i;
}

function toCrest(row: CrestRow): LandingCrest | null {
  if (!row.crest_url) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    crestUrl: row.crest_url,
    color: row.primary_color,
  };
}

/**
 * Interleave clubs with competitions rather than concatenating them, so the
 * grid never shows a block of league roundels followed by a block of crests.
 * Whichever list runs out first, the other fills the tail.
 */
function interleave(teams: LandingCrest[], leagues: LandingCrest[]): LandingCrest[] {
  const out: LandingCrest[] = [];
  const team = [...teams];
  const league = [...leagues];
  while (team.length > 0 || league.length > 0) {
    const wantLeague = out.length % LEAGUE_EVERY === LEAGUE_EVERY - 1;
    const next =
      wantLeague && league.length > 0 ? league.shift() : team.shift() ?? league.shift();
    if (!next) break;
    out.push(next);
  }
  return out;
}

/**
 * Marquee club crests and competition badges for the follow slide's grid.
 * Teams come back in curated `popularity` order — the same ranking the teams
 * onboarding screen uses — so the grid opens on clubs people recognise.
 */
export function useLandingCrests() {
  return useQuery({
    queryKey: ['landing', 'crests'],
    queryFn: async (): Promise<LandingCrest[]> => {
      const [teams, leagues] = await Promise.all([
        supabase
          .from('entities')
          .select('id, slug, name, type, crest_url, primary_color')
          .eq('type', 'team')
          .not('crest_url', 'is', null)
          .order('popularity', { ascending: false })
          .order('name')
          .limit(36),
        supabase
          .from('entities')
          .select('id, slug, name, type, crest_url, primary_color')
          .eq('type', 'league')
          .not('crest_url', 'is', null)
          .order('name')
          .limit(20),
      ]);
      if (teams.error) throw teams.error;
      if (leagues.error) throw leagues.error;

      const toList = (rows: CrestRow[] | null) =>
        (rows ?? []).map(toCrest).filter((c): c is LandingCrest => !!c);

      return interleave(
        toList(teams.data as CrestRow[] | null),
        toList(leagues.data as CrestRow[] | null)
          .filter((l) => !isHiddenCompetition(l.slug))
          // Stable sort, so unlisted competitions keep the query's name order.
          .sort((a, b) => marqueeRank(a.slug) - marqueeRank(b.slug)),
      );
    },
    staleTime: 60 * 60 * 1000,
  });
}
