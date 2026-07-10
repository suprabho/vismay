/**
 * Server-side read helpers for the epics data model.
 *
 * An epic is a topic collection (IEA, Epstein, …) that has a bespoke landing
 * page and a curated set of vizmaya stories. Tables: `epics`, `story_epics`,
 * plus per-epic data tables like `iea_news` / `iea_countries`.
 *
 * Schema: supabase/vizmaya-fyi/migrations/015_epics_iea.sql
 */

import { createServiceClient } from './supabase'

export interface Epic {
  slug: string
  name: string
  description: string | null
  landingComponent: string
  theme: Record<string, unknown>
  appSlug: string
  showOnHome: boolean
  /** Evergreen pillar narrative (markdown). See migration 058. */
  explainer: string | null
  /** Key-takeaways bullets for the pillar SEO block. */
  takeaways: string[]
  keywords: string[]
  datePublished: string | null
  dateModified: string | null
}

const EPIC_BASE_COLUMNS = 'slug, name, description, landing_component, theme, app_slug, show_on_home'
const EPIC_PILLAR_COLUMNS = 'explainer, takeaways, keywords, date_published, date_modified'
const EPIC_COLUMNS = `${EPIC_BASE_COLUMNS}, ${EPIC_PILLAR_COLUMNS}`

// Postgres "undefined column" (42703). Lets epic reads degrade gracefully when
// the code is deployed ahead of migration 058 — the pillar fields just read as
// empty rather than 500-ing the existing epic landings.
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

function mapEpicRow(data: any): Epic {
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    landingComponent: data.landing_component,
    theme: (data.theme as Record<string, unknown>) ?? {},
    appSlug: (data.app_slug as string | undefined) ?? 'vizmaya-fyi',
    showOnHome: (data.show_on_home as boolean | undefined) ?? true,
    explainer: (data.explainer as string | null) ?? null,
    takeaways: Array.isArray(data.takeaways) ? (data.takeaways as string[]) : [],
    keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
    datePublished: (data.date_published as string | null) ?? null,
    dateModified: (data.date_modified as string | null) ?? null,
  }
}

// Read one epic row, retrying with base columns if the pillar columns aren't
// there yet (pre-migration-058 deploys).
async function readEpicRow(slug: string, publishedOnly: boolean): Promise<Epic | null> {
  const sb = createServiceClient()
  const run = (cols: string) => {
    let q = sb.from('epics').select(cols).eq('slug', slug)
    if (publishedOnly) q = q.eq('status', 'published')
    return q.maybeSingle()
  }
  let { data, error } = await run(EPIC_COLUMNS)
  if (error && isMissingColumnError(error)) {
    ;({ data, error } = await run(EPIC_BASE_COLUMNS))
  }
  if (error) throw new Error(`readEpicRow ${slug}: ${error.message}`)
  return data ? mapEpicRow(data) : null
}

export async function getEpic(slug: string): Promise<Epic | null> {
  return readEpicRow(slug, true)
}

// Admin read: returns the row even if it's not in the published status.
export async function getEpicForAdmin(slug: string): Promise<Epic | null> {
  return readEpicRow(slug, false)
}

export async function listEpics(): Promise<Pick<Epic, 'slug' | 'name' | 'appSlug'>[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, app_slug')
    .order('name', { ascending: true })
  if (error) throw new Error(`listEpics: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug,
    name: r.name,
    appSlug: (r.app_slug as string | undefined) ?? 'vizmaya-fyi',
  }))
}

export async function setEpicApp(epicSlug: string, appSlug: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb
    .from('epics')
    .update({ app_slug: appSlug, updated_at: new Date().toISOString() })
    .eq('slug', epicSlug)
  if (error) throw new Error(`setEpicApp ${epicSlug}: ${error.message}`)
}

export interface PublishedEpic {
  slug: string
  name: string
  description: string | null
  /** Per-epic theme override (loose jsonb; may be `{}` — see migration 017). */
  theme: Record<string, unknown>
}

export async function listPublishedEpics(): Promise<PublishedEpic[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description, theme')
    .eq('status', 'published')
    .order('name', { ascending: true })
  if (error) throw new Error(`listPublishedEpics: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    theme: (r.theme as Record<string, unknown>) ?? {},
  }))
}

