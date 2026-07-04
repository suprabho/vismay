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

## DC Pipeline tab (/vizmaya/dc-pipeline)

Monitoring dashboard for the AI Data Centers news + stock pipeline (tables
`dc_news` / `dc_news_recaps` / `dc_stocks` / `dc_stock_prices`, migrations
065–066 — pipeline docs in
[apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md)). Shows scrape volume
and relevance-gate stats (stat tiles + a stacked 14-day bar chart of
relevant vs rejected), topic/ticker breakdowns over the trailing 30 days, the
latest daily recap (with its raw markdown), stock-feed freshness, and a
filterable news list that — unlike the public reader — can surface
classifier-**rejected** rows for auditing the Gemma gate.

- **Page:** [app/vizmaya/(tabbed)/dc-pipeline/](<app/vizmaya/(tabbed)/dc-pipeline/>)
  (`DcPipelineClient.tsx` does all rendering; no chart lib, the volume bars
  are plain divs).
- **API:** `/api/vizmaya/dc-pipeline` (stats snapshot) +
  `/api/vizmaya/dc-pipeline/news` (`?limit&topic&ticker&q&relevance=all|relevant|rejected`),
  both `isAuthed()`-gated.
- **Readers:** `getDcPipelineStats()` + `listDcNewsForAdmin()` in
  [packages/content-source/src/epics.ts](../../packages/content-source/src/epics.ts).
  Before migrations 065/066 the routes return a readable 500 and the page
  shows the error banner instead of crashing.

## DC Recaps tab (/vizmaya/dc-recaps)

Companion to the DC Pipeline tab: the full snapshot timeline of the daily
recap worker's markdown briefs (`dc_news_recaps`, one row per run — the
08:15 UTC cron plus manual dispatches). Each row shows the LLM headline (or
a `deterministic` badge when Gemini was unavailable), window/story-count/model
meta, topic + ticker badges, and the raw markdown behind a `<details>`
toggle (newest one open by default). A staleness warning appears when the
newest recap is older than 36h.

- **Page:** [app/vizmaya/(tabbed)/dc-recaps/](<app/vizmaya/(tabbed)/dc-recaps/>).
- **API:** `/api/vizmaya/dc-recaps` (`?limit`, default 20, max 60),
  `isAuthed()`-gated, backed by the existing `listDcNewsRecaps()` reader.
- Shared bits (timeAgo/isStale/Badge) live in
  [components/vizmaya/dc/shared.tsx](components/vizmaya/dc/shared.tsx),
  used by both DC tabs.
