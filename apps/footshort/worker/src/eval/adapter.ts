/**
 * footshort adapter for @vismay/eval-entities.
 *
 * Pulls summarised articles + their tagged entities from the (article_id,
 * entity_id) join, dereferencing entity_id → (type, name) via the entities
 * table.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EntityEvalAdapter, EvalArticle, TaggedEntity } from '@vismay/eval-entities';
import { summarizeAndTag } from '../gemini';
import { resolveEntities } from '../entityResolver';

const PAGE_SIZE = 500;

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('footshort eval: NEXT_PUBLIC_SUPABASE_URL required');
  if (!key) throw new Error('footshort eval: SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

type ArticleRow = {
  id: string;
  url: string;
  publisher: string;
  headline: string;
  original_snippet: string | null;
  summary: string | null;
  published_at: string;
};

type AeJoinRow = {
  article_id: string;
  entity_id: string;
  entities: { id: string; type: string; name: string } | null;
};

let entityNameCache: Map<string, { type: string; name: string }> | null = null;

async function getEntityNameCache(
  sb: SupabaseClient
): Promise<Map<string, { type: string; name: string }>> {
  if (entityNameCache) return entityNameCache;
  const { data, error } = await sb.from('entities').select('id, type, name');
  if (error) throw new Error(`footshort eval entity cache: ${error.message}`);
  const cache = new Map<string, { type: string; name: string }>();
  for (const e of (data ?? []) as Array<{ id: string; type: string; name: string }>) {
    cache.set(e.id, { type: e.type, name: e.name });
  }
  entityNameCache = cache;
  return cache;
}

export const footshortAdapter: EntityEvalAdapter = {
  appName: 'footshort',
  entityTypes: ['league', 'team', 'player'] as const,

  async fetchSample({ since, max }) {
    const sb = getSupabase();

    const articles: ArticleRow[] = [];
    for (let from = 0; from < max; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, max - 1);
      const { data, error } = await sb
        .from('articles')
        .select('id, url, publisher, headline, original_snippet, summary, published_at')
        .eq('status', 'summarized')
        .gte('summary_at', since)
        .order('published_at', { ascending: false })
        .range(from, to);
      if (error) throw new Error(`footshort articles page ${from}-${to}: ${error.message}`);
      if (!data || data.length === 0) break;
      articles.push(...(data as ArticleRow[]));
      if (data.length < PAGE_SIZE) break;
    }
    if (articles.length === 0) return [];

    const ids = articles.map((a) => a.id);
    const aeRows: AeJoinRow[] = [];
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const slice = ids.slice(i, i + PAGE_SIZE);
      const { data, error } = await sb
        .from('article_entities')
        .select('article_id, entity_id, entities ( id, type, name )')
        .in('article_id', slice);
      if (error) throw new Error(`footshort article_entities slice ${i}: ${error.message}`);
      if (data) aeRows.push(...(data as unknown as AeJoinRow[]));
    }

    const tagsByArticle = new Map<string, TaggedEntity[]>();
    for (const r of aeRows) {
      const ent = r.entities;
      if (!ent) continue; // FK should prevent this, but be defensive
      const list = tagsByArticle.get(r.article_id) ?? [];
      list.push({ type: ent.type, id: ent.id, name: ent.name });
      tagsByArticle.set(r.article_id, list);
    }

    return articles.map<EvalArticle>((a) => ({
      id: a.id,
      url: a.url,
      publisher: a.publisher,
      headline: a.headline,
      body: a.summary ?? a.original_snippet ?? '',
      publishedAt: a.published_at,
      taggedEntities: tagsByArticle.get(a.id) ?? [],
    }));
  },

  async extractLive({ headline, body, publisher }) {
    if (!body) return [];
    const sb = getSupabase();
    const summary = await summarizeAndTag({ headline, body, publisher });
    if (!summary.is_football_news) return [];
    const ids = await resolveEntities(sb, summary.entities);
    const cache = await getEntityNameCache(sb);
    const tags: TaggedEntity[] = [];
    for (const id of ids) {
      const meta = cache.get(id);
      if (meta) tags.push({ type: meta.type, id, name: meta.name });
    }
    return tags;
  },
};
