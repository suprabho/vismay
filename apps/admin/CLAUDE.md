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
when the LLM was unavailable), window/story-count/model meta, topic + tag
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

## HTML stories tabs (/vizmaya/html-stories, /footshorts/html-stories, /vizf1/html-stories, /viznba/html-stories, /travel/html-stories)

Agent-authored, self-contained HTML pages hosted as-is at `<site>/s/<slug>`
([packages/html-stories](../../packages/html-stories); the pipeline is
documented in [apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md)). One
table, scoped by `app_slug`; one set of admin code for every hosting app:

- **Pages:** `app/vizmaya/(tabbed)/html-stories` and
  `app/[appSlug]/(tabbed)/html-stories` (footshorts, vizf1, viznba and travel; other apps 404) render
  [components/html-stories/HtmlStoriesIndex.tsx](components/html-stories/HtmlStoriesIndex.tsx);
  the editor pages under `vizmaya/html-stories/[slug]|new` and
  `[appSlug]/html-stories/[slug]|new` render
  [HtmlStoryEditorClient.tsx](components/html-stories/HtmlStoryEditorClient.tsx)
  (paste/upload, lint, preview in that site's chrome, publish, history; a book
  or deck in the preview reports pages/slides that overflow their frame, shown
  with the lint). The list badges book, board, deck, collage and recap stories (and diorama, a retired format, on the stories already published as one).
  [lib/htmlStoryApps.ts](lib/htmlStoryApps.ts) maps an app to its public site
  and admin base path.
