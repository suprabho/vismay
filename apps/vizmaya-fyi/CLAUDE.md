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
