/**
 * Shared upsert helpers for the global-trade importers. All three importers
 * (oec / comtrade / trademap) write the same three tables from migration
 * 064_global_trade.sql, so the batching + onConflict wiring lives here once.
 *
 * Idempotency: trade_countries on (code), trade_products on (hs_code),
 * trade_product_exports on (reporter_code, hs_code, year, source) — re-runs
 * only touch rows that changed, and each provider's rows are isolated by the
 * `source` column in the fact PK.
 */

import { createServiceClient } from '@vismay/content-source/supabase'

export type TradeSource = 'oec' | 'comtrade' | 'trademap'

export interface TradeCountryRow {
  code: string
  name: string
}

export interface TradeProductRow {
  hs_code: string
  hs_level: 2 | 4 | 6
  name: string
  parent_code: string | null
}

export interface TradeExportRow {
  reporter_code: string
  hs_code: string
  year: number
  value_usd: number
  source: TradeSource
}

export interface TradeBilateralRow {
  reporter_code: string
  partner_code: string
  hs_code: string
  year: number
  flow: 'export' | 'import'
  value_usd: number
  source: TradeSource
}

/** Derive hs_level/parent_code from a bare HS code string, or null when the
 *  code isn't a 2/4/6-digit HS code (e.g. TradeMap's 'TOTAL' row). */
export function classifyHsCode(
  raw: string,
): Pick<TradeProductRow, 'hs_code' | 'hs_level' | 'parent_code'> | null {
  const code = raw.trim()
  if (!/^\d{2}(\d{2})?(\d{2})?$/.test(code)) return null
  const level = code.length as 2 | 4 | 6
  return {
    hs_code: code,
    hs_level: level,
    parent_code: level === 2 ? null : code.slice(0, level - 2),
  }
}

export async function upsertTradeCountries(rows: TradeCountryRow[], tag: string): Promise<void> {
  if (rows.length === 0) return
  const sb = createServiceClient()
  // lat/lng stay untouched (only named columns are written) so any future
  // centroid backfill survives re-imports — same trick as import-owid.ts.
  const { error } = await sb
    .from('trade_countries')
    .upsert(rows, { onConflict: 'code', ignoreDuplicates: false })
  if (error) throw new Error(`[${tag}] upsert trade_countries: ${error.message}`)
}

export async function upsertTradeProducts(rows: TradeProductRow[], tag: string): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('trade_products')
      .upsert(batch, { onConflict: 'hs_code', ignoreDuplicates: false })
    if (error) throw new Error(`[${tag}] upsert trade_products at offset ${i}: ${error.message}`)
  }
}

export async function upsertTradeExports(rows: TradeExportRow[], tag: string): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('trade_product_exports')
      .upsert(batch, {
        onConflict: 'reporter_code,hs_code,year,source',
        ignoreDuplicates: false,
      })
    if (error) throw new Error(`[${tag}] upsert trade_product_exports at offset ${i}: ${error.message}`)
    if (i % 10000 === 0) {
      console.log(`[${tag}] upserted ${Math.min(i + batchSize, rows.length)}/${rows.length} export rows`)
    }
  }
}

export async function upsertTradeBilateralFlows(rows: TradeBilateralRow[], tag: string): Promise<void> {
  const sb = createServiceClient()
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb
      .from('trade_bilateral_flows')
      .upsert(batch, {
        onConflict: 'reporter_code,partner_code,hs_code,year,flow,source',
        ignoreDuplicates: false,
      })
    if (error) {
      throw new Error(
        `[${tag}] upsert trade_bilateral_flows at offset ${i}: ${error.message}` +
          (error.message.includes('trade_bilateral_flows') && error.message.match(/relation|does not exist|schema cache/i)
            ? ' — is migration 065_trade_bilateral.sql applied?'
            : ''),
      )
    }
    if (i % 10000 === 0) {
      console.log(`[${tag}] upserted ${Math.min(i + batchSize, rows.length)}/${rows.length} bilateral rows`)
    }
  }
}

/** Post-import sanity: row counts and year span per source. */
export async function printVerifySummary(tag: string): Promise<void> {
  const sb = createServiceClient()
  for (const source of ['oec', 'comtrade', 'trademap'] as const) {
    const { count, error } = await sb
      .from('trade_product_exports')
      .select('*', { count: 'exact', head: true })
      .eq('source', source)
    if (error) throw new Error(`[${tag}] verify count(${source}): ${error.message}`)
    console.log(`[${tag}] trade_product_exports source=${source}: ${count ?? 0} rows`)
  }
}