- **API (`isAuthed()`-gated, `?app=` or body `app`, default vizmaya-fyi):**
  `GET/POST /api/html-stories`, `GET/PATCH/DELETE /api/html-stories/[slug]`,
  `GET /api/html-stories/[slug]/versions/[id]`, and `POST /api/html-stories/brief`
  (`{ app, format?, tone?, style?, fixtureIds?, sessionKeys?, drivers?, gameIds?, tripSlug?, day?, prompt?, spinId? }` → markdown; a `spinId` must be the app's own: vizmaya for Desk, Atlas, Epics, footshorts for the Football Desk, viznba for the NBA Desk) for the Copy-brief button.
- **Brief generator** ([BriefGenerator.tsx](components/html-stories/BriefGenerator.tsx)):
  the story format picker ([FormatPicker.tsx](components/html-stories/FormatPicker.tsx):
  scroll, book, board, deck, collage, and recap on vizf1 only (the diorama format is retired); also on the Randomizer tab, where it marks the
  format the spin's kind of story suits), the Humorous tone toggle
  ([ToneToggle.tsx](components/html-stories/ToneToggle.tsx), also on the
  Randomizer tab: a wry, sarcastic voice under the same accuracy rules), the
  style randomizer (palettes/fonts from the app's own stories) and, for
  footshorts, **Add matches** — the compose `MatchPicker` (badges + on-demand
  Opta scrape and a team search, reused with its own labels and a 40-match cap) — whose picks make the brief carry
  the match context (`buildMatchContext` in
  `@vismay/content-source/footshortsMatchBrief`); for vizf1, **Add races**
  ([RaceContextPicker.tsx](components/html-stories/RaceContextPicker.tsx)): any
  ingested sessions by season and weekend (races, sprints, qualifying, practice;
  up to 24, "Pick the whole season" ticks them all), the drivers to follow by
  code (up to 8; a team chip adds both cars) and the angle — the brief then
  carries the race context (`buildRaceContext` in `@vismay/f1-viz/race-context`:
  results, lap timing, telemetry, strategy, the cross-session head-to-head and
  the standings round by round); for viznba, **Add games**
  ([GameContextPicker.tsx](components/html-stories/GameContextPicker.tsx)): games
  off ESPN's scoreboard (`GET /api/viznba/games?back=&ahead=`, `fetchNbaGames`
  from `@vismay/randomizer/spins`) by window and team, up to 12, and the angle —
  the brief then carries their game context (`buildGameContext` in
  `@vismay/html-stories/viznbaBrief`: ESPN box scores, quarters, team stats,
  player lines, runs, leaders, recap); for travel, **Add trip**
  ([TripContextPicker.tsx](components/html-stories/TripContextPicker.tsx)): a
  trip from `/api/travel/trips`, one day or the whole trip, and notes on how
  it really went — the brief then carries the trip context (`buildTripContext`
  in `@vismay/html-stories/travelBrief`: the itinerary stop by stop and the
  curated photos and clips with their public URLs). Travel stories must carry
  `<meta name="travel:trip">` and a slug under the trip's (the save lint
  refuses them otherwise): the travel site serves them only behind that
  trip's password. The brief is fetched whenever style, matches, races,
  games or the trip change and copied synchronously on click.

## Competition and team styles (Asset Studio → HTML stories)

Each footshorts competition (a `league` entity) and team can carry a full
HTML-story look — palette (the `vizmaya:theme` slots) plus a font trio — in
`entities.story_style` (jsonb; footshorts migrations
[20261019000000](../../supabase/footshorts/migrations/20261019000000_entity_story_style.sql)
and [20261019010000](../../supabase/footshorts/migrations/20261019010000_entity_story_style_teams.sql),
league and team rows only).

- **Set it:** Asset Studio → Teams or Leagues → pick one → *HTML story style*
  ([StoryStyleEditor.tsx](components/footshorts/asset-studio/StoryStyleEditor.tsx)):
  start from Classic / Pitch / Terrace (brand colour as accent), tune each slot
  and font, check contrast on the live sample, Save. `PATCH
  /api/footshorts/assets/entities/[id]` with `{ story_style: {palette, fonts} | null }`,
  validated by `parseEntityStyle` (`@vismay/html-stories/styles`).
- **Pick it:** the footshorts HTML-stories brief's *Story style* menu
  ([StoryStylePicker.tsx](components/html-stories/StoryStylePicker.tsx):
  Competitions / Teams tabs and a filter; loaded by `loadEntityStyles` in
  `@vismay/html-stories/storyStyles`); the public brief takes
  `?style=competition:<slug>` or `?style=team:<slug>` and the MCP brief tool
  `competitionStyle` / `teamStyle`. The brief names the competition or club
  instead of "picked at random".
- Until the migrations are applied, the Asset Studio reads every style as
  unset (`withAssetCols` retries without the column) and saving a style fails;
  with only the first one applied, saving a team style fails.

## Randomizer tabs (/vizmaya/randomizer, /footshorts/randomizer, /viznba/randomizer)

The slot machine for the story randomizers
([packages/randomizer](../../packages/randomizer), migrations 088, 090, 092, 093 and 094;
the pipeline is documented in [apps/vizmaya-fyi/CLAUDE.md](../vizmaya-fyi/CLAUDE.md)):
Desk, Atlas, Epics, the OCW Desk and the Landmark Desk on `/vizmaya/randomizer`, the Football Desk on
`/footshorts/randomizer`, the NBA Desk on `/viznba/randomizer`. One client, `RandomizerClient`, takes the `app`
and shows that site's randomizers (`randomizersFor(app)`), its brief and its
story links.

- **Page:** [app/vizmaya/(tabbed)/randomizer/](<app/vizmaya/(tabbed)/randomizer/>)
  → [components/randomizer/RandomizerClient.tsx](components/randomizer/RandomizerClient.tsx):
  five tabs, reels with locks (a child lock takes its parents), Spin, Re-spin
  with a one-tap reason, the Atlas pair / Epics sequence / OCW continue-the-course /
  Landmark follow-the-prize toggle, the style die, the rules that fired, the spin log, the hero insight
  gate (approve / send back with a note, paste research), the composed brief's
  assignment with Copy agent brief and Copy research stub, the Desk heat table
  (stale and failed refreshes shown) and, on the OCW Desk tab, the **OCW pool**
  panel: the page of MIT OpenCourseWare files the spin was drawn from (query,
  count, offset), the course card with links, the resource, the course's other
  lecture-notes files, and the other courses on the page (the desk draws
  lecture notes only for now, so there is no kind reel). The OCW course and
  resource reels blur through that page's titles. Nothing is loaded up front
  for it: a cron on vizmaya-fyi spins it each morning, and the page lives on
  the spin. On the Landmark Desk tab, the **Landmark pool** panel: the award
  the spin drew (year, laureate, share, co-laureates, the official motivation
  verbatim, links to the laureate page, the prize summary, the scientific
  background document, the lecture and Wikipedia), the work (title, year,
  venue, authors, DOI, free-to-read link and status, citations, FWCI, top-1%,
  retraction, and its label: named by the award, representative, or a
  subject), the other works the loader found, the other laureates of the
  era, and the four sources' states (Wikidata, OpenAlex, Open Library,
  Unpaywall) with notes and errors. The laureate and work reels blur through
  the spin's own pool; a cron spins it each morning too.
