# dc-yahoo-stock-scraper (Apify actor)

Fetches daily OHLCV bars from Yahoo Finance for the **AI Data Centers**
international tickers (TSE/TWSE/KRX/Euronext/HKEX) and returns them shaped for
`dc_stock_prices`.

## Why it exists

Yahoo Finance blocks datacenter IPs. Both GitHub Actions and Vercel run on
datacenter IPs, so the `dc_stock_prices` importer can't fetch the non-US tickers
directly (that's what kept the cron failing). This actor runs the same fetch on
**Apify's infrastructure through a residential proxy**, so Yahoo sees a
residential IP. The importer
([`apps/vizmaya-fyi/scripts/ai-data-centers/import-stock-prices.ts`](../../apps/vizmaya-fyi/scripts/ai-data-centers/import-stock-prices.ts))
calls it over the Apify REST API and upserts the rows.

US tickers still come from massive.com in the importer — this actor only covers
the international names.

## I/O

**Input** (`.actor/input_schema.json`):

| field | default | notes |
|-------|---------|-------|
| `tickers` | – (required) | Yahoo symbols, home-exchange form: `2317.TW`, `005930.KS`, `8035.T`, `0981.HK` |
| `range` | `3mo` | `1mo`/`3mo`/`6mo`/`1y`/`2y`/`5y`/`10y`/`max` |
| `interval` | `1d` | bar interval |
| `proxyGroup` | `RESIDENTIAL` | `DATACENTER` is free but Yahoo may block it |

**Output** — one dataset item per daily bar, ready for `dc_stock_prices`:

```json
{ "ticker": "2330.TW", "trade_date": "2026-07-07", "open": 1075, "high": 1090, "low": 1070, "close": 1085, "volume": 24118000 }
```

`close` is Yahoo's split-adjusted (not dividend-adjusted) close, matching the
massive.com US feed. `trade_date` is the exchange-local calendar day.

## One-time setup

1. **Create a free Apify account** — <https://console.apify.com/sign-up> (email
   only, no credit card, no phone). The free plan's $5/mo credit covers this
   actor many times over — one run of ~9 tickers is well under a cent.
2. **Deploy this actor.** Either:
   - **CLI:** `npm i -g apify-cli`, then from this directory: `apify login`
     followed by `apify push`. The actor id it prints is `<username>/dc-yahoo-stock-scraper`.
   - **Web console:** New actor → empty → paste `src/main.js`, `package.json`,
     and the `.actor/*` files → Build.
3. **Grab two values** from the actor's page:
   - the **actor id** (`<username>~dc-yahoo-stock-scraper`, shown in the API tab), and
   - a **personal API token** (Settings → Integrations → API token).
4. **Add them as GitHub repo secrets** (in the `Production` environment, next to
   the existing Supabase/massive secrets):
   - `APIFY_TOKEN`
   - `APIFY_ACTOR_ID` (e.g. `yourname~dc-yahoo-stock-scraper`)

That's it — the daily [`import-dc-stock-prices.yml`](../../.github/workflows/import-dc-stock-prices.yml)
cron will start filling the international tickers automatically. Dispatch it once
with `full_backfill=true` to load ~5 years of history.

## Local test

```bash
npm install
# provide input via Apify's local storage, or run on the platform:
apify run -p
```

## Cost

Compute is ~$0.001/run. Residential proxy is metered at ~$8/GB, but 9 tiny JSON
responses/day is a few MB/month — cents. Comfortably inside the free $5/mo. If
you'd rather pay nothing at all, set `proxyGroup: "DATACENTER"` (free tier's 5
shared IPs) and see whether Yahoo tolerates it — `RESIDENTIAL` is the safe default.