// Subset of listPublishedEpics that respects the per-epic `show_on_home`
// flag. Used by the vizmaya.fyi home page Epics grid only — the sitemap and
// direct /epic/<slug> URLs still surface every published epic.
//
// Pass `appSlug` to scope the result to a single app's epics. Without it the
// query returns every published, home-listed epic across all apps.
export async function listEpicsForHome(appSlug?: string): Promise<PublishedEpic[]> {
  const sb = createServiceClient()
  let query = sb
    .from('epics')
    .select('slug, name, description, theme')
    .eq('status', 'published')
    .eq('show_on_home', true)
  if (appSlug) query = query.eq('app_slug', appSlug)
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw new Error(`listEpicsForHome: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    theme: (r.theme as Record<string, unknown>) ?? {},
  }))
}

export async function setEpicShowOnHome(slug: string, showOnHome: boolean): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb
    .from('epics')
    .update({ show_on_home: showOnHome, updated_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) throw new Error(`setEpicShowOnHome ${slug}: ${error.message}`)
}

export async function updateEpicTheme(slug: string, theme: Record<string, unknown>): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb
    .from('epics')
    .update({ theme, updated_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) throw new Error(`updateEpicTheme ${slug}: ${error.message}`)
}

export interface EpicStory {
  slug: string
  title: string
  position: number | null
}

export async function getEpicStories(epicSlug: string): Promise<EpicStory[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_epics')
    .select('position, stories!inner(slug, title, status)')
    .eq('epic_slug', epicSlug)
    .order('position', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`getEpicStories ${epicSlug}: ${error.message}`)
  // Supabase's join shape can be either a single row or an array depending on
  // the FK direction; normalise to a single object before reading fields.
  return (data ?? [])
    .map((r: any) => ({
      ...r,
      story: Array.isArray(r.stories) ? r.stories[0] : r.stories,
    }))
    .filter((r) => r.story?.status === 'published')
    .map((r) => ({
      slug: r.story.slug as string,
      title: r.story.title as string,
      position: r.position as number | null,
    }))
}

// The published epics a story belongs to — the upward edge of the topic
// cluster, used to render the story → epic breadcrumb and related-stories rail.
// Tolerates a missing Supabase env (returns []) so the fs-first story route and
// dev builds without service credentials don't crash.
export async function getEpicsForStory(
  storySlug: string,
): Promise<Pick<Epic, 'slug' | 'name'>[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return []
  }
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_epics')
    .select('epics!inner(slug, name, status)')
    .eq('story_slug', storySlug)
  if (error) throw new Error(`getEpicsForStory ${storySlug}: ${error.message}`)
  return (data ?? [])
    .map((r: any) => (Array.isArray(r.epics) ? r.epics[0] : r.epics))
    .filter((e: any) => e && e.status === 'published')
    .map((e: any) => ({ slug: e.slug as string, name: e.name as string }))
}

// Admin: every story plus whether it currently belongs to the given epic and
// its position. Includes draft/archived stories so the editor can stage
// memberships before publishing.
export interface EpicMembershipRow {
  slug: string
  title: string
  status: string
  appSlug: string | null
  inEpic: boolean
  position: number | null
}

export async function getEpicMemberships(epicSlug: string): Promise<EpicMembershipRow[]> {
  const sb = createServiceClient()
  const [storiesR, membersR] = await Promise.all([
    sb.from('stories').select('slug, title, status, app_slug'),
    sb.from('story_epics').select('story_slug, position').eq('epic_slug', epicSlug),
  ])
  if (storiesR.error) throw new Error(`getEpicMemberships stories: ${storiesR.error.message}`)
  if (membersR.error) throw new Error(`getEpicMemberships members: ${membersR.error.message}`)

  const positions = new Map<string, number | null>()
  for (const m of (membersR.data ?? []) as { story_slug: string; position: number | null }[]) {
    positions.set(m.story_slug, m.position)
  }

  return ((storiesR.data ?? []) as {
    slug: string
    title: string | null
    status: string
    app_slug: string | null
  }[])
    .map((s) => ({
      slug: s.slug,
      title: s.title ?? s.slug,
      status: s.status,
      appSlug: s.app_slug ?? null,
      inEpic: positions.has(s.slug),
      position: positions.get(s.slug) ?? null,
    }))
    .sort((a, b) => {
      // Members first, sorted by position; then non-members alphabetically.
      if (a.inEpic !== b.inEpic) return a.inEpic ? -1 : 1
      if (a.inEpic) {
        const ap = a.position ?? Number.POSITIVE_INFINITY
        const bp = b.position ?? Number.POSITIVE_INFINITY
        if (ap !== bp) return ap - bp
      }
      return a.title.localeCompare(b.title)
    })
}

// Replace the full set of story_epics rows for an epic with the given list.
// Deletes anything not in the target, then upserts the target — Supabase JS
// has no transactions, but the delete-then-upsert window is acceptable for
// an admin-only tool.
export async function setEpicMemberships(
  epicSlug: string,
  memberships: { storySlug: string; position: number | null }[],
): Promise<void> {
  const sb = createServiceClient()
  const targetSlugs = memberships.map((m) => m.storySlug)

  // Delete rows for this epic that aren't in the target list.
  let del = sb.from('story_epics').delete().eq('epic_slug', epicSlug)
  if (targetSlugs.length > 0) {
    del = del.not('story_slug', 'in', `(${targetSlugs.map((s) => `"${s}"`).join(',')})`)
  }
  const { error: delError } = await del
  if (delError) throw new Error(`setEpicMemberships delete: ${delError.message}`)

  if (memberships.length === 0) return

  const { error: upsertError } = await sb
    .from('story_epics')
    .upsert(
      memberships.map((m) => ({
        epic_slug: epicSlug,
        story_slug: m.storySlug,
        position: m.position,
      })),
      { onConflict: 'story_slug,epic_slug' },
    )
  if (upsertError) throw new Error(`setEpicMemberships upsert: ${upsertError.message}`)
}

// ---------------------------------------------------------------------------
// IEA-specific reads.

export interface IeaNewsItem {
  id: number
  url: string
  title: string
  summary: string | null
  publishedAt: string
  countryCodes: string[]
  topics: string[]
}

export async function getIeaNewsSince(daysAgo: number): Promise<IeaNewsItem[]> {
  const sb = createServiceClient()
  const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('iea_news')
    .select('id, source_url, title, summary, published_at, country_codes, topics')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
  if (error) throw new Error(`getIeaNewsSince: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id as number,
    url: r.source_url as string,
    title: r.title as string,
    summary: r.summary as string | null,
    publishedAt: r.published_at as string,
    countryCodes: (r.country_codes as string[]) ?? [],
    topics: (r.topics as string[]) ?? [],
  }))
}

export interface IeaCountry {
  code: string
  name: string
  lat: number
  lng: number
  summary: string | null
}