- **Football Desk page:** [app/[appSlug]/(tabbed)/randomizer/](<app/[appSlug]/(tabbed)/randomizer/>)
  (footshorts and viznba, other apps 404): the same client with `app="footshorts"`,
  one reel set (Tournament, Team, Angle, Freshness, plus the Opponent reel
  when Head-to-head is on) and the **Football news heat** panel in place of
  the Desk heat table: tournament chips (struck through when they have no
  fixtures in the window, so they are out of the draw) and teams by heat with
  story count, next fixture and newest headline. It reads
  `loadFootshortsNews()` live; nothing to refresh. Its brief is a footshorts
  brief carrying the spin and the match context of the spin's fixtures.
- **NBA Desk page:** the same page for `viznba`: the client with `app="viznba"`
  and `nbaNews`, one reel set (Conference, Team, Angle, Freshness, plus the
  Opponent reel when Head-to-head is on) and the **NBA news heat** panel:
  conference chips and all 30 franchises by heat with story count, the people
  in the news, last result and next game, and newest headline, plus a badge
  when ESPN's schedule could not be read. It reads `loadViznbaNews()` live.
  Its brief is a viznba brief carrying the spin and the box scores of the
  spin's games.
- **API (`isAuthed()`-gated):** `GET|POST /api/randomizer/spins`,
  `PATCH /api/randomizer/spins/[id]` (`{ action: 'approve'|'send_back', note }`
  or `{ research }`), `GET /api/randomizer/heat`; `POST /api/html-stories/brief`
  takes a footshorts `spinId` with `app: 'footshorts'` and a viznba one with
  `app: 'viznba'`. They call the same
  `@vismay/randomizer/spins` helpers as the token-gated agent routes on
  vizmaya-fyi, so the draw rules hold whoever spins.

## Books tab (/footshorts/books)

The production desk for the season-book series (one season per book; data in
[vizmaya-data/football-seasons](../../vizmaya-data/football-seasons/README.md)).
A book has one of two formats, told apart by its plan's `version` (read from
the JSONB as `plan->version` for the shelf, so no column was added):

- **Season spreads** (plan v2, the default for new books; spec: *Spread
  planner & builder*). The book is built from data spreads in the team-spread
  visual language: a **league spread** per league, **one team spread per
  club** in its colours, a **competition spread** per European and domestic
  cup, and **honourable mentions** (team spreads for clubs outside the covered
  leagues, each with a stated reason). Fixed part order: Introduction → per
  league (league spread, then its clubs by final position unless pinned) →
  European competitions → domestic competitions (by country in league order)
  → honourable mentions → Season in numbers. Model and maths in
  [lib/seasonBooks/seasonSpreads.ts](lib/seasonBooks/seasonSpreads.ts):
  `planV2Schema` (scope, parts, the three frame spreads in the v1 card shape,
  beats with a `spreadKey`, archived `legacy` spreads), `bookSpreadSchema`
  (one spread's editorial row: headline ≤ 40 chars, story stat, story ≤ 30
  words, up to four moments, template-specific fields, module settings,
  palette overrides, pack ref, check overrides, status data → draft → checked
  → approved → handed-off), `bookSpreads()` (parts → spreads in reading
  order), page count against the KDP 550-page limit, `EDITOR_TABS`,
  `SPREAD_MODULES` and `SPREAD_CHECKS` from the spec, the checks that run on
  the row alone, and the one-way `convertToSeasonSpreads()`.
  **Interim storage:** each spread's editorial row sits on the book plan under
  `spreads[key]` in the row's own shape until the spec's `admin_book_spreads`
  table (per-spread `revision`), `admin_spread_packs` and the builder land;
  moving it is a data move. The render (`season/SpreadCanvas`) follows the six
  reference spreads on the design canvas: the shared page-1 frame (kicker,
  two-line headline at 55 pt, kit-derived mark, story stat at 53 pt, story
  copy, season record, marks line, running line) and each template's modules
  at the reference positions, in Archivo (loaded with `next/font` on the book
  page), with the reference palettes for the six reference spreads and the
  series navy and gold standing in for the rest. Modules the admin's match
  data can draw draw it (team: climb, calendar, season record, radar; league:
  race, lead strip, days at the top, table with result pips; competition:
  bracket, groups, finalists, season record); lineups, minutes, transfers,
  awards, scorers, cup ties and the choropleth keep the reference's form as
  dashed placeholders until the data packs land, and the Spreads grid shows
  every pack as "not built". The geometry, type scale, icons, position
  colours and reference palettes are data in
  [lib/seasonBooks/spreadLayouts.ts](lib/seasonBooks/spreadLayouts.ts)
  (`SPREAD_CANVAS`, `SPREAD_TEMPLATES` with every region in pt,
  `SPREAD_TYPE_SCALE`, `SPREAD_ICONS`, `REFERENCE_PALETTES`), the builder's
  system v2 exports until system.ts moves there.
