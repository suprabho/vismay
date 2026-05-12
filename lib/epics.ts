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
}

export async function getEpic(slug: string): Promise<Epic | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description, landing_component, theme')
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
  }
}

// Admin read: returns the row even if it's not in the published status.
export async function getEpicForAdmin(slug: string): Promise<Epic | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description, landing_component, theme')
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
  }
}

export async function listEpics(): Promise<Pick<Epic, 'slug' | 'name'>[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name')
    .order('name', { ascending: true })
  if (error) throw new Error(`listEpics: ${error.message}`)
  return (data ?? []).map((r: any) => ({ slug: r.slug, name: r.name }))
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

export async function updateEpicTheme(slug: string, theme: Record<string, string>): Promise<void> {
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
// Per-country energy profile — backs /api/iea/country/[code] and the
// CountryDetail sheet on /iea. Indicator keys mirror scripts/iea/import-owid.ts.

// Stacked-area "energy mix" sources, in the order we want them to stack.
// `key` is the suffix appended to `elec_share_*` and `primary_share_*` in the
// indicator table.
const MIX_SOURCES = [
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

  const [countryR, energyR, newsR] = await Promise.all([
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
  ])

  if (countryR.error) throw new Error(`getIeaCountryProfile(${code}) country: ${countryR.error.message}`)
  if (!countryR.data) return null
  if (energyR.error) throw new Error(`getIeaCountryProfile(${code}) energy: ${energyR.error.message}`)
  if (newsR.error) throw new Error(`getIeaCountryProfile(${code}) news: ${newsR.error.message}`)

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
