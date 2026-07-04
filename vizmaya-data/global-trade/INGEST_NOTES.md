# Global Trade — ingest notes & provenance

Working log for the trade dataset. Records source terms, unit decisions, and
the BotMarket discovery output that pins the import-oec.ts config.

## Source tiers

| Tier | Source | Access | Status |
|---|---|---|---|
| 1 | **UN Comtrade Plus** (comtradeapi.un.org) | Free official API — 500 calls/day, 100k records/call with key | key claimed (env + `Production`); dry-run verified 2026-07-04 (CN 2023 → 2,612 rows) |
| 2 | **OEC BotMarket** (botmarket.oec.world) | Free keyed JSON API — Bearer `bot_market_ak_…`, every query free, 1,000 rows/request | key claimed; discovery run 2026-07-04 — **grain mismatch, importer needs redesign** (see Phase 0 findings) |
| 2 | **ITC TradeMap** (beta.trademap.org) | Manual Excel export only | as-needed manual drops |

> **Tier change (2026-07-04):** Comtrade promoted to the primary automated
> source. BotMarket discovery found no pre-aggregated country×product dataset
> — only bilateral HS6 BACI, which is ~500 paged requests per reporter-year
> versus ~2 Comtrade calls for the same slice. Details under Phase 0 findings.

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
| OEC BotMarket (`baci-hs92.value`) | USD — **confirmed at discovery** (chn→usa 2023 hs 852520 = $53.9B, matches known ~$50B cellphone flow; note BACI's upstream CSV is USD thousands, BotMarket already rescales) | none |
| UN Comtrade (`primaryValue`) | USD | none |
| TradeMap | USD **thousands** | ×1000 in import-trademap.ts |

## Attribution / licensing

- **UN Comtrade:** free tier permits reuse with attribution — cite
  "UN Comtrade Database, United Nations Statistics Division".
- **OEC:** cite "The Observatory of Economic Complexity (Datawheel)"; check
  the BotMarket dataset-level terms during discovery.
- **TradeMap:** cite "ITC Trade Map, International Trade Centre" on any
  figure using `source='trademap'` rows.

## Phase 0 — BotMarket discovery (RUN 2026-07-04, from dev machine)

Cloudflare did **not** block the dev machine (the earlier 403s were specific
to the authoring sandbox). Checklist results:

1. ✅ `OEC_BOTMARKET_API_KEY` — in `.env.local` and the `Production` environment.
2. ✅ `COMTRADE_API_KEY` — in both places; verified working via
   `pnpm trade:import-comtrade -- --dry-run --reporter=CN --since=2023`
   (2,612 rows, 1,312 HS2+HS4 products, plausible USD values).
3. ✅ `pnpm trade:discover-oec` — output below.
4. ⚠️ **Do not set `OEC_TRADE_DATASET_SLUG` yet.** The right slug would be
   `baci-hs92`, but import-oec.ts cannot consume it as written (grain +
   response-shape mismatch, below). Setting the slug now produces a run that
   paginates forever and parses 0 rows. Leave it unset so the importer keeps
   hard-failing with its pointer here.
5. ✅ Pagination: `offset` **works** (verified: offset=2 returns rows 3–5 of
   the offset=0 ordering; rows come back ordered by hs_code). `total`,
   `count`, `offset` are included in every response. `OEC_TRADE_EXTRA_FILTERS`
   sub-chunking not needed for correctness — only for politeness.
6. ⛔ Not run — blocked on the import-oec.ts redesign decision (below).

### Findings — why import-oec.ts can't run as designed

**No pre-aggregated dataset exists.** The catalog (1,276 datasets) has
exactly two trade-flow datasets, both BACI **bilateral HS6** grain
(`year × exporter × importer × hs6`):

| Slug | Vocabulary | Actual years (members/year) | Rows |
|---|---|---|---|
| `baci-hs92` | HS 1992 | 1995–2024 | 269.9M |
| `baci-hs17` | HS 2017 | **2018–2024 only** (metadata claims 1995 — wrong) | 79.3M |

Only `baci-hs92` covers the 2001+ scope. Everything else in the trade /
economic-complexity domains is ECI/PCI indices, OECD agriculture, etc.

**Three concrete blockers in import-oec.ts:**

1. **Grain:** the importer assumes country×HS4×year totals. Reality is
   bilateral HS6: China 2023 alone is **535,522 rows** (verified via `total`)
   → ~536 paged requests at the 1,000-row cap. 21 reporters × 24 years ≈
   **~100k+ requests** for a backfill — the "~1,100 requests" estimate in the
   refresh-cadence section was based on the assumed aggregated dataset and is
   off by ~100×. Also blows the `--max-requests=1500` default within 3
   reporter-years. The importer would need to sum over importers and roll
   HS6→HS4/HS2 client-side.
2. **Response shape:** `/query` returns `columns: [...]` + `rows: [[...]]`
   (positional arrays), but `queryPage` treats rows as objects
   (`r[COLS.year]`) — every row parses to `undefined` and the run dies at the
   "parsed 0 export rows" guard. Needs a zip-columns step regardless of grain.
3. **Column names:** real schema is `year, exporter_id (iso3 lowercase),
   exporter_name, importer_id, importer_name, hs_code (HS6 zero-padded),
   product_name, hs_revision, value (USD), quantity (mt), unit_abbrevation,
   unit_name`. The `COLS` guesses (`country_iso3`/`hs4`/`hs4_name`/
   `trade_value`) are all wrong; fixable via the existing `OEC_TRADE_COL_*`
   env overrides, but moot until 1–2 are addressed.

**HS-vocabulary caveat for cross-source reads:** BACI-HS92 speaks HS 1992;
Comtrade reports in current revisions. HS2 chapters are stable, but HS4
diverges where products moved chapters (e.g. smartphones: 8525 in HS92 vs
8517 in HS17). If OEC rows ever land, `trade_products` will mix vocabularies
across sources — fine while readers pin one source per view, but rules out
naive cross-source joins at HS4.

**Decision (recorded 2026-07-04): Comtrade is the primary automated source.**
The same CN-2023 slice that costs BotMarket ~536 requests is ~2 Comtrade
calls (server-side aggregation, `partnerCode=0`). Since no `oec` rows will
exist, `SOURCE_PREFERENCE` in packages/content-source/src/trade.ts already
falls through to `comtrade` — no code change needed there. Options for OEC,
whenever it's worth revisiting:

- **(a) Park it** (current state): slug unset, importer hard-fails with a
  pointer here. Zero cost.
- **(b) Redesign import-oec.ts** as an *annual* aggregating importer:
  paginate `exporter_id×year` slices (~12k requests per year-slice for all 21
  reporters, offset paging verified), zip columns, sum over `importer_id`,
  roll HS6→HS4+HS2 in HS92 vocabulary. Only worth it if the BACI
  harmonised/mirrored series becomes editorially valuable over raw Comtrade.

### Discovery output (2026-07-04)

Marketplace: free mode, `max_rows_per_query: 1000`, formats parquet/csv,
filters as query params (`?col=a,b` = SQL IN; reserved: `limit`, `offset`,
`format`). Catalog: 1,276 datasets; `domain=trade` → 2 (the BACI pair).

Pinned dataset (if OEC is ever revived): **`baci-hs92`**

```
slug: baci-hs92 — BACI International Trade Database (HS 1992)
source: OEC/Datawheel, upstream CEPII BACI · license CC BY 4.0
grain: year × exporter × importer × hs6 · 269,894,500 rows · 1995–2024 annual
coding: ISO alpha-3 lowercase countries; hs_code 6-digit zero-padded HS92
query_filters: year, exporter_id, importer_id, hs_code
schema: year(int) exporter_id exporter_name importer_id importer_name
        hs_code product_name hs_revision(int) value(USD) quantity
        unit_abbrevation unit_name
response: { columns: [...], rows: [[positional]], count, total, offset,
            max_rows_per_query, filters_applied, cost_usd }
probes:  chn→usa 2023 852520 → value 53,863,749,087 (plain USD ✓)
         chn 2023 (all partners) → total 535,522 rows
         2023 (all exporters)    → total 11,194,668 rows
         offset=2 → rows 3–5 of offset=0 ordering (offset paging ✓)
```

Licensing note: BotMarket datasets carry explicit `license: CC BY 4.0` with
OEC/CEPII citation — cite "BACI (CEPII), via the Observatory of Economic
Complexity (Datawheel)" on any `source='oec'` figure.

## Refresh cadence

- **Cron:** monthly (3rd, 05:15 UTC) via `.github/workflows/import-trade-data.yml`,
  incremental 3-year window (`--since=currentYear-2` default in the scripts).
- **Full backfill:** dispatch the workflow with `full_backfill: true` —
  ~120 Comtrade calls (of 500/day). OEC is parked (see Phase 0 findings; the
  old ~1,100-request estimate assumed a pre-aggregated dataset that doesn't
  exist — the real bilateral-HS6 cost is ~100k+ requests). The workflow's OEC
  step is gated on the `OEC_TRADE_DATASET_SLUG` secret being set (skips, not
  fails, while OEC stays parked); the Comtrade step already runs `always()`.
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
| 2026-07-04 | comtrade | full backfill (`--full`, local dev machine) | 630,118 | 20 reporters × HS2+HS4 × 2001–2026 window; years 2001–2025 landed. DB count for `source='comtrade'` matches the importer total exactly. Products: 1,362 (97 HS2 + 1,265 HS4 — matches the scope estimate). `WLD` absent by design — the world series comes from the manual TradeMap path (per import-comtrade.ts header), so the cross-source world-total SQL check above stays moot until the first TradeMap drop. |
| 2026-07-04 | comtrade | idempotency re-run | identical | Two full re-run attempts died mid-fetch on transient TLS resets (`EADDRNOTAVAIL`, then `ECONNRESET`) — likely connection-level throttling after ~260 calls/day from one IP; the importer only retries HTTP 429/5xx, not socket errors (hardening opportunity for the cron). Across the partials, 15/20 reporters re-fetched counts byte-identical to run 1; a CN-scoped `--full --reporter=CN` re-run then fetched the identical 31,386 rows and upserted cleanly — fetch and upsert idempotency both demonstrated. |
