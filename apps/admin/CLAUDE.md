# Claude context for apps/admin

## AI gateway integration

All text + image generation in admin routes through [@vismay/ai-gateway](../../packages/ai-gateway/README.md),
which wraps the Vercel AI Gateway. Do not import `@google/genai`, `@anthropic-ai/sdk`,
`openai`, or any provider SDK directly — add a model alias to
`packages/ai-gateway/src/models.ts` instead, then call `generateText` /
`generateImage` from the new alias.

**Env:**
- Local dev — `AI_GATEWAY_API_KEY` in `apps/admin/.env.local` (get the key from
  the Vercel dashboard → AI → API Keys).
- Vercel prod — leave the var unset; the runtime injects an OIDC token the SDK
  picks up automatically.

**Active features:**
- **Prompt-to-image** in the Assets tab (`✨ Generate` button) — see
  [components/vizmaya/GenerateImagePanel.tsx](components/vizmaya/GenerateImagePanel.tsx)
  and [app/api/vizmaya/stories/[slug]/assets/generate/route.ts](app/api/vizmaya/stories/[slug]/assets/generate/route.ts).
  Generated images land in the `story-assets` Supabase bucket the same as
  manual uploads, and every call writes a row to `ai_generations` (migration
  [043_ai_generations.sql](../../supabase/vizmaya-fyi/migrations/043_ai_generations.sql))
  for audit + future "Regenerate" affordances.

**Planned (not built yet):**
- Prompt-to-text in the markdown editor (same pattern, `kind: 'text'` in the
  audit table).
- Resolver step that turns YAML `prompt:` fields into cached generations at
  build time.

## Pipeline tab (/vizmaya/pipeline)

Generalized monitoring dashboard for every epic with a live content pipeline,
driven by the adapter registry in
[packages/content-source/src/pipelines.ts](../../packages/content-source/src/pipelines.ts)
(currently `ai-data-centers` — dc_news/dc_news_recaps/dc_stocks, migrations
065–066, pipeline docs in [apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md)
— and `energy-profile` — iea_news, migration 015). Renders one health card per
epic (24h/7d volume, gate keep-rate where there's a relevance gate, fetch/recap
staleness, stock-feed freshness, 14-day volume bars) above a merged,
epic-tagged news feed with epic/topic/tag/search filters. The relevant vs
rejected filter surfaces classifier-**rejected** rows for auditing the Gemma
gate on epics that have one. Each epic's "tags" are its secondary tag group —
dc_stocks tickers for AI Data Centers, ISO country codes for Energy Profile.
`?epic=<slug>` deep-links a scoped view; `/vizmaya/dc-pipeline` redirects here.
Adding a pipeline for a new epic = one adapter entry in pipelines.ts, no UI
changes.

- **Page:** [app/vizmaya/(tabbed)/pipeline/](<app/vizmaya/(tabbed)/pipeline/>)
  (`PipelineClient.tsx` does all rendering; no chart lib, the volume bars are
  plain divs).
- **API:** `/api/vizmaya/pipeline` (per-epic health snapshots; failures come
  back per epic in `entry.error` instead of 500-ing the page) +
  `/api/vizmaya/pipeline/news`
  (`?limit&epic&topic&tag&q&relevance=all|relevant|rejected`), both
  `isAuthed()`-gated.
- **Readers:** `getPipelineOverview()` + `listPipelineNews()` in
  pipelines.ts, which map/merge the per-epic readers (`getDcPipelineStats()`,
  `listDcNewsForAdmin()`, … in
  [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts)).
- **US stock sparklines (AI Data Centers only):** a card
  ([components/vizmaya/pipeline/StockMarketCard.tsx](components/vizmaya/pipeline/StockMarketCard.tsx),
  same `meta.hasStocks` gate) that renders one compact area sparkline per US
  ticker (grouped by `dc_stocks.category`, window-selectable 30/90/180/365d),
  with latest close, first→last `changePct`, and a stale-date warning. Backed
  by `GET /api/vizmaya/pipeline/stock-market`
  ([route](<app/api/vizmaya/pipeline/stock-market/route.ts>)) → `getDcStockMarket`
  from `@vismay/content-source/epics` (the same reader the public
  `/api/ai-data-centers/stocks` uses, here `isAuthed()`-gated). The route
  returns every ticker; the client filters to `market === 'US'` (US prices land
  automatically from massive.com — the non-US names are covered by the Stooq
  upload card below). Inline SVG, no chart lib, matching the volume-bars idiom.
- **International stock upload (AI Data Centers only):** a card
  ([components/vizmaya/pipeline/StockUploadCard.tsx](components/vizmaya/pipeline/StockUploadCard.tsx),
  shown when the scoped/any epic has `meta.hasStocks`) for hand-loading the
  non-US tickers. massive.com (the US price source) is US-only and every free
  API for TW/KR/JP/NL/HK is plan-gated or bot-gates CI IPs, so the daily Stooq
  CSV is downloaded in a browser (each row links straight to it) and uploaded
  to `POST /api/vizmaya/pipeline/stock-prices`
  ([route](<app/api/vizmaya/pipeline/stock-prices/route.ts>)), which validates
  the ticker and runs `parseStooqCsv` + `upsertDcStockPrices` from
  `@vismay/content-source/epics`. The GET on the same route
  (`listDcStockUploadTargets`) drives the per-ticker coverage rows.

## Recaps tab (/vizmaya/recaps)

Companion to the Pipeline tab: the merged snapshot timeline of every epic's
recap-worker markdown briefs, tagged by epic (today just AI Data Centers —
`dc_news_recaps`, one row per run: the 08:15 UTC cron plus manual dispatches).
Each row shows the epic badge, the LLM headline (or a `deterministic` badge
when Gemini was unavailable), window/story-count/model meta, topic + tag
badges, and the raw markdown behind a `<details>` toggle (newest one open by
default). A staleness warning appears when the newest recap is older than 36h.
`?epic=<slug>` deep-links a scoped view; `/vizmaya/dc-recaps` redirects here.

- **Page:** [app/vizmaya/(tabbed)/recaps/](<app/vizmaya/(tabbed)/recaps/>).
- **API:** `/api/vizmaya/recaps` (`?limit&epic`, default 20, max 60),
  `isAuthed()`-gated, backed by `listPipelineRecaps()` in pipelines.ts.
- Shared bits (timeAgo/isStale/Badge) live in
  [components/vizmaya/pipeline/shared.tsx](components/vizmaya/pipeline/shared.tsx),
  used by both tabs.
