/**
 * Epoch AI Frontier Data Centers importer — pulls Epoch's data_centers.csv
 * (one row per facility) and data_center_timelines.csv (build-out time
 * series) and upserts into dc_facilities / dc_facility_timeline.
 *
 * Source: https://epoch.ai/data/ai-data-centers (CC BY 4.0, refreshed
 * ~weekly). epoch.ai fronts Cloudflare bot detection that 403s some cloud
 * IPs, so the scheduled run lives in GitHub Actions
 * (.github/workflows/import-ai-data-centers.yml); for manual runs you can
 * download the CSVs in a browser and point the script at them:
 *
 *   pnpm ai-data-centers:import
 *   pnpm ai-data-centers:import --facilities path/to/data_centers.csv \
 *     --timelines path/to/data_center_timelines.csv
 *   pnpm ai-data-centers:import --geocode   # print coord suggestions only
 *
 * Without flags it fetches from epoch.ai, falling back to any CSVs present in
 * scripts/ai-data-centers/data/.
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Optional: MAPBOX_TOKEN for --geocode.
 *
 * Idempotency: upserts on (slug) for dc_facilities and
 * (facility_slug, metric, as_of) for dc_facility_timeline, so re-runs only
 * touch rows that changed. lat/lng are never written unless the CSV itself
 * carries coordinate columns — curated values in
 * lib/ai-data-centers/facilityCoords.ts stay authoritative.
 *
 * Header drift: Epoch occasionally renames columns, so every field resolves
 * through normalised aliases (see FACILITY_FIELDS / TIMELINE_FIELDS) and the
 * script logs the raw header row on every run for eyeballing in the Actions
 * log. It fails loudly if 0 facilities parse.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { FACILITY_COORDS } from '../../lib/ai-data-centers/facilityCoords'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const FACILITIES_URLS = [
  'https://epoch.ai/data/generated/data_centers/data_centers.csv',
  'https://epoch.ai/data/data_centers/data_centers.csv',
]
const TIMELINES_URLS = [
  'https://epoch.ai/data/generated/data_centers/data_center_timelines.csv',
  'https://epoch.ai/data/data_centers/data_center_timelines.csv',
]

const DATA_DIR = path.join(process.cwd(), 'scripts/ai-data-centers/data')
const LOCAL_FACILITIES = path.join(DATA_DIR, 'data_centers.csv')
const LOCAL_TIMELINES = path.join(DATA_DIR, 'data_center_timelines.csv')

// ---------------------------------------------------------------------------
// Header-drift-tolerant field resolution. Headers are normalised (lowercase,
// alphanumerics only) and each canonical field tries its aliases in order —
// the generalised version of import-iea-oil-prices.ts's `r.country ?? r.COUNTRY`.

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type FieldSpec = Record<string, string[]>

const FACILITY_FIELDS: FieldSpec = {
  name: ['name', 'datacenter', 'datacentername', 'facility'],
  owner: ['owner', 'owners', 'company'],
  users: ['users', 'user', 'tenants'],
  project: ['project', 'projectname'],
  country: ['country'],
  address: ['address', 'location'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'lon', 'long'],
  h100_equivalents: [
    'currenth100equivalents', 'h100equivalents', 'h100e', 'currenth100e',
  ],
  power_mw: ['currentpowermw', 'powermw', 'currentpower', 'power'],
  capex_usd_bn: [
    'currenttotalcapitalcost2025usdbillions', 'totalcapitalcost2025usdbillions',
    'capitalcostusdbillions', 'capitalcost', 'capex',
  ],
  investors: ['investors', 'investor'],
  construction_companies: ['constructioncompanies', 'constructioncompany', 'builders'],
  energy_companies: ['energycompanies', 'energycompany'],
  notes: ['notes', 'note'],
  sources: ['selectedsources', 'sources', 'source'],
}

const TIMELINE_FIELDS: FieldSpec = {
  name: ['name', 'datacenter', 'datacentername', 'facility'],
  date: ['date', 'time', 'asof', 'month'],
  power_mw: ['powermw', 'currentpowermw', 'power', 'powercapacitymw'],
  h100_equivalents: ['h100equivalents', 'h100e', 'currenth100equivalents', 'compute'],
  capex_usd_bn: [
    'totalcapitalcost2025usdbillions', 'capitalcost2025usdbillions',
    'capitalcostusdbillions', 'capitalcost', 'capex',
  ],
  // Long-form variant: a metric label column + a single value column.
  metric: ['metric', 'indicator', 'variable'],
  value: ['value'],
}

type Resolver = (row: Record<string, string>, field: string) => string | undefined

function buildResolver(headers: string[], fields: FieldSpec, tag: string): Resolver {
  const byNormalized = new Map<string, string>()
  for (const h of headers) byNormalized.set(normalizeHeader(h), h)

  const resolved = new Map<string, string>()
  const missing: string[] = []
  for (const [field, aliases] of Object.entries(fields)) {
    const hit = aliases.find((a) => byNormalized.has(a))
    if (hit) resolved.set(field, byNormalized.get(hit)!)
    else missing.push(field)
  }
  if (missing.length > 0) {
    console.warn(`[${tag}] no header matched fields: ${missing.join(', ')}`)
  }
  return (row, field) => {
    const header = resolved.get(field)
    return header ? row[header] : undefined
  }
}

// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseNumber(s: string | undefined): number | null {
  if (s == null || s === '') return null
  const n = Number(s.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO YYYY-MM-DD (or YYYY-MM)
  const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] ?? '01'}`
  // US M/D/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  // Year only
  const year = s.match(/^(\d{4})$/)
  if (year) return `${year[1]}-01-01`
  return null
}

async function fetchCsv(urls: string[], localPath: string, tag: string): Promise<string> {
  for (const url of urls) {
    try {
      console.log(`[${tag}] fetching ${url}`)
      const res = await fetch(url, {
        headers: {
          'user-agent': 'vizmaya-ai-data-centers-importer/1.0 (+https://vizmaya.fyi)',
        },
      })
      if (!res.ok) {
        console.warn(`[${tag}] fetch ${url}: ${res.status} ${res.statusText}`)
        continue
      }
      const text = await res.text()
      console.log(`[${tag}] fetched ${(text.length / 1024).toFixed(0)} KB`)
      return text
    } catch (err) {
      console.warn(`[${tag}] fetch ${url} failed: ${(err as Error).message}`)
    }
  }
  if (fs.existsSync(localPath)) {
    console.log(`[${tag}] download failed — falling back to ${localPath}`)
    return fs.readFileSync(localPath, 'utf8')
  }
  throw new Error(
    `could not download ${tag} CSV and no local copy at ${localPath}. ` +
      `Download it from https://epoch.ai/data/ai-data-centers and place it there, ` +
      `or pass --${tag} <path>.`,
  )
}

function readCsvRows(csvText: string, tag: string): {
  rows: Record<string, string>[]
  headers: string[]
} {
  const rows = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  // Always surface the raw header row — this is how header drift gets caught
  // in the weekly Actions log.
  console.log(`[${tag}] headers: ${headers.join(' | ')}`)
  return { rows, headers }
}

// ---------------------------------------------------------------------------

interface FacilityRow {
  slug: string
  name: string
  owner: string | null
  users: string | null
  project: string | null
  country: string | null
  address: string | null
  lat?: number
  lng?: number
  h100_equivalents: number | null
  power_mw: number | null
  capex_usd_bn: number | null
  investors: string | null
  construction_companies: string | null
  energy_companies: string | null
  notes: string | null
  sources: string | null
  updated_at: string
}

function parseFacilities(csvText: string): FacilityRow[] {
  const { rows, headers } = readCsvRows(csvText, 'facilities')
  const resolve = buildResolver(headers, FACILITY_FIELDS, 'facilities')
  const csvHasCoords =
    headers.some((h) => FACILITY_FIELDS.lat.includes(normalizeHeader(h))) &&
    headers.some((h) => FACILITY_FIELDS.lng.includes(normalizeHeader(h)))

  const out: FacilityRow[] = []
  const noCoords: string[] = []
  const text = (r: Record<string, string>, f: string) => {
    const v = resolve(r, f)?.trim()
    return v ? v : null
  }

  for (const r of rows) {
    const name = resolve(r, 'name')?.trim()
    if (!name) continue
    const slug = slugify(name)
    if (!slug) continue

    const row: FacilityRow = {
      slug,
      name,
      owner: text(r, 'owner'),
      users: text(r, 'users'),
      project: text(r, 'project'),
      country: text(r, 'country'),
      address: text(r, 'address'),
      h100_equivalents: parseNumber(resolve(r, 'h100_equivalents')),
      power_mw: parseNumber(resolve(r, 'power_mw')),
      capex_usd_bn: parseNumber(resolve(r, 'capex_usd_bn')),
      investors: text(r, 'investors'),
      construction_companies: text(r, 'construction_companies'),
      energy_companies: text(r, 'energy_companies'),
      notes: text(r, 'notes'),
      sources: text(r, 'sources'),
      updated_at: new Date().toISOString(),
    }

    // Coordinates: CSV columns win when Epoch ships them; otherwise the
    // curated FACILITY_COORDS file is authoritative and gets written to the
    // DB on every run (same as import-owid.ts writing countryCentroids).
    // With neither, lat/lng are omitted from the payload so a manual DB
    // backfill survives re-imports.
    const csvLat = csvHasCoords ? parseNumber(resolve(r, 'lat')) : null
    const csvLng = csvHasCoords ? parseNumber(resolve(r, 'lng')) : null
    if (csvLat != null && csvLng != null) {
      row.lat = csvLat
      row.lng = csvLng
    } else if (FACILITY_COORDS[slug]) {
      row.lat = FACILITY_COORDS[slug].lat
      row.lng = FACILITY_COORDS[slug].lng
    } else {
      noCoords.push(slug)
    }

    out.push(row)
  }

  if (noCoords.length > 0) {
    console.warn(
      `[facilities] ${noCoords.length} facilities have no curated coords in ` +
        `lib/ai-data-centers/facilityCoords.ts (excluded from the map, still imported): ` +
        noCoords.join(', '),
    )
  }
  return out
}

// ---------------------------------------------------------------------------

interface TimelineRow {
  facility_slug: string
  metric: string
  as_of: string
  value: number
}

const TIMELINE_METRICS = ['power_mw', 'h100_equivalents', 'capex_usd_bn'] as const

// Long-form metric labels → canonical keys, for the case where the CSV ships
// as (name, date, metric, value) instead of one column per metric.
const METRIC_LABELS: Record<string, string> = {
  powermw: 'power_mw',
  power: 'power_mw',
  powercapacitymw: 'power_mw',
  h100equivalents: 'h100_equivalents',
  h100e: 'h100_equivalents',
  compute: 'h100_equivalents',
  totalcapitalcost2025usdbillions: 'capex_usd_bn',
  capitalcostusdbillions: 'capex_usd_bn',
  capitalcost: 'capex_usd_bn',
  capex: 'capex_usd_bn',
}

function parseTimelines(csvText: string, knownSlugs: Set<string>): TimelineRow[] {
  const { rows, headers } = readCsvRows(csvText, 'timelines')
  const resolve = buildResolver(headers, TIMELINE_FIELDS, 'timelines')
  const normalized = headers.map(normalizeHeader)
  const isLongForm =
    normalized.some((h) => TIMELINE_FIELDS.metric.includes(h)) &&
    normalized.some((h) => TIMELINE_FIELDS.value.includes(h))

  const out: TimelineRow[] = []
  const unknownSlugs = new Set<string>()
  const unknownMetrics = new Set<string>()
  const badDates = new Set<string>()

  for (const r of rows) {
    const name = resolve(r, 'name')?.trim()
    if (!name) continue
    const slug = slugify(name)
    if (!knownSlugs.has(slug)) {
      unknownSlugs.add(slug)
      continue
    }

    const asOf = parseDate(resolve(r, 'date'))
    if (!asOf) {
      const raw = resolve(r, 'date')
      if (raw) badDates.add(raw)
      continue
    }

    if (isLongForm) {
      const label = normalizeHeader(resolve(r, 'metric') ?? '')
      const metric = METRIC_LABELS[label]
      if (!metric) {
        if (label) unknownMetrics.add(label)
        continue
      }
      const value = parseNumber(resolve(r, 'value'))
      if (value == null) continue
      out.push({ facility_slug: slug, metric, as_of: asOf, value })
    } else {
      for (const metric of TIMELINE_METRICS) {
        const value = parseNumber(resolve(r, metric))
        if (value == null) continue
        out.push({ facility_slug: slug, metric, as_of: asOf, value })
      }
    }
  }

  if (unknownSlugs.size > 0) {
    console.warn(
      `[timelines] ${unknownSlugs.size} facility names not in data_centers.csv (skipped): ` +
        `${[...unknownSlugs].slice(0, 10).join(', ')}${unknownSlugs.size > 10 ? ' …' : ''}`,
    )
  }
  if (unknownMetrics.size > 0) {
    console.warn(`[timelines] unknown metric labels (skipped): ${[...unknownMetrics].join(', ')}`)
  }
  if (badDates.size > 0) {
    console.warn(
      `[timelines] ${badDates.size} unparseable dates (skipped), e.g.: ${[...badDates].slice(0, 5).join(', ')}`,
    )
  }

  // Dedupe on the upsert key — a single upsert batch with two rows on the
  // same (slug, metric, as_of) fails with "cannot affect row a second time".
  const byKey = new Map<string, TimelineRow>()
  for (const row of out) byKey.set(`${row.facility_slug}|${row.metric}|${row.as_of}`, row)
  return [...byKey.values()]
}

// ---------------------------------------------------------------------------

async function upsertFacilities(rows: FacilityRow[]): Promise<void> {
  const sb = createServiceClient()
  // PostgREST bulk upserts need every object in a batch to carry the same
  // keys, and rows without coords deliberately omit lat/lng (so manual DB
  // backfills survive). Partition on coord presence and upsert each group.
  const groups = [
    rows.filter((r) => r.lat != null),
    rows.filter((r) => r.lat == null),
  ]
  const batchSize = 200
  for (const group of groups) {
    for (let i = 0; i < group.length; i += batchSize) {
      const batch = group.slice(i, i + batchSize)
      const { error } = await sb
        .from('dc_facilities')
        .upsert(batch, { onConflict: 'slug', ignoreDuplicates: false })
      if (error) throw new Error(`upsert dc_facilities: ${error.message}`)
    }
  }
}

async function upsertTimeline(rows: TimelineRow[]): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('dc_facility_timeline')
      .upsert(batch, { onConflict: 'facility_slug,metric,as_of', ignoreDuplicates: false })
    if (error) throw new Error(`upsert dc_facility_timeline at offset ${i}: ${error.message}`)
    if (i % 5000 === 0) {
      console.log(`[timelines] upserted ${Math.min(i + batchSize, rows.length)}/${rows.length}`)
    }
  }
}

function mapboxToken(): string | undefined {
  return process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
}

// Geocode "{Address}, {Country}" to [lng, lat] via Mapbox. Returns null on any
// miss so callers warn-and-continue. Deterministic per query string, so
// re-running the import produces stable coordinates.
async function geocodeOne(
  query: string,
  token: string,
): Promise<[number, number] | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?limit=1&access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = (await res.json()) as { features?: { center?: [number, number] }[] }
  return json.features?.[0]?.center ?? null
}

// Fill lat/lng for facilities that have neither a CSV coordinate nor a curated
// override, by geocoding Epoch's Address column. Mutates the rows in place and
// returns how many were resolved. No token → no-op (curated coords still win).
// Epoch's slugs churn as campuses are added, so relying on this keeps the map
// populated without hand-maintaining 60+ coordinates.
async function geocodeMissing(facilities: FacilityRow[]): Promise<number> {
  const token = mapboxToken()
  if (!token) {
    console.warn('[geocode] no MAPBOX_TOKEN — facilities without curated coords stay off the map')
    return 0
  }
  let resolved = 0
  for (const f of facilities) {
    if (f.lat != null) continue // CSV or curated coord already applied
    const query = [f.address, f.country].filter(Boolean).join(', ')
    if (!query) {
      console.warn(`[geocode] ${f.slug}: no address to geocode`)
      continue
    }
    const center = await geocodeOne(query, token)
    if (!center) {
      console.warn(`[geocode] ${f.slug}: no match for "${query}"`)
      continue
    }
    f.lng = center[0]
    f.lat = center[1]
    resolved++
  }
  return resolved
}

// --geocode: print curated-coords suggestions without writing anything, for
// pasting into facilityCoords.ts as overrides.
async function suggestCoords(facilities: FacilityRow[]): Promise<void> {
  const token = mapboxToken()
  if (!token) throw new Error('--geocode needs MAPBOX_TOKEN (or NEXT_PUBLIC_MAPBOX_TOKEN)')
  for (const f of facilities) {
    if (f.lat != null || FACILITY_COORDS[f.slug]) continue
    const query = [f.address, f.country].filter(Boolean).join(', ')
    if (!query) {
      console.warn(`[geocode] ${f.slug}: no address to geocode`)
      continue
    }
    const center = await geocodeOne(query, token)
    if (!center) {
      console.warn(`[geocode] ${f.slug}: no match for "${query}"`)
      continue
    }
    console.log(`  '${f.slug}': { lat: ${center[1]}, lng: ${center[0]} },`)
  }
}

// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const facilitiesPath = argValue('--facilities')
  const timelinesPath = argValue('--timelines')
  const geocodeOnly = process.argv.includes('--geocode')

  const facilitiesCsv = facilitiesPath
    ? fs.readFileSync(facilitiesPath, 'utf8')
    : await fetchCsv(FACILITIES_URLS, LOCAL_FACILITIES, 'facilities')
  const facilities = parseFacilities(facilitiesCsv)
  console.log(`[facilities] parsed ${facilities.length} facilities`)
  if (facilities.length === 0) {
    throw new Error('parsed 0 facilities — Epoch CSV schema may have changed')
  }

  if (geocodeOnly) {
    console.log('[geocode] suggestions for lib/ai-data-centers/facilityCoords.ts:')
    await suggestCoords(facilities)
    return
  }

  const timelinesCsv = timelinesPath
    ? fs.readFileSync(timelinesPath, 'utf8')
    : await fetchCsv(TIMELINES_URLS, LOCAL_TIMELINES, 'timelines').catch((err) => {
        // The facility registry alone is still useful — don't fail the whole
        // run if only the timelines file moved.
        console.warn(`[timelines] ${err.message} — importing facilities only`)
        return null
      })
  const timeline = timelinesCsv
    ? parseTimelines(timelinesCsv, new Set(facilities.map((f) => f.slug)))
    : []
  console.log(`[timelines] parsed ${timeline.length} timeline rows`)

  // Backfill map coordinates for facilities Epoch ships without them (most of
  // them) by geocoding the Address column. Curated overrides + CSV coords are
  // already applied and skipped here.
  const geocoded = await geocodeMissing(facilities)
  if (geocoded > 0) console.log(`[geocode] resolved ${geocoded} facility coordinates`)
  const stillMissing = facilities.filter((f) => f.lat == null).length
  if (stillMissing > 0) console.warn(`[geocode] ${stillMissing} facilities still without coords`)

  await upsertFacilities(facilities)
  console.log(`[facilities] upserted ${facilities.length} facility rows`)

  if (timeline.length > 0) {
    await upsertTimeline(timeline)
    console.log(`[timelines] upserted ${timeline.length} timeline rows`)
  }
  console.log('[ai-data-centers] done')
}

main().catch((err) => {
  console.error('[ai-data-centers] failed:', err)
  process.exit(1)
})