export async function getIeaCountries(): Promise<IeaCountry[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('iea_countries')
    .select('code, name, lat, lng, summary')
    .order('name', { ascending: true })
  if (error) throw new Error(`getIeaCountries: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    code: r.code as string,
    name: r.name as string,
    lat: r.lat as number,
    lng: r.lng as number,
    summary: r.summary as string | null,
  }))
}

// ---------------------------------------------------------------------------
// Per-country energy profile — backs /api/energy-profile/country/[code] and
// the CountryDetail sheet on /energy-profile. Indicator keys mirror
// scripts/energy-profile/import-owid.ts. Table/function names stay iea_*
// because the underlying DB tables weren't renamed when the epic was.

// Stacked-area "energy mix" sources, in the order we want them to stack.
// `key` is the suffix appended to `elec_share_*` and `primary_share_*` in the
// indicator table.
export const MIX_SOURCES = [
  { key: 'coal', label: 'Coal' },
  { key: 'gas', label: 'Gas' },
  { key: 'oil', label: 'Oil' },
  { key: 'nuclear', label: 'Nuclear' },
  { key: 'hydro', label: 'Hydro' },
  { key: 'wind', label: 'Wind' },
  { key: 'solar', label: 'Solar' },
  { key: 'biofuel', label: 'Bioenergy' },
  { key: 'other_renew', label: 'Other renewables' },
] as const

export type MixSourceKey = typeof MIX_SOURCES[number]['key']
export type MixSourceLabel = typeof MIX_SOURCES[number]['label']

export interface DominantEnergySource {
  sourceKey: MixSourceKey
  sourceLabel: MixSourceLabel
  share: number
  year: number
  // 'primary' = derived from primary_share_* (full energy footprint, ~80 countries).
  // 'electricity' = derived from elec_share_* (electricity generation only, ~190
  // countries — used as fallback wherever OWID has no primary-mix coverage).
  derivedFrom: 'primary' | 'electricity'
}

type EnergyRowRaw = { country_code: string; indicator: string; year: number; value: number }

async function pageAllShareRows(
  sb: ReturnType<typeof createServiceClient>,
  prefix: 'primary_share' | 'elec_share',
): Promise<EnergyRowRaw[]> {
  const indicators = MIX_SOURCES.map((s) => `${prefix}_${s.key}`)
  const rows: EnergyRowRaw[] = []
  // PostgREST `max-rows` defaults to 1000 per response on Supabase. Page in
  // 1000-row chunks until the batch is short. Sort is required so
  // pagination is deterministic across requests.
  const pageSize = 1000
  for (let page = 0; page < 60; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await sb
      .from('iea_country_energy')
      .select('country_code, indicator, year, value')
      .in('indicator', indicators)
      .not('value', 'is', null)
      .order('country_code', { ascending: true })
      .order('indicator', { ascending: true })
      .order('year', { ascending: true })
      .range(from, to)
    if (error) throw new Error(`pageAllShareRows(${prefix}): ${error.message}`)
    const batch = (data ?? []) as EnergyRowRaw[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

function buildDominantFromRows(
  rows: EnergyRowRaw[],
  prefix: 'primary_share' | 'elec_share',
  derivedFrom: 'primary' | 'electricity',
): Record<string, DominantEnergySource> {
  const indicatorToSource = new Map<string, { key: MixSourceKey; label: MixSourceLabel; order: number }>()
  MIX_SOURCES.forEach((s, idx) => {
    indicatorToSource.set(`${prefix}_${s.key}`, { key: s.key, label: s.label, order: idx })
  })

  // country_code -> year -> Map<sourceKey, { value, order }>
  const byCountry = new Map<string, Map<number, Map<MixSourceKey, { value: number; order: number }>>>()
  for (const row of rows) {
    const src = indicatorToSource.get(row.indicator)
    if (!src) continue
    let yearMap = byCountry.get(row.country_code)
    if (!yearMap) { yearMap = new Map(); byCountry.set(row.country_code, yearMap) }
    let sourceMap = yearMap.get(row.year)
    if (!sourceMap) { sourceMap = new Map(); yearMap.set(row.year, sourceMap) }
    sourceMap.set(src.key, { value: row.value, order: src.order })
  }

  const result: Record<string, DominantEnergySource> = {}
  for (const [code, yearMap] of byCountry.entries()) {
    let bestYear = -Infinity
    for (const y of yearMap.keys()) if (y > bestYear) bestYear = y
    const sourceMap = yearMap.get(bestYear)
    if (!sourceMap || sourceMap.size === 0) continue

    let topKey: MixSourceKey | null = null
    let topValue = -Infinity
    let topOrder = Infinity
    for (const [key, { value, order }] of sourceMap.entries()) {
      if (value > topValue || (value === topValue && order < topOrder)) {
        topKey = key
        topValue = value
        topOrder = order
      }
    }
    if (!topKey) continue
    const label = MIX_SOURCES[topOrder].label
    result[code] = { sourceKey: topKey, sourceLabel: label, share: topValue, year: bestYear, derivedFrom }
  }

  return result
}

/**
 * For every country in `iea_country_energy`, returns the source with the
 * largest share in the latest year that has data. Used by the
 * `/energy-profile` choropleth to color the world map.
 *
 * Source preference per country:
 *   1. Primary energy mix (`primary_share_*`) — full footprint, ~80 countries.
 *   2. Electricity mix (`elec_share_*`) — generation only, ~190 countries.
 *      Used as fallback wherever OWID has no primary-mix coverage.
 *
 * Countries with neither family populated are absent from the result.
 * Tie-breaker within a year: declaration order in MIX_SOURCES.
 *
 * Pagination: PostgREST caps responses (Supabase default ~1000 rows), so we
 * page through both indicator families until exhausted.
 */
export async function getDominantEnergySourceByCountry(): Promise<
  Record<string, DominantEnergySource>
> {
  const sb = createServiceClient()
  const [primaryRows, elecRows] = await Promise.all([
    pageAllShareRows(sb, 'primary_share'),
    pageAllShareRows(sb, 'elec_share'),
  ])
  const primary = buildDominantFromRows(primaryRows, 'primary_share', 'primary')
  const elec = buildDominantFromRows(elecRows, 'elec_share', 'electricity')

  // Prefer primary; fall back to electricity where primary is missing.
  const merged: Record<string, DominantEnergySource> = { ...elec, ...primary }
  return merged
}

const TILE_INDICATORS = [
  'energy_per_capita_kwh',
  'ghg_from_energy_mt',
  'renewables_share_energy',
  'electricity_demand_twh',
] as const

export interface ChartSeries {
  name: string
  values: (number | null)[]
}

export interface IeaCountryProfile {
  code: string
  name: string
  summary: string | null
  // Latest non-null value per tile indicator. `null` when the country has no
  // data for that indicator in any year.
  latest: Record<string, { year: number; value: number } | null>
  timeseries: {
    electricityMix: { years: number[]; series: ChartSeries[] }
    primaryEnergyMix: { years: number[]; series: ChartSeries[] }
    co2: { years: number[]; values: (number | null)[] }
    renewablesShare: { years: number[]; values: (number | null)[] }
    // Monthly IEA retail prices, last ~60 months (USD/L).
    // `months` is ISO YYYY-MM. Empty for countries outside the IEA monthly
    // excerpt (only ~33 countries are covered).
    oilPrices: {
      months: string[]
      gasoline: (number | null)[]
      diesel: (number | null)[]
    }
  }
  news: IeaNewsItem[]
}

interface EnergyRow {
  indicator: string
  year: number
  value: number | null
}

/**
 * Returns null when the country code isn't in iea_countries at all. Returns a
 * profile with empty timeseries when the country exists but has no energy
 * rows yet (e.g. before the importer has run for a new country).
 */
export async function getIeaCountryProfile(
  code: string,
  opts?: { newsDays?: number },
): Promise<IeaCountryProfile | null> {
  const sb = createServiceClient()
  const newsDays = opts?.newsDays ?? 30

  const [countryR, energyR, newsR, oilR] = await Promise.all([
    sb
      .from('iea_countries')
      .select('code, name, summary')
      .eq('code', code)
      .maybeSingle(),
    sb
      .from('iea_country_energy')
      .select('indicator, year, value')
      .eq('country_code', code)
      .order('year', { ascending: true }),
    sb
      .from('iea_news')
      .select('id, source_url, title, summary, published_at, country_codes, topics')
      .contains('country_codes', [code])
      .gte(
        'published_at',
        new Date(Date.now() - newsDays * 24 * 60 * 60 * 1000).toISOString(),
      )
      .order('published_at', { ascending: false }),
    sb
      .from('iea_oil_prices_monthly')
      .select('product, month, value')
      .eq('country_code', code)
      .eq('currency', 'USD')
      .in('product', ['gasoline', 'diesel'])
      .order('month', { ascending: true }),
  ])

  if (countryR.error) throw new Error(`getIeaCountryProfile(${code}) country: ${countryR.error.message}`)
  if (!countryR.data) return null
  if (energyR.error) throw new Error(`getIeaCountryProfile(${code}) energy: ${energyR.error.message}`)
  if (newsR.error) throw new Error(`getIeaCountryProfile(${code}) news: ${newsR.error.message}`)
  // Oil prices are optional — only the 33 IEA-excerpt countries have rows.
  // Treat a query error as "no data" rather than failing the whole profile.
  if (oilR.error) console.warn(`getIeaCountryProfile(${code}) oil prices: ${oilR.error.message}`)

  const rows = (energyR.data ?? []) as EnergyRow[]

  // Index by indicator → year for quick lookups when shaping the charts.
  const byIndicator = new Map<string, Map<number, number | null>>()
  const allYears = new Set<number>()
  for (const r of rows) {
    if (!byIndicator.has(r.indicator)) byIndicator.set(r.indicator, new Map())
    byIndicator.get(r.indicator)!.set(r.year, r.value)
    allYears.add(r.year)
  }

  const years = [...allYears].sort((a, b) => a - b)

  const buildMix = (prefix: 'elec_share' | 'primary_share') => {
    const series: ChartSeries[] = MIX_SOURCES.map((src) => {
      const m = byIndicator.get(`${prefix}_${src.key}`)
      return {
        name: src.label,
        values: years.map((y) => (m?.has(y) ? m.get(y) ?? null : null)),
      }
    })
    return { years, series }
  }

  const buildSingle = (indicator: string) => {
    const m = byIndicator.get(indicator)
    return {
      years,
      values: years.map((y) => (m?.has(y) ? m.get(y) ?? null : null)),
    }
  }

  const latest: Record<string, { year: number; value: number } | null> = {}
  for (const indicator of TILE_INDICATORS) {
    const m = byIndicator.get(indicator)
    if (!m) { latest[indicator] = null; continue }
    let bestYear = -Infinity
    let bestValue: number | null = null
    for (const [y, v] of m.entries()) {
      if (v != null && y > bestYear) { bestYear = y; bestValue = v }
    }
    latest[indicator] = bestValue != null
      ? { year: bestYear, value: bestValue }
      : null
  }

  // Shape the oil-price rows for the chart. Keep the last 60 months so the
  // chart stays readable on a small panel; older history is still in the
  // table for stories that want a longer window.
  const oilRows = (oilR.data ?? []) as { product: string; month: string; value: number }[]
  const monthsSet = new Set<string>()
  for (const row of oilRows) monthsSet.add(row.month.slice(0, 7))
  const allMonths = [...monthsSet].sort()
  const recentMonths = allMonths.slice(-60)
  const gasolineByMonth = new Map<string, number>()
  const dieselByMonth = new Map<string, number>()
  for (const row of oilRows) {
    const m = row.month.slice(0, 7)
    if (row.product === 'gasoline') gasolineByMonth.set(m, row.value)
    else if (row.product === 'diesel') dieselByMonth.set(m, row.value)
  }
  const oilPrices = {
    months: recentMonths,
    gasoline: recentMonths.map((m) => gasolineByMonth.get(m) ?? null),
    diesel: recentMonths.map((m) => dieselByMonth.get(m) ?? null),
  }

  return {
    code: countryR.data.code as string,
    name: countryR.data.name as string,
    summary: (countryR.data.summary as string | null) ?? null,
    latest,
    timeseries: {
      electricityMix: buildMix('elec_share'),
      primaryEnergyMix: buildMix('primary_share'),
      co2: buildSingle('ghg_from_energy_mt'),
      renewablesShare: buildSingle('renewables_share_elec'),
      oilPrices,
    },
    news: (newsR.data ?? []).map((r: any) => ({
      id: r.id as number,
      url: r.source_url as string,
      title: r.title as string,
      summary: r.summary as string | null,
      publishedAt: r.published_at as string,
      countryCodes: (r.country_codes as string[]) ?? [],
      topics: (r.topics as string[]) ?? [],
    })),
  }
}

// ---------------------------------------------------------------------------
// AI Data Centers epic — backs /ai-data-centers and
// /api/ai-data-centers[/[slug]]. Tables dc_facilities / dc_facility_timeline
// (migration 063), filled weekly from Epoch AI's Frontier Data Centers Hub
// (CC BY 4.0) by scripts/ai-data-centers/import-data-centers.ts.

export interface DcFacility {
  slug: string
  name: string
  owner: string | null
  users: string | null
  project: string | null
  country: string | null
  address: string | null
  lat: number | null
  lng: number | null
  h100Equivalents: number | null
  powerMw: number | null
  capexUsdBn: number | null
  investors: string | null
  constructionCompanies: string | null
  energyCompanies: string | null
  notes: string | null
  sources: string | null
}

function mapDcFacilityRow(r: any): DcFacility {
  return {
    slug: r.slug as string,
    name: r.name as string,
    owner: (r.owner as string | null) ?? null,
    users: (r.users as string | null) ?? null,
    project: (r.project as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    h100Equivalents: (r.h100_equivalents as number | null) ?? null,
    powerMw: (r.power_mw as number | null) ?? null,
    capexUsdBn: (r.capex_usd_bn as number | null) ?? null,
    investors: (r.investors as string | null) ?? null,
    constructionCompanies: (r.construction_companies as string | null) ?? null,
    energyCompanies: (r.energy_companies as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    sources: (r.sources as string | null) ?? null,
  }
}

const DC_FACILITY_COLUMNS =
  'slug, name, owner, users, project, country, address, lat, lng, ' +
  'h100_equivalents, power_mw, capex_usd_bn, investors, ' +
  'construction_companies, energy_companies, notes, sources'

export async function listDataCenters(): Promise<DcFacility[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_facilities')
    .select(DC_FACILITY_COLUMNS)
    .order('power_mw', { ascending: false, nullsFirst: false })
  if (error) throw new Error(`listDataCenters: ${error.message}`)
  return (data ?? []).map(mapDcFacilityRow)
}

export const DC_METRICS = [
  { key: 'power_mw', label: 'Power capacity (MW)' },
  { key: 'h100_equivalents', label: 'Compute (H100 equivalents)' },
  { key: 'capex_usd_bn', label: 'Capital cost (2025 USD bn)' },
] as const

export type DcMetricKey = typeof DC_METRICS[number]['key']

export interface DcTimelineSeries {
  metric: DcMetricKey
  /** [ISO date, value] pairs sorted ascending — ECharts time-axis ready. */
  points: [string, number][]
}

export interface DcFacilityProfile extends DcFacility {
  timeline: DcTimelineSeries[]
}

/** Returns null when the slug isn't in dc_facilities at all. */
export async function getDataCenterProfile(slug: string): Promise<DcFacilityProfile | null> {
  const sb = createServiceClient()
  const [facilityR, timelineR] = await Promise.all([
    sb.from('dc_facilities').select(DC_FACILITY_COLUMNS).eq('slug', slug).maybeSingle(),
    sb
      .from('dc_facility_timeline')
      .select('metric, as_of, value')
      .eq('facility_slug', slug)
      .order('as_of', { ascending: true }),
  ])
  if (facilityR.error) {
    throw new Error(`getDataCenterProfile(${slug}) facility: ${facilityR.error.message}`)
  }
  if (!facilityR.data) return null
  if (timelineR.error) {
    throw new Error(`getDataCenterProfile(${slug}) timeline: ${timelineR.error.message}`)
  }

  const rows = (timelineR.data ?? []) as { metric: string; as_of: string; value: number }[]
  const timeline: DcTimelineSeries[] = DC_METRICS.map((m) => ({
    metric: m.key,
    points: rows
      .filter((r) => r.metric === m.key)
      .map((r) => [r.as_of, r.value] as [string, number]),
  })).filter((s) => s.points.length > 0)

  return { ...mapDcFacilityRow(facilityR.data), timeline }
}

// ---------------------------------------------------------------------------
// AI Data Centers news + markets — backs /api/ai-data-centers/news, /stocks
// and /recap. Tables dc_news / dc_stocks / dc_stock_prices (migration 065)
// plus dc_news_recaps (migration 066), filled daily by
// scripts/ai-data-centers/scrape-news.ts, import-stock-prices.ts and
// generate-news-recap.ts.

export interface DcNewsItem {
  id: number
  url: string
  title: string
  summary: string | null
  /** Outlet name (Reuters, Bloomberg, …). */
  source: string | null
  publishedAt: string
  /** Subset of 'ai' | 'data-centers' | 'semiconductors' | 'microprocessors'. */
  topics: string[]
  /** dc_stocks tickers named in the story. */
  tickers: string[]
}

export async function getDcNews(opts?: {
  limit?: number
  topic?: string
  ticker?: string
}): Promise<DcNewsItem[]> {
  const sb = createServiceClient()
  let query = sb
    .from('dc_news')
    .select('id, source_url, title, summary, source, published_at, topics, tickers')
    .eq('relevant', true)
    .order('published_at', { ascending: false })
    .limit(opts?.limit ?? 30)
  if (opts?.topic) query = query.contains('topics', [opts.topic])
  if (opts?.ticker) query = query.contains('tickers', [opts.ticker])
  const { data, error } = await query
  if (error) throw new Error(`getDcNews: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id as number,
    url: r.source_url as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    publishedAt: r.published_at as string,
    topics: (r.topics as string[]) ?? [],
    tickers: (r.tickers as string[]) ?? [],
  }))
}

