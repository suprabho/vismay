/**
 * Shared reporter allowlist for the global-trade importers.
 *
 * Scope decision (see vizmaya-data/global-trade/INGEST_NOTES.md): the first
 * ingestion covers the world aggregate plus the top ~20 goods exporters —
 * full bilateral or all-reporter grain is orders of magnitude more rows for
 * little research value. Adding a reporter later is just a new entry here
 * plus a re-run of the importers (idempotent upserts).
 *
 * `comtradeCode` is the UN M49 numeric reporter code the Comtrade API uses.
 * Watch the non-obvious ones: France 251, India 699, Switzerland 757,
 * USA 842 (these differ from the plain ISO numeric because Comtrade merges
 * customs territories).
 */

export interface TradeReporter {
  /** ISO 3166-1 alpha-2 — primary key in trade_countries. */
  code: string
  /** ISO 3166-1 alpha-3 — what OEC datasets typically key countries on. */
  iso3: string
  /** UN M49 numeric string for the Comtrade API. */
  comtradeCode: string
  name: string
}

// Top goods exporters by value (WTO/Comtrade, mid-2020s ranking).
export const TRADE_REPORTERS: TradeReporter[] = [
  { code: 'CN', iso3: 'CHN', comtradeCode: '156', name: 'China' },
  { code: 'US', iso3: 'USA', comtradeCode: '842', name: 'United States' },
  { code: 'DE', iso3: 'DEU', comtradeCode: '276', name: 'Germany' },
  { code: 'NL', iso3: 'NLD', comtradeCode: '528', name: 'Netherlands' },
  { code: 'JP', iso3: 'JPN', comtradeCode: '392', name: 'Japan' },
  { code: 'IT', iso3: 'ITA', comtradeCode: '380', name: 'Italy' },
  { code: 'FR', iso3: 'FRA', comtradeCode: '251', name: 'France' },
  { code: 'KR', iso3: 'KOR', comtradeCode: '410', name: 'South Korea' },
  { code: 'IN', iso3: 'IND', comtradeCode: '699', name: 'India' },
  { code: 'HK', iso3: 'HKG', comtradeCode: '344', name: 'Hong Kong SAR' },
  { code: 'GB', iso3: 'GBR', comtradeCode: '826', name: 'United Kingdom' },
  { code: 'MX', iso3: 'MEX', comtradeCode: '484', name: 'Mexico' },
  { code: 'CA', iso3: 'CAN', comtradeCode: '124', name: 'Canada' },
  { code: 'BE', iso3: 'BEL', comtradeCode: '056', name: 'Belgium' },
  { code: 'SG', iso3: 'SGP', comtradeCode: '702', name: 'Singapore' },
  { code: 'ES', iso3: 'ESP', comtradeCode: '724', name: 'Spain' },
  { code: 'AE', iso3: 'ARE', comtradeCode: '784', name: 'United Arab Emirates' },
  { code: 'CH', iso3: 'CHE', comtradeCode: '757', name: 'Switzerland' },
  { code: 'VN', iso3: 'VNM', comtradeCode: '704', name: 'Vietnam' },
  { code: 'RU', iso3: 'RUS', comtradeCode: '643', name: 'Russia' },
]

/** Pseudo-reporter for the world aggregate (TradeMap reporter "000"). */
export const WORLD_REPORTER = { code: 'WLD', name: 'World' }

/** Year floor for every trade importer — TradeMap's series start in 2001. */
export const TRADE_MIN_YEAR = 2001

export const REPORTER_BY_ISO2 = new Map(TRADE_REPORTERS.map((r) => [r.code, r]))
export const REPORTER_BY_ISO3 = new Map(TRADE_REPORTERS.map((r) => [r.iso3, r]))
