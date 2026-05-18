/**
 * Pre-compute story_segments — for every driver and constructor that has
 * recent article links, pick the 5 most recent summarised articles. The /feed
 * StoryRings read this table directly so the front page never fans out a
 * heavy join.
 *
 * Run after ingestNews.ts so the segments reflect the day's news. Idempotent
 * via the (entity_type, entity_id, article_id) unique constraint.
 *
 * Run via: `pnpm --filter @vizf1/worker build:story-segments`
 */

import { getSupabase } from './supabase'

const PER_ENTITY = 5
const LOOKBACK_DAYS = 14

type SupabaseClient = ReturnType<typeof getSupabase>

type LinkRow = {
  entity_type: 'driver' | 'constructor' | 'circuit'
  entity_id: string
  article_id: string
  articles: { published_at: string; status: string } | null
}

async function loadLinks(sb: SupabaseClient): Promise<LinkRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data, error } = await sb
    .from('vizf1_article_entities')
    .select('entity_type, entity_id, article_id, articles:vizf1_articles!inner(published_at, status)')
    .eq('articles.status', 'summarized')
    .gte('articles.published_at', since)
  if (error) throw error
  return (data ?? []) as unknown as LinkRow[]
}

export async function runBuildStorySegments() {
  const sb = getSupabase()
  console.log(`[story-segments] start ${new Date().toISOString()}`)

  const links = await loadLinks(sb)
  // Group by (entity_type, entity_id) and keep the top-N by published_at desc.
  const byEntity = new Map<string, LinkRow[]>()
  for (const l of links) {
    const k = `${l.entity_type}:${l.entity_id}`
    const arr = byEntity.get(k) ?? []
    arr.push(l)
    byEntity.set(k, arr)
  }

  const rows: Array<{
    entity_type: LinkRow['entity_type']
    entity_id: string
    article_id: string
    rank: number
  }> = []
  for (const [, list] of byEntity) {
    list.sort((a, b) =>
      (b.articles?.published_at ?? '').localeCompare(a.articles?.published_at ?? ''),
    )
    list.slice(0, PER_ENTITY).forEach((l, i) => {
      rows.push({
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        article_id: l.article_id,
        rank: i,
      })
    })
  }

  // Wipe-and-replace is cleaner than diffing — table is small (~100 rows).
  const { error: delErr } = await sb
    .from('vizf1_story_segments')
    .delete()
    .not('id', 'is', null) // delete all rows
  if (delErr) console.warn('[story-segments] truncate failed (ok if first run):', delErr)

  if (rows.length === 0) {
    console.log('[story-segments] no rows to insert')
    return
  }
  const { error: insErr } = await sb.from('vizf1_story_segments').insert(rows)
  if (insErr) {
    console.error('[story-segments] insert failed:', insErr)
    throw insErr
  }
  console.log(`[story-segments] inserted ${rows.length} rows across ${byEntity.size} entities`)
}

if (require.main === module) {
  runBuildStorySegments()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
