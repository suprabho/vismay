/**
 * Surfaces footshorts's RSS-derived news summaries and football-data.org
 * fixtures so the `/fifa-wc26` team detail sheet can render per-team
 * editorial + match data without re-ingesting any of it. Footshorts shares
 * vizmaya-fyi's Supabase project, so the existing service client is reused.
 *
 * Team-name → entity match uses the same slug normalization as footshorts's
 * worker (apps/worker/src/entityResolver.ts). For the FIFA names that don't
 * match cleanly, see TEAM_ALIASES below.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@vismay/content-source/supabase'

export interface FootshortsNewsItem {
  id: string
  url: string
  title: string
  summary: string | null
  publisher: string | null
  publishedAt: string
  imageUrl: string | null
}

export interface FootshortsFixture {
  id: string
  kickoffAt: string
  status: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
  competitionSlug: string
  isHome: boolean
}

export interface FootshortsTeamData {
  news: FootshortsNewsItem[]
  fixtures: FootshortsFixture[]
}

const EMPTY: FootshortsTeamData = { news: [], fixtures: [] }
const NEWS_LIMIT = 8
const FIXTURES_LIMIT = 10

// FIFA-name → footshorts-slug fixups for the few names where football-data.org
// and FIFA disagree. Slugs on the right must match footshorts's normalized
// entity slugs (lowercase, accents stripped, non-alphanum → "-").
const TEAM_ALIASES: Record<string, string> = {
  // football-data.org uses the IOC-style "Korea Republic" for South Korea.
  'south-korea': 'korea-republic',
  // FIFA uses "Türkiye"; football-data.org still labels it "Turkey".
  turkiye: 'turkey',
  // FIFA "USA" / "United States" — footshorts slug from football-data.org tends
  // to be "united-states" already, so no alias needed; left here as a marker.
  // 'usa': 'united-states',
}

function normalizeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface EntityRow {
  id: string
  name: string
  country: string | null
}

async function resolveTeamEntity(
  sb: SupabaseClient,
  teamName: string,
): Promise<EntityRow | null> {
  const slug = normalizeSlug(teamName)
  const aliasedSlug = TEAM_ALIASES[slug]

  // Try canonical slug first, then alias, then a country-text fallback.
  const candidateSlugs = aliasedSlug ? [slug, aliasedSlug] : [slug]
  const { data: bySlug, error: slugErr } = await sb
    .from('entities')
    .select('id, name, country')
    .eq('type', 'team')
    .in('slug', candidateSlugs)
    .limit(1)
  if (slugErr) {
    console.warn(`[footshorts] entity slug lookup failed for ${teamName}: ${slugErr.message}`)
    return null
  }
  if (bySlug && bySlug.length > 0) return bySlug[0] as EntityRow

  // Fallback: country-name text match (case-insensitive). Helps for the long-
  // tail names not covered by aliases.
  const { data: byCountry, error: countryErr } = await sb
    .from('entities')
    .select('id, name, country')
    .eq('type', 'team')
    .ilike('country', teamName)
    .limit(1)
  if (countryErr) {
    console.warn(`[footshorts] entity country lookup failed for ${teamName}: ${countryErr.message}`)
    return null
  }
  return (byCountry?.[0] as EntityRow) ?? null
}

interface RawArticleRow {
  id: string
  url: string
  headline: string
  summary: string | null
  publisher: string | null
  image_url: string | null
  published_at: string
}

async function fetchNewsForEntity(
  sb: SupabaseClient,
  entityId: string,
): Promise<FootshortsNewsItem[]> {
  const { data, error } = await sb
    .from('articles')
    .select(
      'id, url, headline, summary, publisher, image_url, published_at, article_entities!inner(entity_id)',
    )
    .eq('article_entities.entity_id', entityId)
    .eq('status', 'summarized')
    .order('published_at', { ascending: false })
    .limit(NEWS_LIMIT)
  if (error) {
    console.warn(`[footshorts] news fetch failed for entity ${entityId}: ${error.message}`)
    return []
  }
  return ((data ?? []) as unknown as RawArticleRow[]).map((a) => ({
    id: a.id,
    url: a.url,
    title: a.headline,
    summary: a.summary,
    publisher: a.publisher,
    publishedAt: a.published_at,
    imageUrl: a.image_url,
  }))
}

interface RawFixtureRow {
  id: string
  competition_slug: string
  home_team_id: string | null
  away_team_id: string | null
  home_team_name: string | null
  away_team_name: string | null
  kickoff_at: string
  status: string
  home_score: number | null
  away_score: number | null
  venue: string | null
}

async function fetchFixturesForEntity(
  sb: SupabaseClient,
  entityId: string,
  ownTeamLabel: string,
): Promise<FootshortsFixture[]> {
  // Pull fixtures where the team is on either side, in either FK or raw-name
  // form. The raw-name match catches the (rare) case where football-data.org
  // didn't include this team in the seed but listed it in a fixture row.
  const { data, error } = await sb
    .from('fixtures')
    .select(
      'id, competition_slug, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, venue',
    )
    .or(
      [
        `home_team_id.eq.${entityId}`,
        `away_team_id.eq.${entityId}`,
      ].join(','),
    )
    .eq('competition_slug', 'world-cup')
    .order('kickoff_at', { ascending: true })
    .limit(FIXTURES_LIMIT)
  if (error) {
    console.warn(`[footshorts] fixtures fetch failed for entity ${entityId}: ${error.message}`)
    return []
  }
  const rows = (data ?? []) as unknown as RawFixtureRow[]
  if (rows.length === 0) return []

  // Resolve all referenced entity IDs in one batched lookup so we can show
  // proper team names rather than UUIDs.
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.home_team_id) ids.add(r.home_team_id)
    if (r.away_team_id) ids.add(r.away_team_id)
  }
  const idToName = new Map<string, string>()
  if (ids.size > 0) {
    const { data: ents } = await sb
      .from('entities')
      .select('id, name')
      .in('id', Array.from(ids))
    for (const e of (ents ?? []) as Array<{ id: string; name: string }>) {
      idToName.set(e.id, e.name)
    }
  }

  return rows.map((r) => {
    const homeName =
      (r.home_team_id ? idToName.get(r.home_team_id) : null) ?? r.home_team_name ?? '—'
    const awayName =
      (r.away_team_id ? idToName.get(r.away_team_id) : null) ?? r.away_team_name ?? '—'
    const isHome = r.home_team_id === entityId || homeName === ownTeamLabel
    return {
      id: r.id,
      kickoffAt: r.kickoff_at,
      status: r.status,
      homeTeam: homeName,
      awayTeam: awayName,
      homeScore: r.home_score,
      awayScore: r.away_score,
      venue: r.venue,
      competitionSlug: r.competition_slug,
      isHome,
    }
  })
}

export async function getFootshortsDataForTeam(
  teamName: string,
): Promise<FootshortsTeamData> {
  const sb = createServiceClient()
  const entity = await resolveTeamEntity(sb, teamName)
  if (!entity) return EMPTY

  const [news, fixtures] = await Promise.all([
    fetchNewsForEntity(sb, entity.id),
    fetchFixturesForEntity(sb, entity.id, entity.name),
  ])
  return { news, fixtures }
}
