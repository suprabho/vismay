# Global Trade dataset — agent context

International goods-trade data (yearly exports by HS product) powering
research, stories, and the future `global-trade` epic (seeded as `draft` in
migration 063; the public epics read policy hides drafts).

## Tables (supabase/vizmaya-fyi, migration 063_global_trade.sql)

- `trade_countries` — ISO2 reporters + the `WLD` world pseudo-code
- `trade_products` — HS codes with explicit `hs_level` (2/4/6) + `parent_code`
- `trade_product_exports` — long facts: `(reporter_code, hs_code, year, source) → value_usd`

`source` (`'oec' | 'comtrade' | 'trademap'`) is part of the fact PK: the three
providers publish near-identical numbers (TradeMap and OEC both derive from
UN Comtrade), so each provider's rows are isolated and readers pin one source
per view instead of mixing. Values are plain nominal USD — importers
normalise units (TradeMap publishes USD thousands).

## Importers (apps/vizmaya-fyi/scripts/trade/)

| Command | Source | Mode |
|---|---|---|
| `pnpm trade:discover-oec` | OEC BotMarket catalog | read-only reconnaissance |
| `pnpm trade:import-oec` | OEC BotMarket (`source='oec'`) | automated, cron |
| `pnpm trade:import-comtrade` | UN Comtrade (`source='comtrade'`) | automated, cron |
| `pnpm trade:import-trademap` | ITC TradeMap (`source='trademap'`) | manual CSV drop only |

All support `--dry-run`; the API importers support `--full` (backfill from
2001), `--since=YYYY`, `--reporter=XX`. Scope: world + top-20 exporters
(`scripts/trade/reporters.ts`), HS2 + HS4, 2001+. Cron:
`.github/workflows/import-trade-data.yml` (monthly, incremental; dispatch
with `full_backfill` or `discovery` inputs).

**Never scrape trademap.org** — no public API, bot-blocked, against its
terms. The manual Excel-export path is the only permitted TradeMap intake;
Comtrade is the automated equivalent (same underlying data).

## Readers

`@vismay/content-source/trade` — `getWorldTradeProfile()`,
`getProductExports(hsCode)`, `getReporterTradeProfile(code)`. Same dense
null-filled `ChartSeries` shape as the energy-profile epic, so its ECharts
components drop in. API: `/api/global-trade/world`,
`/api/global-trade/product/[hsCode]`.

## Gotchas

- `import-oec.ts`'s dataset slug + column mapping are **provisional until
  discovery runs** (see INGEST_NOTES.md). It hard-fails with pointers.
- oec.world fronts Cloudflare — dev networks may 403 where GitHub Actions
  works; use the workflow's `discovery` dispatch input.
- Comtrade reporter codes are M49 with quirks (France 251, India 699,
  Switzerland 757, USA 842) — see `scripts/trade/reporters.ts`.
- World totals: derive by summing HS2 rows per year (the fact table has no
  'TOTAL' product row by design).