- **Claim spreads** (plan v1): one claim with one visual per spread, about 60
  a season, the workflow below. Existing books keep opening here unchanged;
  **Convert to season spreads** in the book header is the explicit one-way
  action (cover and intro become frame spreads, beats keep their text and gain
  a `spreadKey` when they name one club, month spreads move to a read-only
  Legacy view).

**Season-spreads views** (`/footshorts/books/<2003-04>?view=`, in workflow
order; `?spread=<key>&tab=<tab>` deep-links the editor):

1. **Roster** (`roster`, meta `114 spreads · 228 pp`) — leagues in order (the
   five big leagues by default; the context leagues can be added), clubs per
   league from its table in `admin_historical_matches` (included by final
   position, or left out with a reason, or reordered by hand; a manual order
   survives a rebuild), European and domestic competitions as toggles (only
   the Champions League has match data in the admin; cups come from
   `cup_matches.csv` later), honourable mentions proposed by the rule
   (European winner, European finalist or Champions League semi-finalist
   from outside the in-scope leagues, matched loosely across source
   spellings) and confirmed with a reason, or added by hand, up to six.
2. **Spreads** (`spreads`, meta `12/114 approved`) — every spread as a
   thumbnail grouped by part: kind, status, pack freshness, check count;
   filters by kind and status.