export interface DcNewsRecap {
  id: number
  windowHours: number
  windowStart: string
  windowEnd: string
  /** LLM one-liner for cards/lists; null when the recap is deterministic-only. */
  headline: string | null
  /** The full recap brief, ready to render as markdown. */
  markdown: string
  model: string | null
  articleCount: number
  topics: string[]
  tickers: string[]
  generatedAt: string
}

const DC_RECAP_COLUMNS =
  'id, window_hours, window_start, window_end, headline, markdown, model, ' +
  'article_count, topics, tickers, generated_at'

function mapDcNewsRecapRow(r: any): DcNewsRecap {
  return {
    id: r.id as number,
    windowHours: r.window_hours as number,
    windowStart: r.window_start as string,
    windowEnd: r.window_end as string,
    headline: (r.headline as string | null) ?? null,
    markdown: r.markdown as string,
    model: (r.model as string | null) ?? null,
    articleCount: (r.article_count as number) ?? 0,
    topics: (r.topics as string[]) ?? [],
    tickers: (r.tickers as string[]) ?? [],
    generatedAt: r.generated_at as string,
  }
}

/**
 * Newest recap snapshots first. Rows are written daily (plus any manual
 * dispatches) by scripts/ai-data-centers/generate-news-recap.ts —
 * table dc_news_recaps, migration 066.
 */
