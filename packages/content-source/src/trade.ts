/**
 * Server-side read helpers for the global-trade dataset (Global Trade epic).
 *
 * Tables: trade_countries, trade_products, trade_product_exports — see
 * supabase/vizmaya-fyi/migrations/064_global_trade.sql. Rows are long-format
 * (reporter × hs_code × year × source); these readers shape them into the
 * same dense null-filled `ChartSeries` arrays the energy-profile charts use,
 * so ECharts components drop in unchanged.
 *
 * Sources: the same fact can exist per provider ('oec' | 'comtrade' |
 * 'trademap' — the source column is part of the PK). Readers never mix
 * providers inside one series: they use SOURCE_PREFERENCE and fall back to
 * the next provider only when the preferred one has no rows at all for the
 * requested slice.
 */

import { createServiceClient } from './supabase'
import type { ChartSeries } from './epics'

export type TradeSource = 'oec' | 'comtrade' | 'trademap'

/** Order matters: OEC ships harmonised (BACI-style mirrored) values, raw
 *  Comtrade next, the manual TradeMap drop last. */
const SOURCE_PREFERENCE: TradeSource[] = ['oec', 'comtrade', 'trademap']

/** World pseudo-reporter code (see scripts/trade/reporters.ts). */
export const WORLD_CODE = 'WLD'

export interface TradeProduct {
  hsCode: string
  hsLevel: number
  name: string
  parentCode: string | null
}

export interface WorldTradeProfile {
  source: TradeSource
  latestYear: number
  /** Latest-year top products (HS4), descending by value. */
  topProducts: { hsCode: string; name: string; valueUsd: number }[]
  timeseries: {
    /** Sum of HS2 chapter values per year (plain USD). */
    totalExports: { years: number[]; values: (number | null)[] }
    /** Top-N HS4 products by latest-year value, plus an 'Other' remainder. */
    topProductSeries: { years: number[]; series: ChartSeries[] }
  }
}

export interface ProductExportsProfile {
  product: TradeProduct
  source: TradeSource
  world: { years: number[]; values: (number | null)[] }
  /** Per-reporter series for the same product (top reporters only). */
  reporters: { years: number[]; series: ChartSeries[] }
}

export interface ReporterTradeProfile {
  code: string
  name: string
  source: TradeSource
  latestYear: number | null
  topProducts: { hsCode: string; name: string; valueUsd: number }[]
  totalExports: { years: number[]; values: (number | null)[] }
}

export interface TradeLandscape {
  source: TradeSource
  /** The year the landscape snapshot is taken from — the most recent year
   *  with broad reporter coverage, not simply max(year) (early single-country
   *  partial years would otherwise skew every cross-country comparison). */
  year: number
  reporters: {
    code: string
    name: string
    /** Sum of the reporter's HS2 chapter values in `year` (plain USD). */
    totalUsd: number
    topChapters: { hsCode: string; valueUsd: number }[]
  }[]
  /** Chapters that appear in at least one reporter's top set. `totalUsd` sums
   *  across the tracked reporters only — not a true world total. */
  chapters: { hsCode: string; name: string; totalUsd: number }[]
  edges: { reporter: string; hsCode: string; valueUsd: number }[]
}

interface ExportRow {
  reporter_code: string
  hs_code: string
  year: number
  value_usd: number | null
  source: string
}

/**
 * Page through trade_product_exports for one filter set. PostgREST caps
 * responses at ~1000 rows on Supabase, and a single reporter×source slice at
 * HS4 runs to ~30k rows — same pagination pattern as pageAllShareRows in
 * epics.ts. Deterministic sort keeps pages stable across requests.
 */
