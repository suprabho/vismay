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
  automatically from massive.com — the non-US names come from the Apify importer,
  with the upload card below as manual fallback). Inline SVG, no chart lib, matching the volume-bars idiom.
- **International stock upload (AI Data Centers only) — manual fallback:** a card
  ([components/vizmaya/pipeline/StockUploadCard.tsx](components/vizmaya/pipeline/StockUploadCard.tsx),
  shown when the scoped/any epic has `meta.hasStocks`) for hand-loading the
  non-US tickers. The **primary** path is now automated — the cron scrapes Yahoo
  for the international tickers via the Apify actor `apify/dc-yahoo-stock-scraper`
  (residential proxy, since Yahoo blocks CI's datacenter IP); see
  [apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md). This card stays as a
  backstop for days Apify/Yahoo misbehave: a browser-downloaded Stooq CSV (each
  row links straight to it) uploaded to `POST /api/vizmaya/pipeline/stock-prices`
  ([route](<app/api/vizmaya/pipeline/stock-prices/route.ts>)), which validates
  the ticker and runs `parseStooqCsv` + `upsertDcStockPrices` from
  `@vismay/content-source/epics`. The GET on the same route
  (`listDcStockUploadTargets`) drives the per-ticker coverage rows.

## Recaps tab (/vizmaya/recaps)

Companion to the Pipeline tab: the merged snapshot timeline of every epic's
recap-worker markdown briefs, tagged by epic (today just AI Data Centers —
`dc_news_recaps`, one row per run: the 06:15 UTC cron plus manual dispatches).
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


## Editions tab (/vizmaya/editions)

The review desk for the AI Data Centers **daily snapshot** — the frozen
edition composed at 06:15 UTC and published at 09:00 UTC (PRD:
[docs/ai-data-centers-daily-snapshot-prd.md](../../docs/ai-data-centers-daily-snapshot-prd.md)).
Review is a window, not a gate: the draft goes public whether or not anyone
looked. Published editions are immutable (DB trigger); corrections run in the
next edition.

- **Page:** [app/vizmaya/(tabbed)/editions/](<app/vizmaya/(tabbed)/editions/>) —
  draft banner (window, composer model, generated time, countdown to
  auto-publish; Publish now / Recompose / Recompose-clear-edits / Hold 30 min
  once), the signed draft preview iframe (`/ai-daily/doom-v-boom/preview` on
  vizmaya.fyi, `signOutputUrl` with `ADMIN_SESSION_SECRET`), editable prose
  (headline, deck, six key notes with sources picked from the window's
  stories, per-layer headline / sub / notes, research headline / sub),
  membership checkboxes (dropping re-derives every number), a diff of the
  current text against the previous composer run, and the read-only archive.
- **API (`isAuthed()`-gated):** `GET/PUT /api/vizmaya/editions/draft`,
  `POST …/draft/publish` (freezes + pings the public revalidate hook),
  `POST …/draft/recompose` (dispatches `compose-dc-edition.yml` via the
  GITHUB_DISPATCH_* env; 503 when unset), `POST …/draft/hold`,
  `PUT …/draft/membership`, `GET /api/vizmaya/editions` (archive). Server
  helpers in [lib/editionsAdmin.ts](lib/editionsAdmin.ts); readers/writers
  in `packages/dc-editions/src/dcEditions.ts`.
- **Audit:** every save and membership change writes an `ai_generations`
  row (kind `edition_edit`, model `editor`, prompt = the patch), and
  `reviewed_by` carries the admin email (Supabase-auth mode).

## Story themes (saved presets)

The theme editor (`components/vizmaya/ThemeEditor.tsx`, used by the classic
editor's Theme tab and the canvas `ThemeEditOverlay`) renders a "Presets" strip
(`components/vizmaya/ThemePresets.tsx`) backed by the `story_themes` table
(migration `supabase/vizmaya-fyi/migrations/077_story_themes.sql`, reader
`@vismay/content-source/storyThemes`). Editors can apply a preset (a COPY into
the story frontmatter — they still Save), save the current theme as a preset
scoped to one app or shared by all, delete non-built-in presets, and mark one
preset per app as the default that `POST /api/stories/compose` seeds new
stories from (falling back to the engine's `DEFAULT_THEME`).

- **API:** `GET/POST /api/story-themes?appSlug=` and `PUT/DELETE
  /api/story-themes/[id]`, `isAuthed()`-gated. `GET` answers **503** when the DB
  is unreachable (fs-mode dev / no service key) so the strip shows the built-in
  presets with a "library unavailable" note instead of erroring.
- **Built-ins** (footshorts Classic/Pitch/Terrace, vizf1 Paddock) are defined
  in `packages/viz-engine/src/lib/themeDefaults.ts` (`STORY_THEME_PRESETS`) and
  seeded by migration 077 — keep both in sync. DB rows win over the list by
  `slug`.
- **App slug, not vertical:** the canvas passes the story's *vertical* as
  `appSlug` (`f1`); `CanvasClient` resolves it with `appSlugForVertical()` from
  `@vismay/verticals/data` before it reaches the presets strip (`vizf1`).

## HTML stories tabs (/vizmaya/html-stories, /footshorts/html-stories)

Agent-authored, self-contained HTML pages hosted as-is at `<site>/s/<slug>`
([packages/html-stories](../../packages/html-stories); the pipeline is
documented in [apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md)). One
table, scoped by `app_slug`; one set of admin code for every hosting app:

- **Pages:** `app/vizmaya/(tabbed)/html-stories` and
  `app/[appSlug]/(tabbed)/html-stories` (footshorts; other apps 404) render
  [components/html-stories/HtmlStoriesIndex.tsx](components/html-stories/HtmlStoriesIndex.tsx);
  the editor pages under `vizmaya/html-stories/[slug]|new` and
  `[appSlug]/html-stories/[slug]|new` render
  [HtmlStoryEditorClient.tsx](components/html-stories/HtmlStoryEditorClient.tsx)
  (paste/upload, lint, preview in that site's chrome, publish, history; a book
  or deck in the preview reports pages/slides that overflow their frame, shown
  with the lint). The list badges book, board and deck stories.
  [lib/htmlStoryApps.ts](lib/htmlStoryApps.ts) maps an app to its public site
  and admin base path.
- **API (`isAuthed()`-gated, `?app=` or body `app`, default vizmaya-fyi):**
  `GET/POST /api/html-stories`, `GET/PATCH/DELETE /api/html-stories/[slug]`,
  `GET /api/html-stories/[slug]/versions/[id]`, and `POST /api/html-stories/brief`
  (`{ app, format?, style?, fixtureIds?, prompt?, spinId? }` → markdown) for the Copy-brief button.
- **Brief generator** ([BriefGenerator.tsx](components/html-stories/BriefGenerator.tsx)):
  the story format picker ([FormatPicker.tsx](components/html-stories/FormatPicker.tsx):
  scroll, book, board, deck; also on the Randomizer tab, where it marks the
  format the spin's kind of story suits), the
  style randomizer (palettes/fonts from the app's own stories) and, for
  footshorts, **Add matches** — the compose `MatchPicker` (badges + on-demand
  Opta scrape and a team search, reused with its own labels and a 40-match cap) — whose picks make the brief carry
  the match context (`buildMatchContext` in
  `@vismay/content-source/footshortsMatchBrief`). The brief is fetched whenever
  style or matches change and copied synchronously on click.

## Randomizer tab (/vizmaya/randomizer)

The slot machine for the Vizmaya story randomizers (Desk, Atlas, Epics;
[packages/randomizer](../../packages/randomizer), migration 088; the pipeline
is documented in [apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md)).

- **Page:** [app/vizmaya/(tabbed)/randomizer/](<app/vizmaya/(tabbed)/randomizer/>)
  → [components/randomizer/RandomizerClient.tsx](components/randomizer/RandomizerClient.tsx):
  three tabs, reels with locks (a child lock takes its parents), Spin, Re-spin
  with a one-tap reason, the Atlas pair / Epics sequence toggle, the style die,
  the rules that fired, the spin log, the hero insight gate (approve / send back
  with a note, paste research), the composed brief's assignment with Copy agent
  brief and Copy research stub, and the Desk heat table (stale and failed
  refreshes shown).
- **API (`isAuthed()`-gated):** `GET|POST /api/randomizer/spins`,
  `PATCH /api/randomizer/spins/[id]` (`{ action: 'approve'|'send_back', note }`
  or `{ research }`), `GET /api/randomizer/heat`. They call the same
  `@vismay/randomizer/spins` helpers as the token-gated agent routes on
  vizmaya-fyi, so the draw rules hold whoever spins.
