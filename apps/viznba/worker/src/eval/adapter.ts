/**
 * viznba adapter for @vismay/eval-entities.
 *
 * Pulls summarised articles + their (team|player|coach) tags from
 * viznba_article_entities and names them from the three canonical tables.
 * `extractLive` runs the same summarise → resolve → Jev gate path ingest does.
 */

import type { EntityEvalAdapter, EvalArticle, TaggedEntity } from '@vismay/eval-entities'
import { getSupabase } from '../supabase'
import { summariseAndTag } from '../summarise'
import { resolveEntities, selectAll, type EntityType } from '../entityResolver'
import { gateEntityTags } from '../jevEntityGate'

type ArticleRow = {
  id: string
  url: string
  publisher: string
  headline: string
  original_snippet: string | null
  summary: string | null
  published_at: string
}

type AeRow = { article_id: string; entity_type: EntityType; entity_id: string }

const PAGE_SIZE = 500

type NameCache = Record<EntityType, Map<string, string>>
let cachedNames: NameCache | null = null

async function fetchNames(sb: ReturnType<typeof getSupabase>): Promise<NameCache> {
  if (cachedNames) return cachedNames
  type Row = { id: string; display_name: string }
  const toMap = (rows: Row[]) => new Map(rows.map((r) => [r.id, r.display_name]))
  const [teams, players, coaches] = await Promise.all([
    selectAll<Row>(sb, 'viznba_teams', 'id:team_id, display_name'),
    selectAll<Row>(sb, 'viznba_players', 'id:player_id, display_name'),
    selectAll<Row>(sb, 'viznba_coaches', 'id:coach_id, display_name'),
  ])
  cachedNames = { team: toMap(teams), player: toMap(players), coach: toMap(coaches) }
  return cachedNames
}

export const viznbaAdapter: EntityEvalAdapter = {
  appName: 'viznba',
  entityTypes: ['team', 'player', 'coach'] as const,

  async fetchSample({ since, max }) {
    const sb = getSupabase()

    const articles: ArticleRow[] = []
    for (let from = 0; from < max; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, max - 1)
      const { data, error } = await sb
        .from('viznba_articles')
        .select('id, url, publisher, headline, original_snippet, summary, published_at')
        .eq('status', 'summarized')
        .gte('summary_at', since)
        .order('published_at', { ascending: false })
        .range(from, to)
      if (error) throw new Error(`viznba articles page ${from}-${to}: ${error.message}`)
      if (!data || data.length === 0) break
      articles.push(...(data as ArticleRow[]))
      if (data.length < PAGE_SIZE) break
    }
    if (articles.length === 0) return []

    const ids = articles.map((a) => a.id)
    const aeRows: AeRow[] = []
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const { data, error } = await sb
        .from('viznba_article_entities')
        .select('article_id, entity_type, entity_id')
        .in('article_id', ids.slice(i, i + PAGE_SIZE))
      if (error) throw new Error(`viznba article_entities slice ${i}: ${error.message}`)
      if (data) aeRows.push(...(data as AeRow[]))
    }

    const names = await fetchNames(sb)
    const tagsByArticle = new Map<string, TaggedEntity[]>()
    for (const r of aeRows) {
      const list = tagsByArticle.get(r.article_id) ?? []
      list.push({ type: r.entity_type, id: r.entity_id, name: names[r.entity_type].get(r.entity_id) ?? r.entity_id })
      tagsByArticle.set(r.article_id, list)
    }

    return articles.map<EvalArticle>((a) => ({
      id: a.id,
      url: a.url,
      publisher: a.publisher,
      headline: a.headline,
      body: a.summary ?? a.original_snippet ?? '',
      publishedAt: a.published_at,
      taggedEntities: tagsByArticle.get(a.id) ?? [],
    }))
  },

  async extractLive({ headline, body, publisher }) {
    if (!body) return []
    const sb = getSupabase()
    const summary = await summariseAndTag({ headline, body, publisher })
    if (!summary.is_nba_news) return []
    const resolved = await resolveEntities(sb, summary.entities)
    const gated = await gateEntityTags({ headline, body, publisher }, resolved)
    return gated.filter((e) => e.kept).map<TaggedEntity>((e) => ({ type: e.type, id: e.id, name: e.name }))
  },
}