export async function listDcNewsRecaps(limit = 14): Promise<DcNewsRecap[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_news_recaps')
    .select(DC_RECAP_COLUMNS)
    .order('generated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listDcNewsRecaps: ${error.message}`)
  return (data ?? []).map(mapDcNewsRecapRow)
}

/** The most recent recap snapshot, or null before the worker's first run. */
export async function getLatestDcNewsRecap(): Promise<DcNewsRecap | null> {
  const recaps = await listDcNewsRecaps(1)
  return recaps[0] ?? null
}

export interface DcNewsAdminItem extends DcNewsItem {
  /** False when the Gemma classifier rejected the article. */
  relevant: boolean
  fetchedAt: string
}

/**
 * Admin variant of getDcNews: can surface classifier-rejected rows and
 * free-text-search titles, so the pipeline dashboard can audit what the
 * relevance gate is doing. Not exposed on the public site.
 */
export async function listDcNewsForAdmin(opts?: {
  limit?: number
  topic?: string
  ticker?: string
  /** Case-insensitive substring match on the title. */
  q?: string
  relevance?: 'all' | 'relevant' | 'rejected'
}): Promise<DcNewsAdminItem[]> {
  const sb = createServiceClient()
  let query = sb
    .from('dc_news')
    .select('id, source_url, title, summary, source, published_at, relevant, topics, tickers, fetched_at')
    .order('published_at', { ascending: false })
    .limit(opts?.limit ?? 50)
  const relevance = opts?.relevance ?? 'relevant'
  if (relevance === 'relevant') query = query.eq('relevant', true)
  if (relevance === 'rejected') query = query.eq('relevant', false)
  if (opts?.topic) query = query.contains('topics', [opts.topic])
  if (opts?.ticker) query = query.contains('tickers', [opts.ticker])
  if (opts?.q) {
    // Escape LIKE wildcards so a literal "%" in the search box doesn't match everything.
    const escaped = opts.q.replace(/[\\%_]/g, '\\$&')
    query = query.ilike('title', `%${escaped}%`)
  }
  const { data, error } = await query
  if (error) throw new Error(`listDcNewsForAdmin: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id as number,
    url: r.source_url as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    publishedAt: r.published_at as string,
    relevant: r.relevant as boolean,
    topics: (r.topics as string[]) ?? [],
    tickers: (r.tickers as string[]) ?? [],
    fetchedAt: r.fetched_at as string,
  }))
}

export interface DcPipelineDay {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string
  relevant: number
  rejected: number
}

export interface DcPipelineStats {
  news: {
    total: number
    relevant: number
    rejected: number
    /** Relevant stories published in the trailing 24h / 7d. */
    relevant24h: number
    relevant7d: number
    latestPublishedAt: string | null
    latestFetchedAt: string | null
    /** Last 14 UTC days by published_at, oldest first, zero-filled. */
    byDay: DcPipelineDay[]
    /** Relevant stories in the last 30d per topic, biggest first. */
    byTopic: { topic: string; count: number }[]
    /** Relevant stories in the last 30d per linked ticker, biggest first. */
    byTicker: { ticker: string; count: number }[]
  }
  recaps: {
    total: number
    latest: DcNewsRecap | null
  }
  stocks: {
    activeTickers: number
    totalTickers: number
    /** Newest close bar across all tickers, null before the first backfill. */
    latestTradeDate: string | null
    /** Active tickers with at least one bar in the trailing 7 days. */
    tickersFresh7d: number
  }
}

/**
 * Health snapshot of the AI Data Centers news + stock pipeline for the admin
 * dashboard: scrape volume and relevance-gate behaviour over the trailing
 * windows, recap-worker freshness, and stock-feed freshness. Counts come from
 * head-only count queries; the per-day/topic/ticker breakdowns aggregate the
 * last 30 days of dc_news rows in process (tens of rows per day, so the
 * 5 000-row ceiling is generous).
 */
export async function getDcPipelineStats(): Promise<DcPipelineStats> {
  const sb = createServiceClient()
  const now = Date.now()
  const DAY_MS = 86_400_000
  const cutoff30d = new Date(now - 30 * DAY_MS).toISOString()
  const cutoff7dDate = new Date(now - 7 * DAY_MS).toISOString().slice(0, 10)

  const [totalR, relevantR, recentR, latestFetchR, latestPubR, recapCountR, recapLatestR, stocksR, latestBarR, freshBarsR] =
    await Promise.all([
      sb.from('dc_news').select('id', { count: 'exact', head: true }),
      sb.from('dc_news').select('id', { count: 'exact', head: true }).eq('relevant', true),
      sb
        .from('dc_news')
        .select('published_at, relevant, topics, tickers')
        .gte('published_at', cutoff30d)
        .limit(5_000),
      sb.from('dc_news').select('fetched_at').order('fetched_at', { ascending: false }).limit(1),
      sb.from('dc_news').select('published_at').order('published_at', { ascending: false }).limit(1),
      sb.from('dc_news_recaps').select('id', { count: 'exact', head: true }),
      sb.from('dc_news_recaps').select(DC_RECAP_COLUMNS).order('generated_at', { ascending: false }).limit(1),
      sb.from('dc_stocks').select('ticker, is_active'),
      sb.from('dc_stock_prices').select('trade_date').order('trade_date', { ascending: false }).limit(1),
      sb.from('dc_stock_prices').select('ticker').gte('trade_date', cutoff7dDate).limit(10_000),
    ])
  for (const [label, r] of [
    ['total', totalR], ['relevant', relevantR], ['recent', recentR],
    ['latestFetch', latestFetchR], ['latestPub', latestPubR],
    ['recapCount', recapCountR], ['recapLatest', recapLatestR],
    ['stocks', stocksR], ['latestBar', latestBarR], ['freshBars', freshBarsR],
  ] as const) {
    if (r.error) throw new Error(`getDcPipelineStats ${label}: ${r.error.message}`)
  }

  const total = totalR.count ?? 0
  const relevant = relevantR.count ?? 0

  // Zero-filled 14-day scaffold so the volume chart shows quiet days too.
  const byDayMap = new Map<string, DcPipelineDay>()
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10)
    byDayMap.set(day, { day, relevant: 0, rejected: 0 })
  }
  const topicCounts = new Map<string, number>()
  const tickerCounts = new Map<string, number>()
  let relevant24h = 0
  let relevant7d = 0
  const recent = (recentR.data ?? []) as {
    published_at: string
    relevant: boolean
    topics: string[] | null
    tickers: string[] | null
  }[]
  for (const row of recent) {
    const ts = Date.parse(row.published_at)
    const bucket = byDayMap.get(row.published_at.slice(0, 10))
    if (bucket) {
      if (row.relevant) bucket.relevant += 1
      else bucket.rejected += 1
    }
    if (!row.relevant) continue
    if (now - ts <= DAY_MS) relevant24h += 1
    if (now - ts <= 7 * DAY_MS) relevant7d += 1
    for (const t of row.topics ?? []) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
    for (const t of row.tickers ?? []) tickerCounts.set(t, (tickerCounts.get(t) ?? 0) + 1)
  }
  const descending = (a: { count: number }, b: { count: number }) => b.count - a.count

  const stocks = (stocksR.data ?? []) as { ticker: string; is_active: boolean }[]
  const activeTickers = new Set(stocks.filter((s) => s.is_active).map((s) => s.ticker))
  const freshTickers = new Set(
    ((freshBarsR.data ?? []) as { ticker: string }[])
      .map((b) => b.ticker)
      .filter((t) => activeTickers.has(t)),
  )

  return {
    news: {
      total,
      relevant,
      rejected: total - relevant,
      relevant24h,
      relevant7d,
      latestPublishedAt: (latestPubR.data?.[0]?.published_at as string | undefined) ?? null,
      latestFetchedAt: (latestFetchR.data?.[0]?.fetched_at as string | undefined) ?? null,
      byDay: [...byDayMap.values()],
      byTopic: [...topicCounts].map(([topic, count]) => ({ topic, count })).sort(descending),
      byTicker: [...tickerCounts].map(([ticker, count]) => ({ ticker, count })).sort(descending),
    },
    recaps: {
      total: recapCountR.count ?? 0,
      latest: recapLatestR.data?.[0] ? mapDcNewsRecapRow(recapLatestR.data[0]) : null,
    },
    stocks: {
      activeTickers: activeTickers.size,
      totalTickers: stocks.length,
      latestTradeDate: (latestBarR.data?.[0]?.trade_date as string | undefined) ?? null,
      tickersFresh7d: freshTickers.size,
    },
  }
}

export interface DcStock {
  /** Yahoo Finance symbol of the home listing (NVDA, 2317.TW, 8035.T, …). */
  ticker: string
  name: string
  exchange: string
  /** Market code: US | TW | KR | JP | NL | HK. */
  market: string
  currency: string
  category: 'semiconductors' | 'semi-equipment' | 'hyperscalers' | 'data-centers'
}

export interface DcStockSeries extends DcStock {
  /** [trade_date, close] pairs sorted ascending — ECharts time-axis ready. */
  points: [string, number][]
  latestClose: number | null
  latestDate: string | null
  /** % change first→last close over the window; null with <2 points. */
  changePct: number | null
}

/**
 * Every active tracked stock with its close series over the trailing window.
 * Tickers with no bars yet (pre-backfill) still appear, with empty points —
 * the UI can grey them out rather than lose the registry row.
 */
export async function getDcStockMarket(days = 90): Promise<DcStockSeries[]> {
  const sb = createServiceClient()
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const [stocksR, pricesR] = await Promise.all([
    sb
      .from('dc_stocks')
      .select('ticker, name, exchange, market, currency, category')
      .eq('is_active', true)
      .order('category')
      .order('ticker'),
    sb
      .from('dc_stock_prices')
      .select('ticker, trade_date, close')
      .gte('trade_date', cutoff)
      .order('trade_date', { ascending: true })
      // PostgREST defaults to 1000 rows; ~30 tickers × 260 trading days of a
      // 1y window needs an explicit ceiling.
      .limit(50_000),
  ])
  if (stocksR.error) throw new Error(`getDcStockMarket stocks: ${stocksR.error.message}`)
  if (pricesR.error) throw new Error(`getDcStockMarket prices: ${pricesR.error.message}`)

  const pointsByTicker = new Map<string, [string, number][]>()
  for (const r of (pricesR.data ?? []) as { ticker: string; trade_date: string; close: number }[]) {
    if (!pointsByTicker.has(r.ticker)) pointsByTicker.set(r.ticker, [])
    pointsByTicker.get(r.ticker)!.push([r.trade_date, r.close])
  }

  return ((stocksR.data ?? []) as DcStock[]).map((stock) => {
    const points = pointsByTicker.get(stock.ticker) ?? []
    const first = points[0] ?? null
    const last = points.length > 0 ? points[points.length - 1] : null
    return {
      ...stock,
      points,
      latestClose: last?.[1] ?? null,
      latestDate: last?.[0] ?? null,
      changePct:
        first && last && points.length > 1 && first[1] !== 0
          ? ((last[1] - first[1]) / first[1]) * 100
          : null,
    }
  })
}

/** One daily bar destined for dc_stock_prices. */
export interface DcStockPriceRow {
  ticker: string
  trade_date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

/** A non-US tracked stock the admin can hand-upload Stooq CSV prices for. */
export interface DcStockUploadTarget {
  ticker: string
  name: string
  market: string
  /** Most recent trade_date already stored, or null if none yet. */
  latestDate: string | null
  /** How many bars are stored for this ticker. */
  bars: number
}

/**
 * The international (non-US) tracked stocks plus their current price coverage,
 * for the admin "upload international prices" panel. US tickers are excluded —
 * they come from massive.com in CI; only the non-US names are hand-uploaded.
 */
export async function listDcStockUploadTargets(): Promise<DcStockUploadTarget[]> {
  const sb = createServiceClient()
  const { data: stocks, error } = await sb
    .from('dc_stocks')
    .select('ticker, name, market')
    .eq('is_active', true)
    .neq('market', 'US')
    .order('market')
    .order('ticker')
  if (error) throw new Error(`listDcStockUploadTargets stocks: ${error.message}`)
  const rows = (stocks ?? []) as { ticker: string; name: string; market: string }[]
  const tickers = rows.map((s) => s.ticker)

  const latest = new Map<string, string>()
  const bars = new Map<string, number>()
  if (tickers.length > 0) {
    const { data: prices, error: pErr } = await sb
      .from('dc_stock_prices')
      .select('ticker, trade_date')
      .in('ticker', tickers)
      .order('trade_date', { ascending: false })
      .limit(50_000)
    if (pErr) throw new Error(`listDcStockUploadTargets prices: ${pErr.message}`)
    for (const r of (prices ?? []) as { ticker: string; trade_date: string }[]) {
      if (!latest.has(r.ticker)) latest.set(r.ticker, r.trade_date) // desc ⇒ first is newest
      bars.set(r.ticker, (bars.get(r.ticker) ?? 0) + 1)
    }
  }
  return rows.map((s) => ({
    ticker: s.ticker,
    name: s.name,
    market: s.market,
    latestDate: latest.get(s.ticker) ?? null,
    bars: bars.get(s.ticker) ?? 0,
  }))
}

/**
 * Parse a daily-OHLCV CSV into dc_stock_prices rows for one ticker. Columns are
 * resolved by header name, so it accepts Stooq's `Date,Open,High,Low,Close,
 * Volume` and any export with those named columns (e.g. Yahoo's, whose extra
 * `Adj Close` is ignored). The CSV has no symbol, so the ticker is supplied by
 * the caller. Only `YYYY-MM-DD` rows with a finite close are kept; volume is
 * rounded to whole shares; duplicate dates collapse to the last bar. Throws if
 * the header lacks Date/Close — e.g. when Stooq serves an "Access denied" /
 * rate-limit page instead of data.
 */
export function parseStooqCsv(csvText: string, ticker: string): DcStockPriceRow[] {
  const numOrNull = (s: string | undefined): number | null => {
    // Number('') and Number('  ') are 0, not NaN — treat blanks as missing.
    if (s == null || s.trim() === '') return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const lines = csvText.trim().split(/\r?\n/)
  // Resolve columns by header name so Stooq, Yahoo (extra Adj Close), etc. all
  // work regardless of order.
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase())
  const di = header.indexOf('date')
  const ci = header.indexOf('close')
  if (di < 0 || ci < 0) {
    const preview = (lines[0] ?? '').slice(0, 80).replace(/\s+/g, ' ').trim()
    throw new Error(
      `${ticker}: not a daily-OHLCV CSV — need Date + Close columns. Got: "${preview || 'empty file'}"`
    )
  }
  const oi = header.indexOf('open')
  const hi = header.indexOf('high')
  const lo = header.indexOf('low')
  const vi = header.indexOf('volume')
  const at = (cols: string[], i: number) => (i >= 0 ? cols[i] : undefined)

  const byDate = new Map<string, DcStockPriceRow>()
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const date = at(cols, di)?.trim()
    const close = Number(at(cols, ci))
    // Skip blank/`N/D` closes and any non-ISO date (stray header/footer rows).
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close)) continue
    const vol = numOrNull(at(cols, vi))
    byDate.set(date, {
      ticker,
      trade_date: date, // already the local trading day
      open: numOrNull(at(cols, oi)),
      high: numOrNull(at(cols, hi)),
      low: numOrNull(at(cols, lo)),
      close,
      volume: vol == null ? null : Math.round(vol),
    })
  }
  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
}

/** Upsert daily bars into dc_stock_prices (idempotent on ticker+trade_date). */
export async function upsertDcStockPrices(rows: DcStockPriceRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const sb = createServiceClient()
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await sb
      .from('dc_stock_prices')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'ticker,trade_date' })
    if (error) throw new Error(`upsertDcStockPrices: ${error.message}`)
  }
  return rows.length
}
