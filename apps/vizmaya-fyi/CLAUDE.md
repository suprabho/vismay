# Claude context for vizmaya-fyi

## Active initiative: DB-backed content

Branch `feat/db-backed-content` is migrating story content (markdown + yaml + chart JSON) from the filesystem into Supabase Postgres so edits can go live without redeploying code.

**Plan + phase breakdown:** [docs/db-backed-content-plan.md](docs/db-backed-content-plan.md) — read this before making changes in this area.

Key points:
- Storage is **blob, not normalized** — one row per story with raw md/yaml as text columns. Keeps `gray-matter` / `yaml.parse` unchanged.
- Supabase is already wired (`lib/supabase.ts`, migrations 001–004). Next migration: 005.
- Readers route through `lib/contentSource.ts` (to be built) with `CONTENT_SOURCE=fs|db` env var — preserves local dev loop on `fs`.
- Files in `content/stories/` stay in git as backup during cutover.

## Content structure (current)

Per story in `content/stories/`:
- `<slug>.md` — prose + YAML frontmatter
- `<slug>.config.yaml` — map/scroll/chart config (550–750 lines)
- `<slug>.share.yaml` — social card definitions
- `<slug>/charts/*.json` — chart data served at runtime by `app/api/chart-data/[slug]/[id]/route.ts`

Readers: `lib/content.ts`, `lib/storyConfig.ts`. Rendering: SSG via `generateStaticParams` in `app/story/[slug]/page.tsx`.

## Autoplay video render

`/api/story-video/[slug]?aspect=9:16|16:9` produces a downloadable MP4 of an autoplay session. It has two execution modes that share one polling-friendly response shape (`{ status: 'ready' | 'rendering', public_url? }`):

- **Sync mode** (local dev): the route runs `lib/storyVideoRender.ts` in-process. Needs `ffmpeg` on PATH (`brew install ffmpeg`) and Playwright Chromium (`npx playwright install chromium`). Request blocks for ~real-time playback.
- **Dispatch mode** (production): when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set, the route fires a `workflow_dispatch` to `.github/workflows/render-video.yml` and returns 202. The Actions runner does the render and uploads to the `story-video` bucket; the UI polls the same endpoint until the cached row appears.

**Vercel env vars** (production):
- `GITHUB_DISPATCH_TOKEN` — fine-grained PAT with `Actions: write` on this repo
- `GITHUB_DISPATCH_REPO` — `owner/repo` (e.g. `suprabho/vismay`)
- `GITHUB_DISPATCH_REF` — branch the workflow runs from (defaults to `main`)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — already required for other paths

**GitHub repo secrets** (the workflow itself needs these):
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`

Vercel default runtime can't host the sync path — Playwright needs a real Chromium and ffmpeg has to be on PATH, neither of which the serverless runtime provides. The dispatch path works around this without standing up a dedicated worker. If volume grows to where Actions minutes are a concern, the `renderStoryVideo` function is the seam for moving to Fly.io / Railway / a Node service — only the dispatch wiring would change.

### Silent (no-narration) video

A narrated render paces the headless walk off the TTS audio cues (`cue.end_ms - cue.start_ms`). Pass `narration=false` to render a **silent** video instead — no audio track, and the per-unit dwell time comes from a config file rather than audio:

- **Surfaces:** `?narration=0` on the API route · `--no-narration` on `scripts/generate-video.ts` · `narration: false` on the `render_story_video` MCP tool · the `narration` input on `render-video.yml`. All default to narrated.
- **Pacing config:** `content/stories/<slug>.timing.yaml` (also `stories.timing_yaml` after migration 060). `defaultMs` sets the fallback dwell; per-unit `ms` overrides key on the same `(parentIndex, subIndex, sliceIndex)` identity as `<slug>.tts.yaml`. Parser: [packages/content-source/src/storyTiming.ts](../../packages/content-source/src/storyTiming.ts). With no file, every unit holds `DEFAULT_UNIT_MS` (5s). Unlike narration, **every** mobile unit gets a cue (methodology included).
- **Coexistence:** silent and narrated renders are distinct rows (`story_videos.narration`, migration 060 widens the unique key) and distinct objects (`<slug>/<aspect>.silent.mp4`), so a story can have both. The silent timeline is synthesized in-memory ([silentTimeline.ts](../../packages/content-source/src/silentTimeline.ts)) — nothing is written to the audio tables.
- **Deploy requirement:** apply migration `060_silent_video.sql` (adds `stories.timing_yaml` + `story_videos.narration`). Reads degrade gracefully if the code ships first.

## Story PDF render (report + slides)

`/api/story-pdf/[slug]?format=report|slides` produces a downloadable PDF. Same dispatch-or-sync split as the video pipeline; cheaper because the render needs only Chromium (no ffmpeg, no audio).

- **Routes Playwright screenshots:** `/story/[slug]/report` (letter portrait booklet) and `/story/[slug]/slides` (1920×1080 16:9 deck). Both accept `?print=1` to strip dev-preview chrome.
- **Render entry:** `lib/storyPdfRender.ts` → `renderStoryPdf({slug, format, baseUrl, force})`. Waits on `window.__pdfReady__` (set by the readiness coordinator in [lib/pdfReadiness.ts](lib/pdfReadiness.ts) once all maps fire `onReady` plus a short ECharts settle window).
- **Cache key:** `(slug, format, content_revision_hash)` where the hash is sha256 over markdown + config.yaml + share.yaml + report.yaml + every chart JSON for the slug. Implementation: [lib/storyPdf.ts](lib/storyPdf.ts).
- **Dispatch:** `lib/storyPdfDispatch.ts` fires `.github/workflows/render-pdf.yml` when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set. Same env vars as video.
- **Per-story override config:** `content/stories/<slug>.report.yaml` (also `stories.report_yaml` in the DB after migration 010). Edited via the `/reports/[slug]` builder (referer-gated; dev mode allows direct nav). Schema: skip/include + heading/subheading/paragraphs + per-page chart override. See [lib/storyReportConfig.ts](lib/storyReportConfig.ts).

**Deploy requirements** (in addition to the video ones above):
- Apply migration `010_story_pdfs.sql` — adds the `story_pdfs` table, the `story-pdf` bucket, and the `report_yaml` column on `stories`.
- No new env vars; the dispatch path reuses `GITHUB_DISPATCH_TOKEN` / `GITHUB_DISPATCH_REPO` / `GITHUB_DISPATCH_REF`.
- Same GitHub repo secrets as the video workflow (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`).

