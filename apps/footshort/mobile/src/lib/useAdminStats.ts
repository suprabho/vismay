import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type PublisherStat = {
  publisher: string;
  total: number;
  summarized: number;
  failed: number;
  withImage: number;
  withTags: number;
};

export type DayPoint = {
  day: string; // YYYY-MM-DD
  count: number;
};

export type TopEntity = {
  entity_id: string;
  name: string;
  type: 'league' | 'team' | 'player';
  article_count: number;
  crest_url: string | null;
};

export type AdminStats = {
  articles: {
    total: number;
    summarized: number;
    failed: number;
    pending: number;
    withImage: number;
    withTags: number;
  };
  entities: {
    leagues: number;
    teams: number;
    players: number;
  };
  freshness: {
    latestIngestedAt: string | null;
    minutesSinceLatest: number | null;
  };
  byPublisher: PublisherStat[];
  byDay: DayPoint[];
  topEntities: TopEntity[];
};

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    staleTime: 60_000,
    queryFn: async (): Promise<AdminStats> => {
      // Pull everything in parallel. Dataset size is small (~200-500 rows) so client-side
      // aggregation is simpler than RPCs. Swap for SQL views if this grows.
      const [
        articlesRes,
        entitiesRes,
        articleEntitiesRes,
      ] = await Promise.all([
        supabase
          .from('articles')
          .select('id, publisher, status, image_url, ingested_at')
          .order('ingested_at', { ascending: false }),
        supabase.from('entities').select('id, name, type, crest_url'),
        supabase.from('article_entities').select('article_id, entity_id'),
      ]);

      if (articlesRes.error) throw articlesRes.error;
      if (entitiesRes.error) throw entitiesRes.error;
      if (articleEntitiesRes.error) throw articleEntitiesRes.error;

      const articles = articlesRes.data ?? [];
      const entities = entitiesRes.data ?? [];
      const articleEntities = articleEntitiesRes.data ?? [];

      const taggedArticleIds = new Set(articleEntities.map((r) => r.article_id));

      // Article totals
      const totals = {
        total: articles.length,
        summarized: 0,
        failed: 0,
        pending: 0,
        withImage: 0,
        withTags: 0,
      };
      for (const a of articles) {
        if (a.status === 'summarized') totals.summarized++;
        else if (a.status === 'failed') totals.failed++;
        else if (a.status === 'pending') totals.pending++;
        if (a.image_url) totals.withImage++;
        if (taggedArticleIds.has(a.id)) totals.withTags++;
      }

      // Entity totals
      const ent = { leagues: 0, teams: 0, players: 0 };
      for (const e of entities) {
        if (e.type === 'league') ent.leagues++;
        else if (e.type === 'team') ent.teams++;
        else if (e.type === 'player') ent.players++;
      }

      // Freshness
      const latest = articles[0]?.ingested_at ?? null;
      const minutesSinceLatest = latest
        ? Math.floor((Date.now() - new Date(latest).getTime()) / 60_000)
        : null;

      // By publisher
      const pubMap = new Map<string, PublisherStat>();
      for (const a of articles) {
        let s = pubMap.get(a.publisher);
        if (!s) {
          s = {
            publisher: a.publisher,
            total: 0,
            summarized: 0,
            failed: 0,
            withImage: 0,
            withTags: 0,
          };
          pubMap.set(a.publisher, s);
        }
        s.total++;
        if (a.status === 'summarized') s.summarized++;
        if (a.status === 'failed') s.failed++;
        if (a.image_url) s.withImage++;
        if (taggedArticleIds.has(a.id)) s.withTags++;
      }
      const byPublisher = Array.from(pubMap.values()).sort((a, b) => b.total - a.total);

      // By day (ingested_at, last 14 days)
      const dayMap = new Map<string, number>();
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      for (const a of articles) {
        const t = new Date(a.ingested_at).getTime();
        if (t < cutoff) continue;
        const k = dayKey(a.ingested_at);
        dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
      }
      // Fill missing days with 0
      const byDay: DayPoint[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const k = d.toISOString().slice(0, 10);
        byDay.push({ day: k, count: dayMap.get(k) ?? 0 });
      }

      // Top entities by article count
      const entById = new Map(entities.map((e) => [e.id, e]));
      const entityCount = new Map<string, number>();
      for (const r of articleEntities) {
        entityCount.set(r.entity_id, (entityCount.get(r.entity_id) ?? 0) + 1);
      }
      const topEntities: TopEntity[] = Array.from(entityCount.entries())
        .map(([id, count]) => {
          const e = entById.get(id);
          if (!e) return null;
          return {
            entity_id: id,
            name: e.name,
            type: e.type as TopEntity['type'],
            crest_url: e.crest_url,
            article_count: count,
          };
        })
        .filter((x): x is TopEntity => x !== null)
        .sort((a, b) => b.article_count - a.article_count)
        .slice(0, 12);

      return {
        articles: totals,
        entities: ent,
        freshness: { latestIngestedAt: latest, minutesSinceLatest },
        byPublisher,
        byDay,
        topEntities,
      };
    },
  });
}
