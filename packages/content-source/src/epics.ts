/**
 * Server-side read helpers for the epics data model.
 *
 * An epic is a topic collection (IEA, Epstein, …) that has a bespoke landing
 * page and a curated set of vizmaya stories. Tables: `epics`, `story_epics`,
 * plus per-epic data tables like `iea_news` / `iea_countries`.
 *
 * Schema: supabase/migrations/015_epics_iea.sql
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
}

export async function getEpic(slug: string): Promise<Epic | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description, landing_component, theme, app_slug, show_on_home')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error(`getEpic ${slug}: ${error.message}`)
  if (!data) return null
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    landingComponent: data.landing_component,
    theme: (data.theme as Record<string, unknown>) ?? {},
    appSlug: (data.app_slug as string | undefined) ?? 'vizmaya-fyi',
    showOnHome: (data.show_on_home as boolean | undefined) ?? true,
  }
}

// Admin read: returns the row even if it's not in the published status.
export async function getEpicForAdmin(slug: string): Promise<Epic | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description, landing_component, theme, app_slug, show_on_home')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getEpicForAdmin ${slug}: ${error.message}`)
  if (!data) return null
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    landingComponent: data.landing_component,
    theme: (data.theme as Record<string, unknown>) ?? {},
    appSlug: (data.app_slug as string | undefined) ?? 'vizmaya-fyi',
    showOnHome: (data.show_on_home as boolean | undefined) ?? true,
  }
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
}

export async function listPublishedEpics(): Promise<PublishedEpic[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description')
    .eq('status', 'published')
    .order('name', { ascending: true })
  if (error) throw new Error(`listPublishedEpics: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
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
    .select('slug, name, description')
    .eq('status', 'published')
    .eq('show_on_home', true)
  if (appSlug) query = query.eq('app_slug', appSlug)
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw new Error(`listEpicsForHome: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
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

// Admin: every story plus whether it currently belongs to the given epic and
// its position. Includes draft/archived stories so the editor can stage
// memberships before publishing.
export interface EpicMembershipRow {
  slug: string
  title: string
  status: string
  inEpic: boolean
  position: number | null
}

export async function getEpicMemberships(epicSlug: string): Promise<EpicMembershipRow[]> {
  const sb = createServiceClient()
  const [storiesR, membersR] = await Promise.all([
    sb.from('stories').select('slug, title, status'),
    sb.from('story_epics').select('story_slug, position').eq('epic_slug', epicSlug),
  ])
  if (storiesR.error) throw new Error(`getEpicMemberships stories: ${storiesR.error.message}`)
  if (membersR.error) throw new Error(`getEpicMemberships members: ${membersR.error.message}`)

  const positions = new Map<string, number | null>()
  for (const m of (membersR.data ?? []) as { story_slug: string; position: number | null }[]) {
    positions.set(m.story_slug, m.position)
  }

  return ((storiesR.data ?? []) as { slug: string; title: string | null; status: string }[])
    .map((s) => ({
      slug: s.slug,
      title: s.title ?? s.slug,
      status: s.status,
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