## Story HTML newsletter render (+ Substack export)

`/api/story-newsletter/[slug]` produces a hosted HTML issue of a story with
selected map sections, charts and deck panels captured as static PNGs. Same
dispatch-or-sync split and `{ status: 'ready' | 'rendering', public_url? }`
polling shape as the PDF/video pipelines. One render yields two artifacts in
the `story-newsletter` bucket:

- `<slug>/newsletter.html` (`public_url`) — inline-styled, email-safe,
  600px single-column document; doubles as the browser preview and works in
  any ESP.
- `<slug>/newsletter.substack.html` (`substack_url`) — stripped semantic
  HTML (h2/h3, p, figure/img, blockquote, hr) matched to what Substack's
  editor keeps on paste.

**Substack v1 workflow (no API — Substack doesn't have a public one):** the
`/newsletters/[slug]` builder's **Copy for Substack** button copies the
substack variant as rich text; paste into a new Substack post, set
title/subtitle, publish — Substack re-uploads the referenced images to its
CDN and sends it as both the email newsletter and the blog post. The
substack variant's public URL also works with Substack's post-import. A
direct (unofficial, cookie-auth) API push is a deliberate non-goal for v1.

- **Capture surface:** `/story/[slug]/newsletter` (`NewsletterSurface` in
  `@vismay/render-surface`, mirrored in apps/render) renders only the visual
  blocks at 1200px behind `[data-newsletter-visual="<key>"]` markers; the
  worker waits for `window.__pdfReady__` (shared readiness coordinator) then
  element-screenshots each marker. Signed-URL-gated (middleware matcher).
- **Render worker:** [packages/content-source/src/storyNewsletterRender.ts](../../packages/content-source/src/storyNewsletterRender.ts)
  (`renderStoryNewsletter`) — capture + pure HTML assembly
  ([storyNewsletterHtml.ts](../../packages/content-source/src/storyNewsletterHtml.ts)).
  Text-only issues skip the browser entirely. App wrapper
  [lib/storyNewsletterRender.ts](lib/storyNewsletterRender.ts) owns URL
  signing; CLI: `npx tsx scripts/generate-newsletter.ts <slug> [--force]`.
- **Per-story config:** `content/stories/<slug>.newsletter.yaml` (also
  `stories.newsletter_yaml` after migration 065). Inclusive by default —
  every unit ships with text + visuals; overrides exclude units, hide
  map/visual/text per unit, set captions, and frame the issue
  (subject/preheader/intro/outro/CTA). Parser + block resolver:
  [packages/content-source/src/storyNewsletterConfig.ts](../../packages/content-source/src/storyNewsletterConfig.ts).
  Edited via the `/newsletters/[slug]` builder (signed-URL-gated).
- **Cache key:** `(slug, content_revision_hash)` where the hash is sha256
  over markdown + config.yaml + newsletter.yaml + every chart JSON. Rows in
  `story_newsletters`; images at `<slug>/images/<key>.png` with `?v=<hash>`
  cache-busting.
- **Dispatch:** `storyNewsletterDispatch.ts` fires
  `.github/workflows/render-newsletter.yml` when `GITHUB_DISPATCH_TOKEN` +
  `GITHUB_DISPATCH_REPO` are set. Honors `RENDER_SURFACE_URL_NEWSLETTER` for
  the render-service strangler, like report/slides.

**Deploy requirements:**
- Apply migration `065_story_newsletters.sql` — adds the `story_newsletters`
  table, the `story-newsletter` bucket, and `stories.newsletter_yaml`.
- No new env vars; the workflow reuses the PDF pipeline's secrets
  (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_MAPBOX_TOKEN`, `ADMIN_SESSION_SECRET`).

## Epics (/energy-profile, /epstein, …)

Topic collections that bundle a bespoke landing page with curated vizmaya stories. Data model lives in migration `015_epics_iea.sql` (per-epic tables still carry the `iea_` prefix from when the epic was called "iea"; renamed to `energy-profile` in migration 019).

- `epics` — `slug`, `name`, `description`, `landing_component`. The discriminator picks which React component the route renders.
- `story_epics` — many-to-many between `stories.slug` and `epics.slug`, with optional `position` for ordering.
- Per-epic data tables alongside (`iea_news`, `iea_countries` so far).

URLs are top-level per epic (`/energy-profile`, `/epstein`) rather than `/epic/<slug>` — each landing page is hand-built. Reads go through `lib/epics.ts`.

### Energy Profile news pipeline

`.github/workflows/scrape-energy-profile-news.yml` runs daily (06:15 UTC) — pulls Google News RSS for "International Energy Agency", hands each new article to Gemma (`gemma-4-26b-a4b-it` via the Gemini API, prompt-engineered JSON output) for ISO country-code tagging, and upserts into `iea_news`. Idempotent on `source_url`.

- **Script:** [scripts/energy-profile/scrape-news.ts](scripts/energy-profile/scrape-news.ts). Run locally with `pnpm energy-profile:scrape`.
- **Manual run in prod:** GitHub → Actions → "Scrape Energy Profile news" → "Run workflow".
- **Required repo secret** (in the `Production` environment): `GEMINI_API_KEY` (shared with render-audio). The Supabase secrets are reused from the other workflows.

### Energy Profile country detail

Each map pin on `/energy-profile` opens a detail sheet with the editorial summary, four ECharts visualisations (electricity mix, primary energy mix, GHG from energy, renewables share) plus four headline stat tiles. Data lives in `iea_country_energy` (one row per `country_code × indicator × year`) and is loaded from Our World in Data's `owid-energy-data.csv` (CC BY 4.0, refreshed annually each April). The 12 hand-written editorial summaries on `iea_countries` are preserved across re-imports — the importer only touches `name`, `lat`, `lng`.

- **Schema:** [supabase/vizmaya-fyi/migrations/018_iea_country_energy.sql](../../supabase/vizmaya-fyi/migrations/018_iea_country_energy.sql).
- **Importer:** [scripts/energy-profile/import-owid.ts](scripts/energy-profile/import-owid.ts). Run with `pnpm energy-profile:import-owid`. Manual — OWID's annual refresh doesn't justify a cron yet.
- **Reader:** `getIeaCountryProfile(code)` in [lib/epics.ts](lib/epics.ts) — one round-trip that returns chart-shaped timeseries, latest-year tile values, and per-country news (30d window).
- **API:** `/api/energy-profile/country/[code]` ([app/api/energy-profile/country/[code]/route.ts](app/api/energy-profile/country/[code]/route.ts)).
- **UI:** [app/energy-profile/CountryDetail.tsx](app/energy-profile/CountryDetail.tsx) rendered inside the shared [components/DetailSheet.tsx](components/DetailSheet.tsx) (mobile bottom sheet, desktop left-side panel — same pattern as `/epstein`).
- **Adding indicators:** extend `INDICATOR_MAP` in the importer plus `getIeaCountryProfile`'s shaping logic; nothing in the schema changes.

### IEA monthly oil prices

Pump prices for gasoline, automotive diesel and light fuel oil across **33 countries** (OECD + Brazil + India), 2015-01 onwards, in both USD/L and national currency. Renders as a "Retail fuel prices" line chart inside the country detail sheet (only for the 33 IEA countries).

- **Schema:** [supabase/vizmaya-fyi/migrations/037_iea_oil_prices_monthly.sql](../../supabase/vizmaya-fyi/migrations/037_iea_oil_prices_monthly.sql) — `iea_oil_prices_monthly(country_code, product, currency, month, value)`.
- **Importer:** [scripts/energy-profile/import-iea-oil-prices.ts](scripts/energy-profile/import-iea-oil-prices.ts). Reads `scripts/energy-profile/data/iea-oil-prices-monthly.csv`. Run with `pnpm energy-profile:import-iea-oil-prices`.
- **Refresh workflow:** IEA publishes the xlsx excerpt monthly. Open the `raw data` sheet, save-as CSV at the path above, re-run the importer. Idempotent (upsert on `country_code,product,currency,month`).
- **Reader:** extended `getIeaCountryProfile` in [lib/epics.ts](lib/epics.ts) — adds `timeseries.oilPrices` (last 60 months, USD/L).
- **Chart:** [components/energy-profile/charts/OilPricesChart.tsx](components/energy-profile/charts/OilPricesChart.tsx).

### Global Trade (epic seeded as draft — data layer live)

Yearly goods exports by HS product (HS2 + HS4) for the world aggregate plus
the top-20 exporters, 2001+. Three providers write the same long fact table
with `source` in the PK (`'oec' | 'comtrade' | 'trademap'`) so re-imports
never clobber across providers; readers pin one source per view. Full
provenance + gotchas: [vizmaya-data/global-trade/CLAUDE.md](../../vizmaya-data/global-trade/CLAUDE.md).

- **Schema:** [supabase/vizmaya-fyi/migrations/064_global_trade.sql](../../supabase/vizmaya-fyi/migrations/064_global_trade.sql) — `trade_countries`, `trade_products`, `trade_product_exports`, plus the `global-trade` epic row (`status='draft'`, so it stays invisible until the landing page ships). [065_trade_bilateral.sql](../../supabase/vizmaya-fyi/migrations/065_trade_bilateral.sql) adds `trade_bilateral_flows` (intra-tracked-pair HS2, both flow lenses) for the trade-web viz.
- **Importers:** [scripts/trade/](scripts/trade/) — `pnpm trade:import-comtrade` (UN Comtrade API, **primary** — first backfill 2026-07-04: 630k rows, 2001–2025), `pnpm trade:import-comtrade-bilateral` (country↔country HS2 flows, ~2 calls/year), `pnpm trade:import-trademap` (manual TradeMap Excel→CSV drop under `scripts/trade/data/` — TradeMap has no API and must not be scraped; sole source of the `WLD` world series), `pnpm trade:import-oec` (**parked** — BotMarket only carries bilateral-HS6 BACI; see vizmaya-data/global-trade gotchas). All support `--dry-run`/`--full`/`--since`.
- **Cron:** [.github/workflows/import-trade-data.yml](../../.github/workflows/import-trade-data.yml) — monthly incremental; `workflow_dispatch` inputs for `full_backfill` and read-only BotMarket `discovery`. The OEC step skips while `OEC_TRADE_DATASET_SLUG` is unset.
- **Reader:** `getWorldTradeProfile` / `getProductExports` / `getReporterTradeProfile` in [packages/content-source/src/trade.ts](../../packages/content-source/src/trade.ts) — same dense `ChartSeries` shape as the energy-profile charts. World profile returns null until the first TradeMap drop.
- **API:** `/api/global-trade/world`, `/api/global-trade/product/[hsCode]`.
- **Secrets** (Production environment): `OEC_BOTMARKET_API_KEY`, `COMTRADE_API_KEY` (plus the usual Supabase pair). `OEC_TRADE_DATASET_SLUG` deliberately unset while OEC is parked.

### AI Data Centers epic (/ai-data-centers)

Tracks the build-out of frontier AI data centers (power, compute, capital cost) from **Epoch AI's Frontier Data Centers Hub** (CC BY 4.0, https://epoch.ai/data/ai-data-centers, refreshed ~weekly). Two surfaces share one dataset: a live Supabase-backed **explorer** and a frozen editorial **story**.

- **Schema:** [supabase/vizmaya-fyi/migrations/063_ai_data_centers.sql](../../supabase/vizmaya-fyi/migrations/063_ai_data_centers.sql) — `dc_facilities(slug, …, lat, lng, h100_equivalents, power_mw, capex_usd_bn, …)` (one row per facility) + `dc_facility_timeline(facility_slug, metric, as_of, value)` (long-form build-out series). Seeds the `ai-data-centers` epic row as **draft / hidden** — flip `status='published'` + `show_on_home=true` once the data is reconciled (see below).
- **Importer:** [scripts/ai-data-centers/import-data-centers.ts](scripts/ai-data-centers/import-data-centers.ts). Run with `pnpm ai-data-centers:import`. Downloads Epoch's two CSVs (live path is `epoch.ai/data/data_centers/*.csv`; the `generated/` path 404s but is tried first — with local-file fallback via `--facilities`/`--timelines <path>`), resolves columns through header-drift-tolerant aliases (note the timeline's facility column is `Data center`, not `Name`), and upserts idempotently on `slug` and `(facility_slug, metric, as_of)`. **Coordinates:** Epoch ships an Address but no lat/lng, so the importer **geocodes the Address via Mapbox inline** (`geocodeMissing`, needs `NEXT_PUBLIC_MAPBOX_TOKEN`) to populate map pins; curated entries in [lib/ai-data-centers/facilityCoords.ts](lib/ai-data-centers/facilityCoords.ts) are the override layer (win over geocoding). `--geocode` prints override suggestions without writing. Test offline against `scripts/ai-data-centers/data/sample_*.csv`.
- **Refresh workflow:** [.github/workflows/import-ai-data-centers.yml](../../.github/workflows/import-ai-data-centers.yml) — weekly (Mon 07:30 UTC) + manual dispatch. Runs in Actions because epoch.ai's Cloudflare blocks generic fetchers. Uses `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_MAPBOX_TOKEN` (all already Production secrets).
- **Readers:** `listDataCenters()` + `getDataCenterProfile(slug)` in [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts).
- **API:** `/api/ai-data-centers` (list) + `/api/ai-data-centers/[slug]` (facility + timeline). Both `force-dynamic`, cached `s-maxage=3600`.
- **Explorer UI:** [app/ai-data-centers/page.tsx](app/ai-data-centers/page.tsx) → `AiDataCentersLanding.tsx` (Mapbox markers sized by a power/compute/capital toggle + sortable leaderboard) → `AiDataCenterDetail.tsx` in the shared [components/DetailSheet.tsx](components/DetailSheet.tsx) (stat tiles + per-metric timeline ECharts from `components/ai-data-centers/charts/`). Palette in [app/ai-data-centers/theme.ts](app/ai-data-centers/theme.ts). The page degrades to an empty map before migration 063 / the first import.
- **Editorial story:** source of record in [vizmaya-data/ai-data-centers/](../../vizmaya-data/ai-data-centers/) (CSVs + `charts/*.json` with `_meta` + `story.yaml` + `INGEST_NOTES.md`); runtime copies at `content/stories/ai-data-centers.{md,config.yaml}` + `content/stories/ai-data-centers/charts/*.json` (served by `/api/chart-data/[slug]/[id]`). **The story figures are a representative snapshot** — epoch.ai is unreachable from the sandbox, so reconcile against the real `dc_*` tables (INGEST_NOTES.md checklist) before flipping the epic to published.

### AI Data Centers news + stock pipeline

Two daily feeds extend the epic beyond the Epoch facility registry: tagged
industry news (AI / data centers / microprocessors / semiconductors) and
daily price bars for ~29 related stocks, each tracked on its **home exchange**
(NVDA on NASDAQ, Samsung as 005930.KS, Tokyo Electron as 8035.T, SMIC as
0981.HK, …) in its native currency. Two deliberate exceptions: TSMC and ASML
are tracked via their US ADRs (`TSM` on NYSE, `ASML` on NASDAQ; migration 067
retired `2330.TW` and `ASML.AS`) so their prices import automatically with
the US tickers instead of through the intl paths.

- **Schema:** [supabase/vizmaya-fyi/migrations/065_dc_news_stocks.sql](../../supabase/vizmaya-fyi/migrations/065_dc_news_stocks.sql) — `dc_news` (unique on `source_url`; classifier rejects persist with `relevant=false` so they're never re-sent to the LLM), `dc_stocks` (curated ticker registry, seeded in the migration — **adding a company is a single insert**, both pipelines read the table), `dc_stock_prices` (daily OHLCV, PK `(ticker, trade_date)`, dates in the exchange's own calendar, close split-adjusted).
- **News scraper:** [scripts/ai-data-centers/scrape-news.ts](scripts/ai-data-centers/scrape-news.ts) (`pnpm ai-data-centers:scrape-news`) — Google News RSS across four queries, then Claude Haiku (`claude-haiku-4-5` via `@anthropic-ai/sdk`, structured outputs) applies a relevance gate + topic tags + ticker links. Classification runs through a 4-worker pool with a 25-min soft deadline (the sequential Gemma version needed 40–60 min/day and was hard-killed at the workflow's 30-min cap); single-feed RSS 503s are retried then skipped, not fatal. Cron: [.github/workflows/scrape-ai-data-centers-news.yml](../../.github/workflows/scrape-ai-data-centers-news.yml) (daily 06:45 UTC, staggered off the 06:15 energy-profile scrape). Secrets: the Supabase pair + `ANTHROPIC_API_KEY`.
- **Stock importer → [scripts/ai-data-centers/import-stock-prices.ts](scripts/ai-data-centers/import-stock-prices.ts)** (`pnpm ai-data-centers:import-stocks`, cron [import-dc-stock-prices.yml](../../.github/workflows/import-dc-stock-prices.yml) 22:45 UTC Mon–Fri). One script, two sources split by `dc_stocks.market` (massive.com is US-only):
  - **US tickers → massive.com** market-data REST API (Polygon-compatible `/v2/aggs/ticker/{t}/range/1/day/{from}/{to}`, `Authorization: Bearer $MASSIVE_API_TOKEN`; returns fractional split-adjusted volume, rounded to the `bigint` column). 429-cooldown + retry for the free tier.
  - **International tickers (TW/KR/JP/NL/HK) → Yahoo Finance via the Apify actor [apify/dc-yahoo-stock-scraper](../../apify/dc-yahoo-stock-scraper/).** Yahoo blocks datacenter IPs (CI *is* one), so the importer can't fetch it directly — that's what kept this cron failing. The actor runs the same Yahoo v8 chart fetch on Apify's infra through a **residential proxy** (Yahoo sees a residential IP), scraping all intl tickers **concurrently**; the importer **starts the run async and polls** its status (not the `run-sync` endpoint — that hard-caps the wait at ~5 min, which a cold-start + residential scrape blew past, which was the failure), then reads the dataset and upserts the rows. Needs `APIFY_TOKEN` + `APIFY_ACTOR_ID`; missing ⇒ US still imports and intl is skipped with a note. Effectively free — Apify's $5/mo tier (email signup, no phone/card) covers a ~9-ticker daily run many times over. Deploy steps in the actor README.
  - Flags: `--full` (~5y) / `--days N` / `--ticker` / `--dry-run`. **First deploy: migration 065, add `MASSIVE_API_TOKEN` + `APIFY_TOKEN`/`APIFY_ACTOR_ID`, dispatch with `full_backfill=true`.**
  - **Manual fallback:** the admin **Pipeline** tab → AI Data Centers → *"International prices — Stooq upload"* (`apps/admin`, component `components/vizmaya/pipeline/StockUploadCard.tsx`, route `app/api/vizmaya/pipeline/stock-prices/route.ts`) still hand-loads a browser-downloaded Stooq CSV via `parseStooqCsv` + `upsertDcStockPrices` in [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts) (`listDcStockUploadTargets` drives the UI). Kept as a backstop for days Apify (or Yahoo) misbehaves; not the primary path anymore.
  - Note: api.massive.com, api.apify.com and Yahoo are all unreachable from the dev sandbox proxy — the cron runs in Actions, the actor runs on Apify, the Stooq upload happens from a browser.
- **Readers:** `getDcNews({limit, topic, ticker})` + `getDcStockMarket(days)` in [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts) — the market reader returns per-ticker close series + window `changePct`, keeping empty-series tickers visible pre-backfill.
- **API:** `/api/ai-data-centers/news` (`?limit&topic&ticker`) + `/api/ai-data-centers/stocks` (`?days`, default 90, max 730). Static segments win over the `[slug]` route, so no collision.
- **UI:** the public landing/detail pages don't render news or stocks yet — that's the natural next step once the tables have data. Internally, the admin **Pipeline** tab (`/vizmaya/pipeline?epic=ai-data-centers` in apps/admin) monitors both feeds: scrape volume + relevance-gate stats, topic/ticker breakdowns, recap freshness, stock-feed freshness, and a filterable news list (including classifier-rejected rows); the sibling **Recaps** tab (`/vizmaya/recaps`) shows the full recap snapshot timeline. Both tabs are epic-generalized — the DC feeds register as an adapter in [packages/content-source/src/pipelines.ts](../../packages/content-source/src/pipelines.ts), backed by `getDcPipelineStats()` + `listDcNewsForAdmin()` in [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts).

### AI Data Centers daily snapshot (`/ai-data-centers/daily`)

The epic's second output beside the live explorer: one **frozen edition a
day** (window 08:15 → 08:15 UTC, public at 09:00 UTC, never edited after
publish) that curates the previous 24 hours of AI, energy and sustainability
news into one static page — headline + deck, a Doom v Boom reading, six
metric-led key notes, then geography / AI layer / research / AI + energy
chapters, each with its own bespoke SVG/canvas visualisation and a slide-over
panel for the underlying stories, a derived Sources chapter and an archive
rail. PRD: [docs/ai-data-centers-daily-snapshot-prd.md](../../docs/ai-data-centers-daily-snapshot-prd.md);
design reference: **`/ai-data-centers/daily/sample`** — the fixture rendered
through the real components. There is no separate mockup file: a design change
is made in the components and reviewed on that route, so the reference can
never drift from what ships.

- **Schema:** [supabase/vizmaya-fyi/migrations/078_dc_editions.sql](../../supabase/vizmaya-fyi/migrations/078_dc_editions.sql) — snapshot tag columns on `dc_news` (`layer`, `place`, `region`, `theme`, `mood`, `energy`, `facts`, `classifier_version`), the seeded `dc_places` list, `dc_papers`, and `dc_editions` (the row *is* the page: prose + every computed number + the frozen `story_ids` / `paper_ids` / `iea_ids` membership). A trigger rejects updates to a published row; `ai_generations` accepts kind `edition_edit` for the editor audit. `dc_news_recaps` (066) stays read-only for the admin Recaps timeline.
- **Pipeline (GitHub Actions, all in `Production`), triggered by Vercel Cron.** The three daily jobs run as ONE chained workflow, [dc-morning-edition.yml](../../.github/workflows/dc-morning-edition.yml) (08:15 UTC = the window close): scrape → papers → compose, each reusing its own workflow file via `workflow_call`. They used to be three crons and GitHub's scheduler drifted them hours apart, so the composer once wrote an edition from an unfilled window; the next day it did not start the chain or the publish crons at all. So **no daily workflow carries a `schedule:`** — `apps/vizmaya-fyi/vercel.json` crons hit [app/api/ai-data-centers/cron/[job]/route.ts](app/api/ai-data-centers/cron/[job]/route.ts) (`morning` 08:15, `publish` 09:00, `publish-late` 09:30 UTC), which dispatches the workflow through the same `GITHUB_DISPATCH_*` env the render routes use. Auth is Vercel's `Authorization: Bearer $CRON_SECRET` (env var on the vizmaya-fyi project; fails closed). Minute-exact crons need the Pro plan — on Hobby, Vercel runs a daily cron once within the hour. The individual files keep `workflow_dispatch` for manual runs and the admin buttons; `skip_feeds` on the chain composes without re-scraping.
  1. [scrape-news.ts](scripts/ai-data-centers/scrape-news.ts) (first job) — the existing Haiku classifier now also returns the snapshot tags and `facts` in the same call. Dispatch with `backfill_days` (or `pnpm ai-data-centers:scrape-news -- --backfill-days 30`) once after migration 078 to tag history for the mood sparkline and field baselines.
  2. [ingest-papers.ts](scripts/ai-data-centers/ingest-papers.ts) (second job) ([ingest-dc-papers.yml](../../.github/workflows/ingest-dc-papers.yml)) — arXiv API across six categories → keyword gate → Haiku gate + extraction → `dc_papers` (upsert on `arxiv_id`, rejects kept with `relevant=false`).
  3. [compose-edition.ts](scripts/ai-data-centers/compose-edition.ts) (third job, ~08:45) ([compose-dc-edition.yml](../../.github/workflows/compose-dc-edition.yml)) — replaces the retired markdown recap worker. One typed gateway call (opus by default) writes the prose (headline, deck, 6 notes, per-layer briefs, research headline) and a second plans the section charts (see below); everything numeric is assembled deterministically in [packages/content-source/src/dcEditionAssembly.ts](../../packages/content-source/src/dcEditionAssembly.ts) and every note's lead number is grounded in the stories it cites. Falls back to a deterministic edition (`model='deterministic'`) on any model failure. Writes the single draft row; re-runs keep editor edits unless `--clear-edits`.
  4. [publish-edition.ts](scripts/ai-data-centers/publish-edition.ts) 09:00 + 09:30 UTC ([publish-dc-edition.yml](../../.github/workflows/publish-dc-edition.yml)) — freezes the draft (status, number, `published_at`) and pings the signed revalidate hook. Review is a window, not a gate: an admin Hold moves auto-publish by 30 min, once; `--force` publishes through a hold.
- **Readers/writers:** [packages/content-source/src/dcEditions.ts](../../packages/content-source/src/dcEditions.ts) (`getEdition`, `getLatestEdition`, `listEditions`, `getDraftEdition`, `saveDraftEdition`, `setDraftMembership`, `holdDraftEdition`, `publishDraftEdition`, `getMoodSeries`, `listPapersForEdition`, `assembleEditionNumbers`), re-exported from `epics.ts`; client-safe types + vocabularies in `dcEditionTypes.ts`.
- **Routes:** `/ai-data-centers/daily` (latest, ISR + revalidated on publish), `/ai-data-centers/daily/[date]` (static, immutable once published), `/ai-data-centers/daily/sample` (fixture, noindex). API: `/api/ai-data-centers/editions?limit=` (archive rail), `/api/ai-data-centers/editions/[date]` (row + resolved stories/papers), `POST /api/ai-data-centers/editions/revalidate?date=` (signed with `ADMIN_SESSION_SECRET`, called by the publish job and the admin).
- **Frontend:** server components under [app/ai-data-centers/daily/](app/ai-data-centers/daily/) render one edition row to static HTML; the client code is the slide-over `StoryPanel` (delegated `data-panel` handler, `#p=layer:semi` deep links), the canvas `GeoMap` (land mask shipped as a flat array), the hero's Boom Score ring (`BoomRing`: beautiful-headers' Particle Ring ported to Canvas 2D in `particleRing.ts`, no three.js; the share of `--boom` particles is the day's boom share, `(score + 1) / 2`, shown as a score out of 100), the scroll-spy nav and `QuadrantPlot`. No Mapbox, no ECharts, no client fetch. Tokens extend [app/ai-data-centers/theme.ts](app/ai-data-centers/theme.ts) (`energy`, `down`, `doom`/`boom` + `doomInk`/`boomInk` for the Doom v Boom reading, composition hues, map dots) with a light theme; fonts Prata + Public Sans/Space Mono via `next/font/google`.
- **The energy chapter has no fixed chart slots.** `EnergyChapter.tsx` reads the edition's own stories, not a pre-aggregated block: six vizzes each declare what they need from the stated `facts.figures`, score zero when this edition can't fill them, and the engine ranks the survivors, leads with the strongest and prints what it held back and why. A day with no disclosed capacity gets a different chart, never an empty axis; `perEdition.gw = null` means an edition disclosed nothing and draws as a gap, not a zero. Only *committed* power reaches the capacity bar (`isCommittedPower` in dcEditionAssembly, shared with the composition) — queue and lead-time figures stay on the "other figures" card.
- **Composer-planned charts (migration 079, `dc_editions.charts` + `chart_skips`) — one per section, guaranteed by a ladder.** Six sections: energy, the four layers, research. Each descends `EditionChartRung`s until something draws: **rung 1** the planner ([scripts/ai-data-centers/editionCharts.ts](scripts/ai-data-centers/editionCharts.ts)) over today's stated figures, one gateway call per section with one retry carrying the validator's refusal reason; rungs 2–3 (today against the trailing record / a dataset) are the chart agent's, next; **rung 4** ([editionChartFallbacks.ts](scripts/ai-data-centers/editionChartFallbacks.ts)) the record alone in code — Epoch facility power (dc, energy), tracked-stock moves per layer (`dc_stock_prices` tape), power per edition (energy), paper gains for the unit most papers report in or papers-by-field (research). Rung 4 needs no model, so a section only ends on its template when even the record is under three rows; the chart carries `rung`, the caption names the dataset, and the admin prints "rung 4 (why rung 1 gave nothing)". **No two sections show one comparison:** sections are placed in page order and a rung-1 plan that repeats half the rows or cited stories of one already placed yields to the record; a record builder used by one section (`RecordChart.key`) is skipped for the next, so energy gets facility power *by country* when dc has it *by site*. **Forms vary by the comparison:** the planner prompt names when to use lollipop / grouped bar / scatter / slope / waterfall, rung 4 uses lollipops for rankings, a line for the per-edition series and diverging bars (falls in `--down`) for stock moves. **SSR text measure:** ECharts' server renderer has no font metrics and drew mono labels off the card's left edge; `editionCharts.ts` installs `setPlatformAPI({ measureText })` with the real 0.6em-per-glyph width and caps category labels at a third of the chart width. Research is never asked at rung 1 (its numbers are in `dc_papers`, not stories); its chart replaces the results-at-scale scatter in the chapter's second card. Rung 1 in detail: the planner sees each section's stated figures with their v3 tags and plans ONE comparison as a flint spec, or skips with a reason. The plan is validated in [packages/content-source/src/dcEditionCharts.ts](../../packages/content-source/src/dcEditionCharts.ts) — every numeric cell must be a figure the row's cited story states (value, base unit or headline numeral), ≥ 3 rows, no measure column spanning > 50× — compiled through `@vismay/story-pipeline` `buildEChartsOption`, tuned for a static card (horizontal bars, top legend, mono face) and rendered to an SVG string with ECharts SSR. The page inlines the SVG and `chartSvg.ts` swaps the baked dark-palette hexes for CSS variables (the two hex tables — `TOKEN_HEX` there, `HEX_TO_VAR` here — must agree), so no chart code ships to the client and the light theme still works. A planned chart leads its section (`PlannedChart.tsx` in `LayerTile` / `EnergyChapter`); a skip leaves the template. `--charts-only` (workflow input `charts_only`, admin "Regenerate charts") re-plans on the existing draft without touching prose or edits; membership edits prune charts that quoted a dropped story. `pnpm ai-data-centers:sample-charts` runs the whole path on the fixture and writes `daily/sampleCharts.ts` for `/daily/sample`.
- **Figures are tagged (classifier v3) and judged.** Each `facts.figures[]` entry now carries `subject` (canonical entity), `scope` (site / company / market / policy), `status` (committed / target / forecast / queued / stated), `base` (MW / MWh / USD mn / bare share, via `figureMagnitude` in dcEditionAssembly — the one converter the scraper, the chart planner and the energy chapter share) and Jev's `confidence`. [scripts/ai-data-centers/jevFigureGate.ts](scripts/ai-data-centers/jevFigureGate.ts) asks `typesafe-ai/jev` (through the AI gateway, own `@ai-sdk/gateway` ^4 like the footshorts worker) one boolean per figure — literally stated, tags right — and drops below 0.5; fails open without `AI_GATEWAY_API_KEY`. After a classifier change dispatch the scrape with `retag_days` (or `--retag-days N`) so the current window carries the new fields before the next compose.
- **The composer runs on opus through the gateway.** `compose-edition.ts` calls `@vismay/ai-gateway` `generateText` with a zod schema for the prose and the chart plan (`COMPOSER_MODEL` / `COMPOSER_CHART_MODEL` override, a `text.*` alias or a gateway id — the bare alias `opus` is rejected). The workflow needs `AI_GATEWAY_API_KEY` in the Production environment (Gemini is no longer used here); the gateway team's spend cap applies, so a capped key silently produces deterministic editions with template charts — the admin's chart status line prints the reason.
- **`QuadrantPlot`** (research, results at scale) places its point labels with collision detection over a ring of candidate anchors, best of 40 seeded shuffles; "Regenerate layout" just advances the seed. Label widths are *estimated* (`WIDTH_CALIBRATION`) for the first paint — the server and client paint must match byte for byte — then, after mount and `document.fonts.ready`, measured with `getComputedTextLength()` and the layout re-placed where the estimate was off by more than a pixel.
- **Template-viz floor (`MIN_VIZ_ROWS = 3`, dcEditionAssembly).** Every deterministic viz — the capacity ledger (three rows that *state* MW; undisclosed rows only trail), the hyperscaler matrix (which also needs two kinds of move, not one column of dots), the horizon and orders timelines, and each energy-chapter card — draws only with three or more rows, one row per subject / supplier (two outlets on one site or one toolmaker collapse via `subjectKey`). The energy chapter's coverage charts (topic × region, clock, pressure v relief) additionally need six energy stories and at least one stated figure. Below the floor a tile prints its notes and no viz (and no viz eyebrow); a research chapter with no papers is just its notice. The energy figures card draws a rail only between figures that share kind, status and scope within the 50× range, so an untagged (pre-v3) figure gets no rail rather than a wrong one.
- **Admin:** `/vizmaya/editions` in `apps/admin` — draft banner with countdown, Publish now / Recompose (dispatches the compose workflow) / Hold, editable prose, membership checkboxes (re-derives the numbers), diff to the previous composer run, and the archive.
- **First deploy:** apply migration 078 → dispatch the scrape with `backfill_days=30` → dispatch `ingest-dc-papers` → dispatch `compose-dc-edition` → review in admin → `publish-dc-edition` (or Publish now). Gemini/Anthropic are unreachable from the dev sandbox proxy — use `--dry-run` locally to preview the deterministic layer.
- **Charts deploy (2026-09):** apply migration 079 *before* shipping the code (`EDITION_COLUMNS` selects `charts`, so reads fail on the old schema) → add `AI_GATEWAY_API_KEY` to the Production environment → dispatch the scrape with `retag_days=2` → dispatch `compose-dc-edition` (or admin Recompose) → check each section's chart status in the admin Editions tab.

### Searching for Umami (`umami` app + epic, seeded draft — corpus pipeline)

The food vertical. A standalone consumer app (`apps/umami/web`, registered as
app slug `umami` — AppEntry in `packages/verticals/src/data.ts`, default
domain umami.fyi) whose first corpus is scraped from TasteAtlas: the top-rated
dishes tagged under five Asian cuisines (India, China, Thailand, Indonesia,
Japan), one row per dish with region, category, key ingredients, rating and
source link. The epic + corpus pipeline stay homed here (vizmaya-fyi
scripts/data — same split as fifa-wc26, whose importer stayed after the epic
moved to footshorts). Corpus source of record + rights note:
[vizmaya-data/searching-for-umami/](../../vizmaya-data/searching-for-umami/)
(README + INGEST_NOTES).

- **Schema:** [supabase/vizmaya-fyi/migrations/069_searching_for_umami.sql](../../supabase/vizmaya-fyi/migrations/069_searching_for_umami.sql)
  — registers the `umami` row in `apps`, creates `food_dishes` (food-generic,
  keyed by `epic_slug`, unique on `(epic_slug, slug)`, public-read RLS), and
  seeds the `searching-for-umami` epic row (`app_slug='umami'`,
  `status='draft'`, hidden from home).
- **Consumer app:** [apps/umami/web](../umami/web) — landing + cuisine/dish
  explorer at `/` (reads `listFoodDishes()` with anon-only env, degrades to
  empty states without env), story reader at `/editorial/[slug]` via
  `@vismay/story-embed` (iframes vizmaya.fyi — no umami vertical/viz package
  yet, so umami stories carry no `vertical:` key and render as vizmaya's own).
  Admin gets Stories/Compose/Epics tabs at `/umami` from the `apps` row alone.
- **Reader:** `listFoodDishes(epicSlug)` in
  [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts)
  (service-role with anon fallback — `food_dishes` is public-read).
- **Scraper:** [scripts/searching-for-umami/scrape-tasteatlas.ts](scripts/searching-for-umami/scrape-tasteatlas.ts)
  (`pnpm searching-for-umami:scrape --headed`). **Local-run only** — TasteAtlas
  is behind Cloudflare and blocks datacenter IPs (sandbox proxy denies the
  domain outright; GH-hosted runners would 403 too, same lesson as Yahoo →
  Apify). **Listing-only capture** via system Chrome (`channel:'chrome'`,
  bundled Chromium is fingerprint-blocked), headed, fresh `.browser-profile`
  per listing; dish-page documents are hard-403'd and never visited, so
  `ingredients`/`rating_count` stay empty. Each listing serves exactly 10 dish
  cards to anonymous visitors → corpus ceiling is top-10 per cuisine. Full
  Cloudflare playbook + card-markup traps:
  `vizmaya-data/searching-for-umami/INGEST_NOTES.md`. Resumable, polite,
  writes only `dishes.json` — never the DB. Full run ~4 min.
- **Importer:** [scripts/searching-for-umami/import.ts](scripts/searching-for-umami/import.ts)
  (`pnpm searching-for-umami:import`, `--dry-run` validates without env) —
  dishes.json → `food_dishes`, idempotent upsert on `(epic_slug, slug)`.
  Hard-fails on descriptions > 600 chars (rights: summaries stay truncated).
- **Corpus status:** real scraped data since 2026-07-27 — 50 rows (top 10
  best-rated per cuisine) with live ratings, regions, categories, blurbs and
  CDN images; imported + idempotency-verified, sample rows purged from the DB.
  Ingredients backfilled for 19/50 from the recipe corpora (tag
  `ingredients:datasets`).
- **Recipe corpora (migration 070):** `food_recipes` + `food_ingredients` —
  internal grounding tables (NO anon RLS; instructions are rights-sensitive)
  fed by two untracked local datasets under `vizmaya-data/` (Archana's
  Kitchen 6.9k Indian recipes with instructions; CulinaryDB 45.8k world
  recipes + 1k-term ingredient vocabulary).
  `pnpm searching-for-umami:import-recipes` (idempotent, batched) and
  `pnpm searching-for-umami:backfill-ingredients` (fills dishes.json
  ingredient gaps by conservative title-matching, then re-run the dish
  importer). Provenance + rights:
  [vizmaya-data/searching-for-umami/INGEST_NOTES.md](../../vizmaya-data/searching-for-umami/INGEST_NOTES.md).
  Admin coverage: the umami desk's **Recipes** tab (`/umami/recipes` in
  apps/admin — stat cards, per-cuisine source bars, dish-backfill counts,
  searchable browse; readers `getFoodRecipeCoverage`/`listFoodRecipesForAdmin`
  in content-source epics.ts).
- **History layer (migration 071):** `food_history_subjects` +
  `food_history_events` — AI-extracted, per-claim-cited, **review-gated**
  dish/ingredient timelines from Wikipedia (MediaWiki API, CC BY-SA;
  paraphrase-enforced with a verbatim guard, `source_url` + `wiki_oldid`
  permalink per claim). Worker `pnpm searching-for-umami:enrich-history`
  (subject registry + title overrides in
  scripts/searching-for-umami/history-subjects.ts; curated place coords in
  lib/searching-for-umami/historyPlaceCoords.ts; `--force` replaces only
  ai-draft rows). Review at the umami **History** tab (`/umami/history`,
  approve/reject; readers `getFoodHistoryCoverage`/
  `listFoodHistoryEventsForAdmin`/`setFoodHistoryEventStatus` in
  content-source epics.ts). Composer grounding via the `food-history`
  provider (whole-subject cited timelines, drafts flagged). No anon RLS —
  public surfaces later via an additive reviewed-only policy (sketched in the
  migration). Full rationale + rights: vizmaya-data/searching-for-umami/INGEST_NOTES.md.
- **Deploy:** apply migration 069, `pnpm searching-for-umami:import`, create
  the Vercel project for `apps/umami/web` (root dir `apps/umami/web`, env
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and set
  `NEXT_PUBLIC_UMAMI_URL` on the admin Vercel project so cross-app links
  resolve.
- **Publish checklist (later):** ~~real scrape → re-import~~ (done 2026-07-27)
  → review/rewrite descriptions for rights (blurbs are truncated TasteAtlas
  editorial text) → flip epic to `published` in a follow-up migration.
  Composer grounding is live: `food-dishes` (list+search over the dish canon)
  and `food-recipes` (search-only over the 52k corpus, so the AI research
  agent reaches it; matches title / cuisine label / exact ingredient term)
  providers in `apps/admin/lib/libraryProviders.ts`, both scoped to the
  `umami` app. Remaining optional follow-up: a `verticals/umami-viz` package +
  VerticalEntry when umami wants custom food viz modules (that also means
  gen:sources + the transpile/dep wiring in the four shared surfaces).

## AI gateway

New AI calls (text + image) go through [@vismay/ai-gateway](../../packages/ai-gateway/README.md),
which wraps the Vercel AI Gateway. The existing direct `@google/genai` /
`@anthropic-ai/sdk` call sites (judge, energy summaries, scrape-news, epstein
scripts, generate-audio) still hit the providers directly — they'll migrate
batch-by-batch once the gateway has burned in.

**Migration 043 (`043_ai_generations.sql`)** adds the audit table the gateway
writes to. Apply before deploying any feature that calls `generateImage` /
`generateText` from the admin app.

**First user-facing feature:** prompt-to-image in the admin Assets tab — see
[apps/admin/CLAUDE.md](../admin/CLAUDE.md).

## TTS narration overrides (per-unit)

The audio pipeline is vismay-level: the whole engine lives in
[@vismay/content-source/storyAudioGenerate](../../packages/content-source/src/storyAudioGenerate.ts)
(`generateStoryAudio`), and `scripts/generate-audio.ts` is now a thin CLI
wrapper (load `.env`, parse argv, loop slugs). Because it resolves units through
the shared `resolveUnits` + `defaultNarrationText` (the same code the runtime
player and the admin Narration tab use), any vertical's DB story — footshorts,
vizf1 — gets audio through one path with `CONTENT_SOURCE=db`; the cue
`unit_index` stays aligned with the runtime by construction.

`generateStoryAudio` derives the spoken text for each mobile unit from heading +
paragraphs (stat sections speak the big number followed by its caption). To
override that text without editing the displayed markdown, save a
`<slug>.tts.yaml` (also `stories.tts_yaml` after migration 012):

```yaml
units:
  - unit: { parentIndex: 1, subIndex: 0, sliceIndex: 0 }
    script: "Custom narration for this unit."
```

- **Edit:** `/admin/<slug>` → "Narration" tab. Each mobile unit shows its current default + an override textarea. Save persists the YAML; "Regenerate audio" fires `render-audio.yml`.
- **Identity:** `(parentIndex, subIndex, sliceIndex)` — same as `resolveUnits` mobile units. Hero splits into `sliceIndex=0` (title, silent) and `sliceIndex=1` (dek+byline). Methodology units (`TTS_SKIP_IDS` in [lib/storyTts.ts](lib/storyTts.ts)) are intentionally excluded from TTS — the override input is disabled for them.
- **Cache invalidation:** the script's chunk hash includes the override text, so only edited chunks regenerate.

**Audio render dispatch:** `lib/storyAudioDispatch.ts` fires `.github/workflows/render-audio.yml` when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set (same envs as PDF/video). The workflow needs an additional repo secret: `GEMINI_API_KEY`. Without dispatch envs configured, the regen button returns `mode: 'unconfigured'` with a hint to run `npx tsx scripts/generate-audio.ts <slug> --force` locally.

**Deploy requirements:**
- Apply migration `012_story_tts.sql` — adds `stories.tts_yaml`.
- Add `GEMINI_API_KEY` to the `Production` environment in repo secrets so render-audio.yml can authenticate to Gemini.