async function pageExportRows(
  sb: ReturnType<typeof createServiceClient>,
  filters: {
    reporterCode?: string
    hsCode?: string
    hsCodes?: string[]
    minYear?: number
    source: TradeSource
  },
): Promise<ExportRow[]> {
  const rows: ExportRow[] = []
  const pageSize = 1000
  for (let page = 0; page < 100; page++) {
    const from = page * pageSize
    let query = sb
      .from('trade_product_exports')
      .select('reporter_code, hs_code, year, value_usd, source')
      .eq('source', filters.source)
      .not('value_usd', 'is', null)
      .order('reporter_code', { ascending: true })
      .order('hs_code', { ascending: true })
      .order('year', { ascending: true })
      .range(from, from + pageSize - 1)
    if (filters.reporterCode) query = query.eq('reporter_code', filters.reporterCode)
    if (filters.hsCode) query = query.eq('hs_code', filters.hsCode)
    if (filters.hsCodes) query = query.in('hs_code', filters.hsCodes)
    if (filters.minYear != null) query = query.gte('year', filters.minYear)

    const { data, error } = await query
    if (error) throw new Error(`pageExportRows(${JSON.stringify(filters)}): ${error.message}`)
    const batch = (data ?? []) as ExportRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

/** First source in preference order that has any rows for the slice. */
async function resolveSource(
  sb: ReturnType<typeof createServiceClient>,
  filters: { reporterCode?: string; hsCode?: string },
  preferred?: TradeSource,
): Promise<TradeSource | null> {
  const order = preferred
    ? [preferred, ...SOURCE_PREFERENCE.filter((s) => s !== preferred)]
    : SOURCE_PREFERENCE
  for (const source of order) {
    let query = sb
      .from('trade_product_exports')
      .select('year', { head: true, count: 'exact' })
      .eq('source', source)
    if (filters.reporterCode) query = query.eq('reporter_code', filters.reporterCode)
    if (filters.hsCode) query = query.eq('hs_code', filters.hsCode)
    const { count, error } = await query
    if (error) throw new Error(`resolveSource: ${error.message}`)
    if ((count ?? 0) > 0) return source
  }
  return null
}

async function fetchProducts(
  sb: ReturnType<typeof createServiceClient>,
  hsCodes: string[],
): Promise<Map<string, TradeProduct>> {
  const out = new Map<string, TradeProduct>()
  const chunk = 200
  for (let i = 0; i < hsCodes.length; i += chunk) {
    const { data, error } = await sb
      .from('trade_products')
      .select('hs_code, hs_level, name, parent_code')
      .in('hs_code', hsCodes.slice(i, i + chunk))
    if (error) throw new Error(`fetchProducts: ${error.message}`)
    for (const r of data ?? []) {
      out.set(r.hs_code as string, {
        hsCode: r.hs_code as string,
        hsLevel: r.hs_level as number,
        name: r.name as string,
        parentCode: (r.parent_code as string | null) ?? null,
      })
    }
  }
  return out
}

/** Index rows by hs_code → year → value, splitting HS2 and HS4 levels. */
function indexByProduct(rows: ExportRow[]) {
  const hs2 = new Map<string, Map<number, number>>()
  const hs4 = new Map<string, Map<number, number>>()
  const years = new Set<number>()
  for (const r of rows) {
    if (r.value_usd == null) continue
    const target = r.hs_code.length === 2 ? hs2 : r.hs_code.length === 4 ? hs4 : null
    if (!target) continue
    if (!target.has(r.hs_code)) target.set(r.hs_code, new Map())
    target.get(r.hs_code)!.set(r.year, r.value_usd)
    years.add(r.year)
  }
  return { hs2, hs4, years: [...years].sort((a, b) => a - b) }
}

function denseSeries(byYear: Map<number, number> | undefined, years: number[]): (number | null)[] {
  return years.map((y) => (byYear?.has(y) ? byYear.get(y)! : null))
}

/**
 * World exports profile: total exports per year plus the top-N HS4 product
 * series. Returns null when no source has world-level rows yet (i.e. before
 * any importer has run).
 */
export async function getWorldTradeProfile(opts?: {
  source?: TradeSource
  topN?: number
}): Promise<WorldTradeProfile | null> {
  const sb = createServiceClient()
  const topN = opts?.topN ?? 8

  const source = await resolveSource(sb, { reporterCode: WORLD_CODE }, opts?.source)
  if (!source) return null

  const rows = await pageExportRows(sb, { reporterCode: WORLD_CODE, source })
  const { hs2, hs4, years } = indexByProduct(rows)
  if (years.length === 0) return null
  const latestYear = years[years.length - 1]

  // Total exports = sum of HS2 chapters per year; fall back to summing HS4
  // when a source carried only HS4 rows.
  const totalsBase = hs2.size > 0 ? hs2 : hs4
  const totalByYear = new Map<number, number>()
  for (const byYear of totalsBase.values()) {
    for (const [year, value] of byYear) {
      totalByYear.set(year, (totalByYear.get(year) ?? 0) + value)
    }
  }

  const rankedHs4 = [...hs4.entries()]
    .map(([hsCode, byYear]) => ({ hsCode, byYear, latest: byYear.get(latestYear) ?? 0 }))
    .sort((a, b) => b.latest - a.latest)

  const top = rankedHs4.slice(0, topN)
  const products = await fetchProducts(sb, top.map((t) => t.hsCode))

  const topSeries: ChartSeries[] = top.map((t) => ({
    name: products.get(t.hsCode)?.name ?? t.hsCode,
    values: denseSeries(t.byYear, years),
  }))
  if (rankedHs4.length > topN) {
    const otherByYear = new Map<number, number>()
    for (const { byYear } of rankedHs4.slice(topN)) {
      for (const [year, value] of byYear) {
        otherByYear.set(year, (otherByYear.get(year) ?? 0) + value)
      }
    }
    topSeries.push({ name: 'Other', values: denseSeries(otherByYear, years) })
  }

  return {
    source,
    latestYear,
    topProducts: top
      .filter((t) => t.latest > 0)
      .map((t) => ({
        hsCode: t.hsCode,
        name: products.get(t.hsCode)?.name ?? t.hsCode,
        valueUsd: t.latest,
      })),
    timeseries: {
      totalExports: { years, values: denseSeries(totalByYear, years) },
      topProductSeries: { years, series: topSeries },
    },
  }
}

/**
 * One product's export series: the world total plus per-reporter breakdown.
 * Returns null when the HS code is unknown or has no data.
 */
export async function getProductExports(
  hsCode: string,
  opts?: { source?: TradeSource },
): Promise<ProductExportsProfile | null> {
  const sb = createServiceClient()
  const code = hsCode.trim()

  const [productR, source] = await Promise.all([
    sb
      .from('trade_products')
      .select('hs_code, hs_level, name, parent_code')
      .eq('hs_code', code)
      .maybeSingle(),
    resolveSource(sb, { hsCode: code }, opts?.source),
  ])
  if (productR.error) throw new Error(`getProductExports(${code}): ${productR.error.message}`)
  if (!productR.data || !source) return null

  const rows = await pageExportRows(sb, { hsCode: code, source })
  const byReporter = new Map<string, Map<number, number>>()
  const yearSet = new Set<number>()
  for (const r of rows) {
    if (r.value_usd == null) continue
    if (!byReporter.has(r.reporter_code)) byReporter.set(r.reporter_code, new Map())
    byReporter.get(r.reporter_code)!.set(r.year, r.value_usd)
    yearSet.add(r.year)
  }
  const years = [...yearSet].sort((a, b) => a - b)
  if (years.length === 0) return null

  const world = byReporter.get(WORLD_CODE)
  const latestYear = years[years.length - 1]

  const { data: countries, error: countriesError } = await sb
    .from('trade_countries')
    .select('code, name')
  if (countriesError) throw new Error(`getProductExports(${code}) countries: ${countriesError.message}`)
  const countryName = new Map((countries ?? []).map((c) => [c.code as string, c.name as string]))

  const reporterSeries: ChartSeries[] = [...byReporter.entries()]
    .filter(([reporterCode]) => reporterCode !== WORLD_CODE)
    .sort((a, b) => (b[1].get(latestYear) ?? 0) - (a[1].get(latestYear) ?? 0))
    .map(([reporterCode, byYear]) => ({
      name: countryName.get(reporterCode) ?? reporterCode,
      values: denseSeries(byYear, years),
    }))

  return {
    product: {
      hsCode: productR.data.hs_code as string,
      hsLevel: productR.data.hs_level as number,
      name: productR.data.name as string,
      parentCode: (productR.data.parent_code as string | null) ?? null,
    },
    source,
    world: { years, values: denseSeries(world, years) },
    reporters: { years, series: reporterSeries },
  }
}

/**
 * One reporter's profile: total exports over time plus latest-year top
 * products. Returns null when the reporter isn't in trade_countries.
 */
export async function getReporterTradeProfile(
  code: string,
  opts?: { source?: TradeSource; topN?: number },
): Promise<ReporterTradeProfile | null> {
  const sb = createServiceClient()
  const reporterCode = code.toUpperCase()
  const topN = opts?.topN ?? 10

  const { data: country, error: countryError } = await sb
    .from('trade_countries')
    .select('code, name')
    .eq('code', reporterCode)
    .maybeSingle()
  if (countryError) throw new Error(`getReporterTradeProfile(${reporterCode}): ${countryError.message}`)
  if (!country) return null

  const source = await resolveSource(sb, { reporterCode }, opts?.source)
  if (!source) {
    return {
      code: reporterCode,
      name: country.name as string,
      source: SOURCE_PREFERENCE[0],
      latestYear: null,
      topProducts: [],
      totalExports: { years: [], values: [] },
    }
  }

  const rows = await pageExportRows(sb, { reporterCode, source })
  const { hs2, hs4, years } = indexByProduct(rows)
  const latestYear = years.length > 0 ? years[years.length - 1] : null

  const totalsBase = hs2.size > 0 ? hs2 : hs4
  const totalByYear = new Map<number, number>()
  for (const byYear of totalsBase.values()) {
    for (const [year, value] of byYear) {
      totalByYear.set(year, (totalByYear.get(year) ?? 0) + value)
    }
  }

  const rankedHs4 = latestYear == null
    ? []
    : [...hs4.entries()]
        .map(([hsCode, byYear]) => ({ hsCode, latest: byYear.get(latestYear) ?? 0 }))
        .filter((t) => t.latest > 0)
        .sort((a, b) => b.latest - a.latest)
        .slice(0, topN)
  const products = await fetchProducts(sb, rankedHs4.map((t) => t.hsCode))

  return {
    code: reporterCode,
    name: country.name as string,
    source,
    latestYear,
    topProducts: rankedHs4.map((t) => ({
      hsCode: t.hsCode,
      name: products.get(t.hsCode)?.name ?? t.hsCode,
      valueUsd: t.latest,
    })),
    totalExports: { years, values: denseSeries(totalByYear, years) },
  }
}

/**
 * Cross-reporter snapshot for the epic landing: every tracked reporter's HS2
 * chapter values in one recent year, shaped as reporter totals plus
 * reporter→chapter edges for the radial trade-relations network.
 *
 * The snapshot year is the most recent one where at least 85% of reporters
 * have HS2 rows — countries publish to Comtrade on lags of a year or more,
 * so the newest year is routinely the early-filer minority (mid-2026: 2025
 * has 14 of 20 reporters and is missing China). A landscape without the top
 * exporter misleads worse than a year-stale one; the threshold flips forward
 * automatically as laggards publish. Returns null before any importer runs.
 */
export async function getTradeLandscape(opts?: {
  source?: TradeSource
  year?: number
  topChaptersPerReporter?: number
}): Promise<TradeLandscape | null> {
  const sb = createServiceClient()
  const topK = opts?.topChaptersPerReporter ?? 6

  const source = await resolveSource(sb, {}, opts?.source)
  if (!source) return null

  const { data: hs2Products, error: hs2Error } = await sb
    .from('trade_products')
    .select('hs_code, name')
    .eq('hs_level', 2)
  if (hs2Error) throw new Error(`getTradeLandscape products: ${hs2Error.message}`)
  const chapterName = new Map((hs2Products ?? []).map((p) => [p.hs_code as string, p.name as string]))
  if (chapterName.size === 0) return null

  // Only the last few years matter for picking the snapshot; keeps the page
  // read at ~2k rows instead of the full 25-year HS2 history.
  const minYear = (opts?.year ?? new Date().getFullYear()) - 3
  const rows = await pageExportRows(sb, {
    source,
    hsCodes: [...chapterName.keys()],
    minYear,
  })

  // reporter → year → chapter → value
  const byReporter = new Map<string, Map<number, Map<string, number>>>()
  const reportersByYear = new Map<number, Set<string>>()
  for (const r of rows) {
    if (r.value_usd == null || r.reporter_code === WORLD_CODE) continue
    if (!byReporter.has(r.reporter_code)) byReporter.set(r.reporter_code, new Map())
    const byYear = byReporter.get(r.reporter_code)!
    if (!byYear.has(r.year)) byYear.set(r.year, new Map())
    byYear.get(r.year)!.set(r.hs_code, r.value_usd)
    if (!reportersByYear.has(r.year)) reportersByYear.set(r.year, new Set())
    reportersByYear.get(r.year)!.add(r.reporter_code)
  }
  if (byReporter.size === 0) return null

  let year: number
  if (opts?.year) {
    year = opts.year
  } else {
    const quorum = Math.max(3, Math.ceil(byReporter.size * 0.85))
    const qualifying = [...reportersByYear.entries()]
      .filter(([, reporters]) => reporters.size >= quorum)
      .map(([y]) => y)
    if (qualifying.length === 0) return null
    year = Math.max(...qualifying)
  }

  const { data: countries, error: countriesError } = await sb
    .from('trade_countries')
    .select('code, name')
  if (countriesError) throw new Error(`getTradeLandscape countries: ${countriesError.message}`)
  const countryNameByCode = new Map((countries ?? []).map((c) => [c.code as string, c.name as string]))

  const reporters: TradeLandscape['reporters'] = []
  const edges: TradeLandscape['edges'] = []
  const chapterTotals = new Map<string, number>()

  for (const [code, byYear] of byReporter) {
    const chapters = byYear.get(year)
    if (!chapters || chapters.size === 0) continue
    let totalUsd = 0
    for (const [hsCode, value] of chapters) {
      totalUsd += value
      chapterTotals.set(hsCode, (chapterTotals.get(hsCode) ?? 0) + value)
    }
    const topChapters = [...chapters.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([hsCode, valueUsd]) => ({ hsCode, valueUsd }))
    reporters.push({
      code,
      name: countryNameByCode.get(code) ?? code,
      totalUsd,
      topChapters,
    })
    for (const c of topChapters) {
      edges.push({ reporter: code, hsCode: c.hsCode, valueUsd: c.valueUsd })
    }
  }
  if (reporters.length === 0) return null
  reporters.sort((a, b) => b.totalUsd - a.totalUsd)

  const edgeChapters = new Set(edges.map((e) => e.hsCode))
  const chapters = [...edgeChapters]
    .map((hsCode) => ({
      hsCode,
      name: chapterName.get(hsCode) ?? hsCode,
      totalUsd: chapterTotals.get(hsCode) ?? 0,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)

  return { source, year, reporters, chapters, edges }
}