3. **Editor** (`editor&spread=<key>`) — the spread list on the left, the
   render in the middle (clicking a module opens the tab and field that drive
   it), and on the right **Angles** (the beat finder pointed at the subject's
   matches, plus the book beats keyed to it: moment and story candidates that
   never write on their own) above the **editor tabs**. Every template has
   Story (headline with a live two-line fit at 55 pt, story stat with
   suggestions from the match data, story copy with a 30-word meter, the
   names drawn in colour), Moments (up to four dated moments, picked from the
   season's verified `admin_historical_events` rows or typed), Modules
   (enable, variant, nudge ± pt, note, reset per module), Colour and marks
   (the stand-in palette, per-role overrides with contrast readouts, every
   mark the spread uses as placeholders until `admin_club_marks` exists) and
   Checks (the registry for the template: the row-level checks run live,
   the rest wait for the builder; a blocking failure takes an override with a
   reason, and `checked` is only selectable when none is open). Team spreads
   add Cups (a paragraph and rail/ladder variant per competition in scope),
   Side (turning point, coach with context, assistants and a source URL, XI
   split date) and People (story players, heatmap players, module notes);
   league spreads add Race and lead (clubs in colour, two dated lead
   annotations, the halfway note) and Players (awards with source URLs);
   competition spreads add Field and bracket (highlighted and pinned clubs,
   finalists by default; map grouping by country or division) and Oddities
   (six one-liners tied to their proving stat, candidates from the results).
   Status advances itself data → draft from the row's content, never back.
4. **Flatplan** (`flatplan`, meta `228 pp`) — page pairs in reading order
   with part dividers, page numbers and the total against the KDP limit.
5. **System** (`system`) — the season-spread design system, read-only
   (`season/SeasonSystemView`): the canvas, each template's regions outlined
   on a sample render with a region table, the type scale, the reference and
   stand-in palettes with the position and result colours, the icons and
   marks rules, the module registry and the checks; the series system v1 the
   frame spreads use sits below it. **Legacy** shows a converted book's
   archived month spreads, read-only.

**Claim-spreads views** (plan v1) walk the older workflow in order:

1. **Beats** — the season's 15–25 one-sentence moments, each in a month, with
   strength 1–3 (3 = could open a chapter). The **beat finder** proposes
   candidates from a competition's results: month-end lead changes, the title
   margin, unbeaten seasons, winning/unbeaten/winless runs, collapses (top-four
   at a month's end → finished 5+ places lower), relegation margins, biggest
   wins, Champions League finals.
2. **Flatplan** — every spread on one grid, a row per chapter (cover, season
   intro, Aug → Jul, season in numbers), numbered in reading order. Drag (or
   arrow) spreads between months; drag unplaced beats in. A rhythm strip and
   pacing checks enforce hero → dense → breather (3+ dense in a row,
   back-to-back breathers or heroes, a month not opening on a hero).
3. **Cards** — per spread: beat, headline (the claim) beside a freehand chart
   sketch (pointer-drawn, stored as integer SVG paths), one stat, body with an
   80–150 word meter (template budgets), caption, notes. The card check warns
   on a headline without a sketch ("the claim is too vague") and vice versa.
   **Pull real data** binds the chart to a preset — points race, table at a
   month's end, results strip, goals per game by month — drawn in the series
   chart style. Status advances itself (card → on real data), never back.
4. **Chapters** — a month's spreads (or the whole book) as true-to-grid
   low-fi thumbnails side by side, to judge flow before polishing.

**Crests** (`/footshorts/books/crests?season=2003-04&filter=missing`, linked
from the Books list and each book's header) shows every club of a season — the
five top flights, then every cup opponent — with the crest it wore that
season, filters (missing, current only, flagged, uploaded) and a search. Drop
an image on a club, or open it, to upload a missing crest or replace a wrong
one; an upload always wins over the crest `crests.py` picked, and Remove
upload falls back to it.

- **Storage:** private `admin_season_crests` + private bucket
  `admin-season-crests` (footshorts migration
  [20261020000000](../../supabase/footshorts/migrations/20261020000000_admin_season_crests.sql)).
  Rows come from `crests.csv` via `pnpm --filter @footshorts/worker
  history:crests-sync -- --season=2003 --push` (never touches an upload);
  `--pull` copies the uploaded files into `raw/crests/<season>-uploads/`.
  Uploads are read through 1-hour signed URLs; picked crests hotlink their
  source (Logopedia, Wikimedia, TheSportsDB).
- **API (`isAuthed()`-gated, same-origin writes):** `GET
  /api/footshorts/books/crests?season=`, `POST|DELETE
  /api/footshorts/books/crests/upload` (multipart `season`, `wiki`, `file` /
  JSON `{ season, wiki }`). The type comes from the bytes (PNG, SVG, WebP,
  JPEG, GIF, up to 2 MB); SVGs with scripts, handlers or external links are
  refused. Helpers in [lib/seasonBooks/crests.ts](lib/seasonBooks/crests.ts)
  and [crestStore.ts](lib/seasonBooks/crestStore.ts); UI
  [components/books/CrestsViewer.tsx](components/books/CrestsViewer.tsx).
- **Club marks** (`?view=marks`, the Crests / Club marks toggle): the
  series' club mark per club (toClubMark spec 2.2,
  [packages/club-marks](../../packages/club-marks/README.md)): a shape family
  (roundel, heater, oval, plate, hexagon), a rim of 0–3 bands, the field in
  the kit colours, and up to 10 charges on it — primitives or emblems from
  the house library (simplified crest motifs drawn in Figma, Vismay Brands ›
  FS-stlb), each with colour slots, scale, stretch, rotation, position and a
  layer (field / emblem / over the rim). The crest is only read to guess the
  family; no text is drawn. Kits come from
  `vizmaya-data/football-seasons/scripts/kits.py` (`data/kits.csv`, hand fixes
  in `data/kits_overrides.csv`); the editorial design (family, rim, pattern,
  c1, c2, charges) from `data/mark_overrides.csv` (`seed_*` columns; it wins
  over the kit, review overrides win over it), pushed with `pnpm --filter
  @footshorts/worker history:club-marks-sync -- --season=2003 --push`;
  `--pull` writes the rows to `data/club_marks.csv`. **Generate N marks** runs
  every club with no mark (or a stale one) one at a time. The **Mark review**
  filter is the review queue: family under 0.75 confidence, no crest, a
  failing check (a weak edge or charge contrast goes to review), a kit colour
  more than ΔE 15 from any print swatch, a duplicate code, a flagged kit. The
  detail panel shows the real crest beside the mark, chip 24 / token 120 /
  hero in colour and greyscale, the checks, the print swatches and CMYK, the
  design editor (rim bands or Default ring / No rim; charges from Shapes or
  Emblems with a colour picker per slot, scale, stretch, rotation and
  position sliders, layer, reorder; live preview; **Save design**), and
  overrides (family, code, pattern, c1, c2); **Confirm** turns the generated
  family, code, rim and charges into overrides and clears the flag. Storage:
  private `admin_club_marks` (footshorts migrations
  [20261021000000](../../supabase/footshorts/migrations/20261021000000_admin_club_marks.sql)
  → [20261025000000](../../supabase/footshorts/migrations/20261025000000_admin_club_marks_rim_field.sql):
  `ring`, `rim`, `override_rim`, `seed_rim`, `seed_pattern`, `seed_c1`,
  `seed_c2`; charges and rims as text, validated in the app; the trim columns
  are unused); renders are not stored, every surface draws from the row with
  `renderClubMark()`. API: `POST /api/footshorts/books/crests/marks` `{ season,
  wiki, action: 'generate' | 'override' | 'confirm', overrides? }`; writer
  [clubMarkStore.ts](lib/seasonBooks/clubMarkStore.ts) (sharp, Node only), UI
  [ClubMarkPanel.tsx](components/books/ClubMarkPanel.tsx).

**System** (read-only) shows the locked series design system: 12-column spread
grid, type scale, palette, chart style, chart forms and the seven spread
templates (cover, intro, hero, comparison, timeline, table, breather). It
lives in code, [lib/seasonBooks/system.ts](lib/seasonBooks/system.ts), and
changes through review (bump `SYSTEM_VERSION`), never per book.

- **Storage:** `admin_season_books` (footshorts Supabase, migration
  [20261014000000](../../supabase/footshorts/migrations/20261014000000_admin_season_books.sql)),
  private and RLS-locked: one row per book, the plan as JSONB, validated by
  `parseAnyPlan` (v1 `planSchema` in
  [lib/seasonBooks/plan.ts](lib/seasonBooks/plan.ts), v2 `planV2Schema` in
  [seasonSpreads.ts](lib/seasonBooks/seasonSpreads.ts), by the plan's
  `version`). Saves are optimistic on `revision` (409 on a stale write; the
  page asks to reload, nothing is merged). Autosaves 1.2s after the last edit.
- **Match data:** `admin_historical_matches` (migration 20261013000000,
  loaded by `pnpm --filter @footshorts/worker history:import`). The API ships
  one competition-season's played matches; standings, races, strips and the
  beat finder are computed in the browser by
  [lib/seasonBooks/matches.ts](lib/seasonBooks/matches.ts) (3/1/0, no
  deductions; tie-break GD, GF, name). Team names are the raw source labels.
- **API (`isAuthed()`-gated, same-origin writes):** `GET|POST
  /api/footshorts/books` (`POST { seasonStart, title?, format? }`, season
  spreads unless `format: 'claim-spreads'`), `GET|PUT|DELETE
  /api/footshorts/books/[slug]` (`PUT` takes a v1 or v2 plan),
  `GET /api/footshorts/books/matches?season=&competition=` (competition from
  `BOOK_COMPETITIONS`). Missing tables answer 503 with the migration to apply.
  The spec's per-spread, pack, draft, render and export routes are not built.
- **UI:** [components/books/](components/books/) — `BookWorkspace` (load,
  autosave, header, the convert action; hands the plan to
  `ClaimSpreadsPlanner` or `season/SeasonSpreadsPlanner` by format), one
  component per view (`season/RosterView`, `SpreadsView`, `SpreadEditorView`
  with its tab panels in `EditorTabs`, `BookFlatplanView`, `LegacyView`;
  `SpreadCanvas` is the 1190 × 842 pt render stand-in), `SpreadThumb`
  (v1 template regions on the grid, sized in container-query units from the
  type scale), `DataChart`, `SketchPad`, `ChartGlyph`, `MatchData` (one fetch
  per competition, shared; `season/useBookData` reads several at once for the
  roster, proposals and a spread's subject).
- **Tests:** `pnpm --filter admin exec tsx lib/seasonBooks/seasonBooks.test.ts`.

## VizNBA Pipeline tab (/viznba/pipeline)

The health of the VizNBA news worker ([apps/viznba/worker](../viznba/worker),
tables in [supabase/viznba](../../supabase/viznba/migrations)). The
`[appSlug]/(tabbed)/pipeline` page hands `viznba` to
[components/viznba/ViznbaPipeline.tsx](components/viznba/ViznbaPipeline.tsx)
(a server component; footshorts keeps the rest of the page):

- **Workers:** the footshorts `WorkersPanel` with `endpoint="/api/viznba/workers"`
  ([route](app/api/viznba/workers/route.ts), same contract as
  `/api/footshorts/workers`) over `VIZNBA_WORKERS` in
  `@vismay/content-source/workerDispatch` (news ingest every 4h, the weekly
  roster seed): last run and a trigger, via the `GITHUB_DISPATCH_*` env.
- **Stats:** `fetchViznbaPipelineStats()` in
  [packages/content-source/src/viznbaData.ts](../../packages/content-source/src/viznbaData.ts):
  freshness (last ingest, newest story the app's Feed shows), the last 24h by
  status, all-time counts, the roster the tagger resolves against (teams,
  active players, coaches, last seed), tagging coverage and tags per story,
  14-day volume (summarized share in orange), topics (NBA topics vs the
  hidden ones), per-source quality, grouped failure reasons, and the most
  tagged teams and people. A diagnosis banner explains an empty day (no
  roster, nothing ingested, every call failing, everything hidden).
- **Registration:** the section needs the `viznba` row in `apps` (migration
  [092_viznba.sql](../../supabase/vizmaya-fyi/migrations/092_viznba.sql)).
  The tabs (Pipeline, HTML stories, Randomizer) are in
  [components/section/AppAdminTabs.tsx](components/section/AppAdminTabs.tsx).
  `NEXT_PUBLIC_VIZNBA_URL` sets the public site the "Live at" links and briefs
  point at (default `https://nba.vizmaya.fyi`).


## Season events tab (/footshorts/season-events)

Fact-check desk for the football-seasons book's monthly events
([vizmaya-data/football-seasons](../../vizmaya-data/football-seasons/README.md), Layer 2):
manager changes, notable transfers and Claude-extracted events, each with its
verbatim source quote. Editors mark each one Yes / Fixed / No and leave a note;
a verdict stamps `checked_by` (admin email) and `checked_at`.

- **Storage:** private `admin_historical_events` (footshorts migration
  `20261015000000`; RLS on, no consumer grants). Rows come from `events.csv` via
  `pnpm --filter @footshorts/worker history:events-sync -- --season=<start> --push`
  (content only, never overwrites a verdict); `--pull` copies verdicts back to the CSV.
- **Page:** [app/[appSlug]/(tabbed)/season-events/](<app/[appSlug]/(tabbed)/season-events/>)
  → [components/footshorts/SeasonEventsClient.tsx](components/footshorts/SeasonEventsClient.tsx)
  (footshorts only; month groups, filters, `j`/`k` + `y`/`f`/`n`/`e` keys).
- **API (`isAuthed()`-gated, private no-store):** `GET /api/footshorts/season-events?season=2003-04`
  and `PATCH /api/footshorts/season-events/[id]` (`{ verified?, notes? }`, same-origin),
  backed by [lib/historicalEvents.ts](lib/historicalEvents.ts); shared types in
  `@footshorts/shared/historicalEvents`.
- **Migrations note:** the footshorts project's remote migration history is
  empty (migrations were applied by hand), so `supabase db push` would re-run
  all of them. Apply a single file with `supabase db query --linked -f <file>`
  from a directory laid out as `supabase/{config.toml,migrations,.temp}`.
