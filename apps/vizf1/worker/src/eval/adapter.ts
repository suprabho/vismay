/**
 * vizf1 adapter for @vismay/eval-entities.
 *
 * Pulls summarised articles + their (driver|constructor|circuit) tags from
 * the polymorphic vizf1_article_entities table. Tag names are looked up by
 * joining to the three canonical-entity tables.
 */

import type { EntityEvalAdapter, EvalArticle, TaggedEntity } from '@vismay/eval-entities'
import { getSupabase } from '../supabase'
import { summariseAndTag } from '../gemini'
import { resolveEntities } from '../entityResolver'

type EntityType = 'driver' | 'constructor' | 'circuit'

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

type NameCache = {
  driver: Map<string, string>
  constructor: Map<string, string>
  circuit: Map<string, string>
}

let cachedNames: NameCache | null = null

async function fetchNames(sb: ReturnType<typeof getSupabase>): Promise<NameCache> {
  if (cachedNames) return cachedNames
  const [drivers, constructors, circuits] = await Promise.all([
    sb.from('vizf1_drivers').select('driver_id, given_name, family_name'),
    sb.from('vizf1_constructors').select('constructor_id, name'),
    sb.from('vizf1_circuits').select('circuit_id, name'),
  ])
  const driverMap = new Map<string, string>()
  for (const d of (drivers.data ?? []) as Array<{ driver_id: string; given_name: string; family_name: string }>) {
    driverMap.set(d.driver_id, `${d.given_name} ${d.family_name}`.trim())
  }
  const constructorMap = new Map<string, string>()
  for (const c of (constructors.data ?? []) as Array<{ constructor_id: string; name: string }>) {
    constructorMap.set(c.constructor_id, c.name)
  }
  const circuitMap = new Map<string, string>()
  for (const c of (circuits.data ?? []) as Array<{ circuit_id: string; name: string }>) {
    circuitMap.set(c.circuit_id, c.name)
  }
  cachedNames = { driver: driverMap, constructor: constructorMap, circuit: circuitMap }
  return cachedNames
}

export const vizf1Adapter: EntityEvalAdapter = {
  appName: 'vizf1',
  entityTypes: ['driver', 'constructor', 'circuit'] as const,

  async fetchSample({ since, max }) {
    const sb = getSupabase()

    // 1. Paginate summarised articles since `since`, capped at `max`.
    const articles: ArticleRow[] = []
    for (let from = 0; from < max; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, max - 1)
      const { data, error } = await sb
        .from('vizf1_articles')
        .select('id, url, publisher, headline, original_snippet, summary, published_at')
        .eq('status', 'summarized')
        .gte('summary_at', since)
        .order('published_at', { ascending: false })
        .range(from, to)
      if (error) throw new Error(`vizf1 articles page ${from}-${to}: ${error.message}`)
      if (!data || data.length === 0) break
      articles.push(...(data as ArticleRow[]))
      if (data.length < PAGE_SIZE) break
    }
    if (articles.length === 0) return []

    // 2. Fetch all article_entity rows for those articles in slices.
    const ids = articles.map((a) => a.id)
    const aeRows: AeRow[] = []
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const slice = ids.slice(i, i + PAGE_SIZE)
      const { data, error } = await sb
        .from('vizf1_article_entities')
        .select('article_id, entity_type, entity_id')
        .in('article_id', slice)
      if (error) throw new Error(`vizf1 article_entities slice ${i}: ${error.message}`)
      if (data) aeRows.push(...(data as AeRow[]))
    }

    // 3. Resolve entity_id → name once per type via cached lookups.
    const names = await fetchNames(sb)

    const tagsByArticle = new Map<string, TaggedEntity[]>()
    for (const r of aeRows) {
      const name = names[r.entity_type].get(r.entity_id) ?? r.entity_id
      const list = tagsByArticle.get(r.article_id) ?? []
      list.push({ type: r.entity_type, id: r.entity_id, name })
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
    if (!summary.is_f1_news) return []
    const refs = await resolveEntities(sb, summary.entities)
    const names = await fetchNames(sb)
    return refs.map<TaggedEntity>((r) => ({
      type: r.entity_type,
      id: r.entity_id,
      name: names[r.entity_type].get(r.entity_id) ?? r.entity_id,
    }))
  },
}
