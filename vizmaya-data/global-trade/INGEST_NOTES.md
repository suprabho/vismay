# Global Trade — ingest notes & provenance

Working log for the trade dataset. Records source terms, unit decisions, and
the BotMarket discovery output that pins the import-oec.ts config.

## Source tiers

| Tier | Source | Access | Status |
|---|---|---|---|
| 1 | **OEC BotMarket** (botmarket.oec.world) | Free keyed JSON API — Bearer `bot_market_ak_…`, every query free, 1,000 rows/request | key claim + discovery pending (see below) |
| 1 | **UN Comtrade Plus** (comtradeapi.un.org) | Free official API — 500 calls/day, 100k records/call with key | key registration pending |
| 2 | **ITC TradeMap** (beta.trademap.org) | Manual Excel export only | as-needed manual drops |

### Why three sources for one fact table

TradeMap and the OEC both build on UN Comtrade, so the numbers are
near-identical but not equal (OEC harmonises with BACI-style mirroring; raw
Comtrade keeps reporter asymmetries). `source` sits in the fact PK so the
providers never clobber each other; readers prefer `oec → comtrade →
trademap` (`SOURCE_PREFERENCE` in packages/content-source/src/trade.ts).

### TradeMap terms — do not scrape

TradeMap has **no public API** and explicitly does not support bulk download;
the site is bot-protected. The only permitted intake is the site's own Excel
export button, used by a human, dropped into
`apps/vizmaya-fyi/scripts/trade/data/trademap-world-exports-*.csv`. The
automated equivalent of the world-exports-by-product view is Comtrade
(`cmdCode=AG2|AG4`, `partnerCode=0`, `flowCode=X`).

Reference view (world, all products, yearly exports, USD):
<https://beta.trademap.org/en/goods/time-series/exports/c/000/c/000/p/ALL/byProduct/year/default/4/direct/values/USD/table>

## Scope decisions

- **Reporters:** world (`WLD`) + top-20 goods exporters — full list with M49
  codes in `apps/vizmaya-fyi/scripts/trade/reporters.ts`. Full bilateral
  grain rejected (billions of rows at HS4).
- **Products:** HS2 + HS4. HS6 deferred (≈5,600 codes, little chart value).
- **Years:** 2001+ (`TRADE_MIN_YEAR`) — matches TradeMap's series start.
- **Volume estimate:** 21 reporters × ~1,350 HS2+HS4 codes × 25 years ×
  ≤2 API sources ≈ ~1.4M rows worst case, well within the long-table pattern.

## Units

`trade_product_exports.value_usd` is **plain nominal USD** everywhere:

| Source | Native unit | Conversion |
|---|---|---|
| OEC BotMarket | USD | none (confirm at discovery) |
| UN Comtrade (`primaryValue`) | USD | none |
| TradeMap | USD **thousands** | ×1000 in import-trademap.ts |

## Attribution / licensing

- **UN Comtrade:** free tier permits reuse with attribution — cite
  "UN Comtrade Database, United Nations Statistics Division".
- **OEC:** cite "The Observatory of Economic Complexity (Datawheel)"; check
  the BotMarket dataset-level terms during discovery.
- **TradeMap:** cite "ITC Trade Map, International Trade Centre" on any
  figure using `source='trademap'` rows.

## Phase 0 — BotMarket discovery (TO RUN)

Blocked from the authoring sandbox: botmarket.oec.world / oec.world returned
Cloudflare 403 (both via fetch and the egress proxy). Run from a normal dev
machine, or via GitHub Actions → "Import trade data" → Run workflow with
`discovery: true`.

Checklist:

1. Claim key: `curl -X POST https://botmarket.oec.world/api/promo/claim -H 'content-type: application/json' -d '{"buyer_email":"hello@promad.design"}'`
   → store as `OEC_BOTMARKET_API_KEY` in `apps/vizmaya-fyi/.env.local` and the
   GitHub `Production` environment.
2. Register the Comtrade key at <https://comtradedeveloper.un.org> (product
   "comtrade - v1") → `COMTRADE_API_KEY` in the same two places.
3. `pnpm trade:discover-oec` — paste the catalog + chosen dataset schema
   below.
4. Pin `OEC_TRADE_DATASET_SLUG` (env + `Production` secret) and correct the
   `COLS` mapping in `scripts/trade/import-oec.ts` if the real column names
   differ from the guesses (`country_iso3`, `hs4`, `hs4_name`, `year`,
   `trade_value`).
5. Confirm `/query` pagination: does `offset` work, or must slices be
   sub-chunked via `OEC_TRADE_EXTRA_FILTERS`? Record here.
6. `pnpm trade:import-oec -- --dry-run --reporter=CN --since=2023` — check
   row counts (~1,260 HS4 + ~97 HS2 per year if the dataset carries both
   levels) before a real run.

### Discovery output (paste here)

```
(pending — see checklist above)
```

## Refresh cadence

- **Cron:** monthly (3rd, 05:15 UTC) via `.github/workflows/import-trade-data.yml`,
  incremental 3-year window (`--since=currentYear-2` default in the scripts).
- **Full backfill:** dispatch the workflow with `full_backfill: true` —
  ~1,100 BotMarket requests (free tier) + ~120 Comtrade calls (of 500/day).
- **TradeMap drops:** whenever a curated world view is wanted; re-runs are
  idempotent.

## Verification log

After any import, sanity-check:

```sql
select source, count(*), min(year), max(year)
from trade_product_exports group by 1;

-- cross-source: world totals should agree within a few % where both exist
select year,
  sum(value_usd) filter (where source = 'comtrade') as comtrade,
  sum(value_usd) filter (where source = 'trademap') as trademap
from trade_product_exports e
join trade_products p on p.hs_code = e.hs_code and p.hs_level = 2
where reporter_code = 'WLD'
group by year order by year;
```

Run each importer twice — the second run must report identical counts
(idempotent upsert proof).

| Date | Source | Action | Rows | Notes |
|---|---|---|---|---|
| _(pending first import)_ | | | | |
