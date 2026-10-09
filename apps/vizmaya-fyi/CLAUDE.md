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

## HTML stories (`/s/<slug>`) — agent-authored pages

A second, independent story pipeline: any agent (Claude, ChatGPT, Cursor, …)
writes one finished, self-contained HTML page and it is served exactly as
posted. No config, no viz engine, no render step, and nothing here reads or
writes the `stories` tables.

- **Schema:** [supabase/vizmaya-fyi/migrations/085_html_stories.sql](../../supabase/vizmaya-fyi/migrations/085_html_stories.sql) — `html_stories` (one row per slug, `status` draft/published/archived, `app_slug` = the hosting site) + append-only `html_story_versions` (a row whenever the HTML changes). Service-role only (RLS on, no policies).
- **Four hosting apps, one table.** footshorts, vizf1 and viznba share the Supabase project, so their HTML stories are rows with `app_slug = 'footshorts'` / `'vizf1'` / `'viznba'`, served at footshorts.com/s/<slug> ([apps/footshorts/web/app/s/[slug]](../footshorts/web/app/s/[slug]/route.ts)), www.vizf1.com/s/<slug> ([apps/vizf1/web/app/s/[slug]](../vizf1/web/app/s/[slug]/route.ts)) and nba.vizmaya.fyi/s/<slug> ([apps/viznba/web/app/s/[slug]](../viznba/web/app/s/[slug]/route.ts)). Every reader/writer in `htmlStories.ts` takes the app (`'vizmaya-fyi'` is the default, the column default) and scopes by it, so a footshorts listing never shows a vizmaya story. Slugs are the primary key, hence global: `saveHtmlStory` refuses (`HtmlStorySlugTakenError`, HTTP 409) to re-post a slug another app owns. The app list and per-app names/URLs live in `apps.ts`.
- **Package:** [packages/html-stories](../../packages/html-stories) — `apps.ts` (the hosting apps), `htmlStories.ts` (readers/writers), `meta.ts` (slug rules, `<title>`/meta extraction, `lintHtml` = the hosting contract), `brief.ts` (what the agent reads first, per app — house style, chrome, posting target; edit this to change the design direction), `footshortsBrief.ts` (the footshorts brief with its match context, see below), `vizf1Brief.ts` (the vizf1 brief with its race context, see below), `viznbaBrief.ts` (the viznba brief with its game context, see below), `branding.ts` (the vizmaya, footshorts, vizf1 and viznba chrome), `formats.ts` / `formatBrief.ts` / `formatsApi.ts` + `formats/` (the story formats, below), and the shared route handlers `serve.ts` / `publishApi.ts` / `briefApi.ts` / `formatsApi.ts` / `assetsApi.ts` that every site's routes call with their app.
- **Serve:** [app/s/[slug]/route.ts](app/s/[slug]/route.ts) → `serveHtmlStory(req, slug, 'vizmaya-fyi')`: the stored document with `Content-Security-Policy: sandbox allow-scripts …` (no `allow-same-origin`), so story scripts run in an opaque origin with no vizmaya.fyi cookies or storage. CDN-cached 60s.
- **Agent publish API:** `POST /api/html-stories` ([route](app/api/html-stories/route.ts) → `handleHtmlStoryPublish`), `Authorization: Bearer $HTML_STORIES_TOKEN`. Raw `text/html` body with `?slug=&publish=1`, or JSON `{slug, html, status|publish, title, description}`. Returns the URL and lint `warnings`. Without a slug it is derived from `<title>`. Same contract on footshorts.com, www.vizf1.com and viznba with each deployment's own token.
- **Story media:** the brief's "Photography and media" section asks for a hero image plus a photo or short video every two or three screens: Wikimedia Commons, Openverse and public-domain archives first (CC0, PDM, CC BY, CC BY-SA only), AI illustration only where nothing real fits and never photoreal people or events, every one credited in its `<figcaption>`. `lintHtml` warns on a page with no photo/video `<figure>`, on `<img>` without `alt`, and on a photo figure without a caption. Files are hosted through `GET|POST /api/html-stories/assets?slug=` ([route](app/api/html-stories/assets/route.ts) → `assetsApi.ts`, same bearer token; footshorts has the same route): JSON `{fromUrl, credit, license, sourcePage}` copies from a public https host (manual redirects, private addresses refused), `{generate: {prompt, aspectRatio}}` goes through `@vismay/ai-gateway` (image aliases only) and logs to `ai_generations`, or raw image/mp4 bytes. The type is sniffed from the bytes (PNG, JPEG, GIF, WebP, AVIF, MP4; never SVG), files are content-addressed under `story-assets/html-stories/<slug>/` with the credit and licence as storage metadata, and GET returns them. MCP: `save_story_image`, `generate_story_image`. Needs `AI_GATEWAY_API_KEY` on the deployment for generation.
- **Brief:** `GET /api/html-stories/brief` (public markdown, `handleHtmlStoryBriefRequest`), the admin "Copy agent brief" button (`POST /api/html-stories/brief` in admin, session-gated), and the MCP `get_html_story_brief` tool all serve `htmlStoryBrief()` for the app. **Maps:** when the deployment has a public Mapbox token (`HTML_STORIES_MAPBOX_TOKEN`, else `NEXT_PUBLIC_MAPBOX_TOKEN`; `pk.` only, anything else is dropped since the brief is public; `packages/html-stories/src/mapbox.ts`), the brief carries it plus a "Maps: Mapbox scrollytelling" section (one sticky map, `data-step` chapters driving `flyTo`, layers faded by paint properties, static-image fallback); without one it points at MapLibre / D3-geo. The token must allow vizmaya.fyi, footshorts.com, vizf1.com and the VizNBA domain, since `/s/<slug>` pages load it. `/s/<slug>` (and the admin preview) also inject the configured token as `window.MAPBOX_ACCESS_TOKEN` at the top of `<head>` on any page that mentions Mapbox, and the brief tells agents to write `mapboxgl.accessToken = window.MAPBOX_ACCESS_TOKEN || '<pk>'`, so rotating the token reaches published maps without a re-post. The MCP tool fetches the brief from the site so it gets the site's token.
- **Story formats:** a story is a scrolling page (`scroll`, the default) or a **book** (pages you turn), a **board** (a pinned board with a guided camera tour) or a **deck** (slides, or cards you deal). The paged formats run on versioned runtimes each site hosts at `/formats/<name>@1.js` + `.css` ([app/formats/[...path]](app/formats/[...path]/route.ts) → `serveFormatAsset`; footshorts has the same route), with reference pages at `/formats/examples/odyssey-<format>.html`. Sources are [packages/html-stories/formats](../../packages/html-stories/formats) (shared `story.js` = `window.Story`, the chart hook every format calls on enter, plus `book|board|deck.{js,css}` and `common.css`); `pnpm --filter @vismay/html-stories gen:formats` bundles them into `src/formatAssets.generated.ts` (run it after any change there; `src/formats.test.ts` fails when it's stale). The brief takes `format` (`?format=book` on the URL, the format picker in admin, `format` on the MCP tool); for a paged format the scroll-only sections (motion and scroll animation, the Mapbox sticky map) give way to the format's own (`formatBrief.ts`), and runtime URLs always point at the production site. The page declares `<meta name="vizmaya:format" content="book">`; `lintHtml` checks the tag, that the runtime is loaded, that units are marked `data-unit`, and that `data-step` isn't used. The runtimes report pages or slides that overflow their frame to the console and to the admin preview (`vizmaya:format-check` messages). Contracts and design notes: [packages/html-stories/formats/README.md](../../packages/html-stories/formats/README.md).
- **Footshorts match context:** the footshorts brief can carry the matches the story is about. `buildMatchContext(fixtureIds, { prompt, siteUrl })` in [packages/content-source/src/footshortsMatchBrief.ts](../../packages/content-source/src/footshortsMatchBrief.ts) (beside the compose `buildMatchBrief`, sharing its formatters, but with no `fs:` fences and no prompt-budget caps) renders, per match: the Opta facts table and the full raw stat set, the whole timeline, every Opta insight, the commentary on event minutes, the build-up cards, each team's crest/colour/page link, **form and schedule** (both sides' results in the 45 days before and fixtures in the 45 days after, across competitions — `fetchTeamSchedules`), and the **table** (`fetchStandingsFromDb`, DB-only so a brief never triggers an ingest; group phases print only the two teams' groups); then the competition's **next fixtures** (`fetchUpcomingCompetitionFixtures`) and a sources list. `footshortsHtmlStoryBrief()` appends it as the brief's last section with its headings demoted. Reached from the admin tab's **Add matches** picker (the compose `MatchPicker`, badges and on-demand scrape included), `GET footshorts.com/api/html-stories/brief?fixtures=<id>,<id>&prompt=…` with the publish token as a bearer, or the MCP tool's `fixtureIds`.
- **VizF1 race context:** the vizf1 brief can carry the sessions and drivers the story is about, across races, session types and seasons. `buildRaceContext(sb, { sessionKeys, drivers, prompt, siteUrl })` in [verticals/f1-viz/src/telemetry/buildRaceContext.ts](../../verticals/f1-viz/src/telemetry/buildRaceContext.ts) (`@vismay/f1-viz/race-context`, beside the compose `buildTelemetryBrief` and reusing its `./signals` race analysis) reads `vizf1_telemetry_sessions` + `vizf1_telemetry_laps` and renders: the focus drivers (by code, so a driver is followed across team changes; a car number also works; none picked → the top scorers) with headshots, team colours and logo URLs (`vizf1_constructors`); the **head-to-head across every picked session** (finish from grid and points, best lap against the session's best, median clean-lap race pace, speed trap, totals, pairwise who-finished-ahead counts for races and for qualifying); **session by session** — weather, the full classification, SC/VSC and red-flag laps, the focus drivers' sectors, ideal lap, strategy and stops, the key moments (`deriveSignals`) and the lap-by-lap timing (up to 6 sessions × 4 drivers); and the **championship** round by round, drivers and constructors, computed from the season's ingested race and sprint results (rounds with no ingested race are named, so totals that undercount say so) beside the Ergast snapshot the ingest recorded. Pace only ever reads clean laps and never compares circuits. `vizf1HtmlStoryBrief()` appends it as the brief's last section. Up to 24 sessions and 8 drivers. Reached from the admin tab's **Add races** picker (`components/html-stories/RaceContextPicker.tsx`, over `/api/vizf1/telemetry/sessions`), `GET www.vizf1.com/api/html-stories/brief?sessions=<key>,<key>&drivers=VER,NOR&prompt=…` with the publish token as a bearer, or the MCP tool's `sessionKeys` + `drivers`. Checks: `npx tsx verticals/f1-viz/src/telemetry/buildRaceContext.test.ts`.
- **VizNBA game context:** the viznba brief can carry the games the story is about. `buildGameContext(gameIds, { prompt, siteUrl })` in [packages/html-stories/src/viznbaBrief.ts](../../packages/html-stories/src/viznbaBrief.ts) reads ESPN's public `summary` endpoint (the one the VizNBA game page uses) per game and renders, in date order: the teams with record, colour and logo URL, the venue, the score by quarter, the team stats, runs of 8 or more from the play-by-play, every player's line (ESPN's columns) and who did not play, the leaders with headshots, the season series and ESPN's recap; for a game ahead, ESPN's win probability, each side's last five and the injury report. A game ESPN can't serve is named, not dropped. Up to 12 games. Reached from the admin tab's **Add games** picker (`components/html-stories/GameContextPicker.tsx`, over `/api/viznba/games`, ESPN's scoreboard), `GET <viznba>/api/html-stories/brief?games=<espn id>,<espn id>&prompt=…` with the publish token as a bearer, or the MCP tool's `gameIds`. Checks: `npx tsx packages/html-stories/src/viznbaBrief.test.ts`.
- **Admin:** the **HTML stories** tabs — `/vizmaya/html-stories`, `/footshorts/html-stories`, `/vizf1/html-stories` and `/viznba/html-stories` in apps/admin, both rendering `components/html-stories/HtmlStoriesIndex` and `HtmlStoryEditorClient` over the app-scoped `/api/html-stories?app=` routes: paste/upload, sandboxed phone/desktop preview in that site's chrome, publish/unpublish, version history with restore.
- **MCP:** `publish_html_story` + `get_html_story_brief` in [packages/mcp](../../packages/mcp) (both also take a randomizer `spinId`, see below), both taking `app` (`vizmaya-fyi` default, `footshorts`, `vizf1`, `viznba`). vizmaya needs `HTML_STORIES_TOKEN` (`HTML_STORIES_URL` defaults to https://vizmaya.fyi); footshorts `FOOTSHORTS_HTML_STORIES_TOKEN` (falls back to `HTML_STORIES_TOKEN`; `FOOTSHORTS_HTML_STORIES_URL` defaults to https://footshorts.com); vizf1 `VIZF1_HTML_STORIES_TOKEN` (same fallback; `VIZF1_HTML_STORIES_URL` defaults to https://www.vizf1.com); viznba `VIZNBA_HTML_STORIES_TOKEN` (same fallback; `VIZNBA_HTML_STORIES_URL` defaults to https://nba.vizmaya.fyi).
- **Listings:** published HTML stories lead the home page's front page and the `/stories` archive, newest first, ahead of the curated viz-engine order ([lib/htmlStoryListing.ts](lib/htmlStoryListing.ts) → `listPublishedHtmlStories`). Cards link to `/s/<slug>` with a plain `<a>` (`StoryCardData.href`), use `og:image` as the thumbnail and are tinted from the page's `vizmaya:theme` palette, which [migration 086](../../supabase/vizmaya-fyi/migrations/086_html_stories_theme_meta.sql) keeps in `html_stories.theme_meta` (written on save, backfilled from stored HTML) so listings never read the documents. Before 086 the cards render untinted and saves skip the column. Book, board and deck stories carry a format pill (`StoryCardData.format`) from `html_stories.format` ([migration 089](../../supabase/vizmaya-fyi/migrations/089_html_stories_format.sql), written on save from the page's `vizmaya:format` tag, backfilled; before 089 everything reads as scroll).
- **Aura background:** an aura scene (`aura.promad.design`, by slug) is picked after the HTML is written — the **Aura background** field in the admin editor (slug or scene URL), or `aura` on the publish API / `publish_html_story`; a re-post without it keeps the current one. Stored in `html_stories.aura` ([migration 087](../../supabase/vizmaya-fyi/migrations/087_html_stories_aura.sql)), never in the document. `/s/<slug>` lays it behind the page as a fixed backdrop (`brandHtmlStory`'s `aura`: capture still under the live embed, a 35% veil of the theme background, the page's html/body backgrounds cleared), and the listing card gets `aura`, so it plays on the home grid instead of the `og:image` thumbnail. Before 087 reads skip the column and setting an aura errors.
- **Deploy:** apply migration 085 (and 086, 087, 089 for palettes, auras and format badges) → set `HTML_STORIES_TOKEN` (any long random string) on the vizmaya-fyi Vercel project. Without the token the publish API answers 503; the admin tab and `/s/<slug>` work regardless. For footshorts, set `SUPABASE_SERVICE_ROLE_KEY` (the table is RLS-locked; without it `/s/<slug>` is a 404 and the Editorial tab lists none) and its own `HTML_STORIES_TOKEN` on the footshorts web Vercel project. vizf1 web and viznba web need the same two (`SUPABASE_SERVICE_ROLE_KEY`, their own `HTML_STORIES_TOKEN`); its Editorial page lists published vizf1 HTML stories beside the viz-engine ones ([apps/vizf1/web/lib/htmlStoryCards.ts](../vizf1/web/lib/htmlStoryCards.ts)).

## Home page (`/`) — an HTML-style story, bound four ways

The whole home page is one HTML-style story the reader binds as a **Book**, a **Board**, a **Deck** or a **Scroll**, picked from the switcher in the top bar. Every binding carries all of it: the statement and the numbers, the newest 12 stories (`FRONT_PAGE_LIMIT`), Doom v Boom, the epics, the studio and how to work with it. The stories are shown together, never one per page, as bento grids of story tiles (the cover, or a glow in the story's own colours, full-bleed with the title over a dark wash): the book binds all 12 on one spread (a large lead and four on the left; a tall, a wide, five more and an archive tile on the right), the deck on two slides ("The latest": the lead large and four; "More stories": one wide, one tall, five more and the archive), and the board pins them all at once with two tour stops. Doom v Boom (score, headline, the two mornings before) and the epics (accent-tinted tiles, the first full width) are bentos too. Each grid fills its page or slide and every tile clips its own text, so long titles can't overflow the frame.

- **Data:** [lib/home/homeData.ts](lib/home/homeData.ts) `loadHomeData()` (stories, HTML stories first, epics, the last three editions; epics and editions best-effort), shared by the page and the stages. Shapes, shared copy (`STUDIO`, `PROCESS`, `CONTACT`, `homeStats`) and helpers in [lib/home/homeShape.ts](lib/home/homeShape.ts).
- **Book, Board, Deck:** `GET /home-stage/<book|board|deck>` ([route](app/home-stage/[format]/route.ts) → [lib/home/renderHomeStage.ts](lib/home/renderHomeStage.ts)) returns the whole page as one complete HTML story on the hosted format runtimes (`/formats/<format>@1.js`, see the HTML stories section). A runtime takes over its whole document and starts once, so each binding is its own document, framed full-screen under the top bar ([components/home/HomeStage.tsx](components/home/HomeStage.tsx); `<base target="_top">` so links leave the frame; `noindex`; `frame-ancestors 'self'`).
- **Scroll and the fallback:** the long page in [components/home/HomeStory.tsx](components/home/HomeStory.tsx) (with [ScrollIndex](components/home/ScrollIndex.tsx) and topic filters for the stories). It is what the server renders (every link is in the HTML without JS), what shows with a notice and "Try again" when a stage isn't ready within 12s, and what a reader gets by choosing a runtime's "Read as one page" (stages post `vizmaya:home-stage` `ready` / `linear` messages).
- **Picking a binding:** [components/home/homeViewStore.ts](components/home/homeViewStore.ts): this visit's pick, then `?view=`, then `localStorage` (`vizmaya:home-view`), then the default (Book on wide screens, Deck on phones). A pick is written back to `?view=` so links keep it. `HOME_VIEW_BOOT_SCRIPT` (inlined by [app/page.tsx](app/page.tsx)) applies the same rule before paint and adds a `<style>` that hides the scroll page until the stage is up, so it doesn't flash first.
- **Look:** Tailwind + Phosphor. Colours are generated from the logo's three dots ([lib/home/logoPalette.ts](lib/home/logoPalette.ts), OKLCH): `logoScheme(name, lead, ground)` derives ground, surfaces, text, lines and a warm paper from one hue, lifts all three logo colours to 4.5:1 on the ground (`--signal`/`--second`/`--third`, plus `--teal`/`--pink`/`--blue` by name), deepens the lead to `--ink-signal` for text on paper, and gives the board's stickies logo tints. `HOME_SCHEMES` in homeShape gives each binding its own: Book teal, Board pink, Deck blue, Scroll "Penrose" (pink on the blue's ground); the page and the masthead switch with the view, and each stage writes its scheme as `:root` vars (`schemeVars`). Stage CSS and the page use only those vars (no literal colours), and a story or epic without its own theme falls back to them. Type lives in `TYPE`: Instrument Serif (headlines, italic accents), Instrument Sans (text) and Geist Mono (dates and data). The page loads them with `next/font` scoped to its root ([lib/home/homeFonts.ts](lib/home/homeFonts.ts)); the stages from Google Fonts. No eyebrow labels: topics and formats go in the meta line under a title.

## Story randomizers (Desk, Atlas, Epics) — topics for HTML stories

Three randomizers on one slot-machine shell, from the Vizmaya Randomizer Playbook: **Vizmaya Desk** (industry, sub-industry, lens, freshness; heat weighted; editorial brief with charts), **Atlas** (country, cultural thread, time depth, geography frame, lens; route table) and **Epics** (epic, episode, place, lens; route table with Verified / Claimed / Symbolic / Lost status). A spin picks the topic; the HTML story brief then carries it (assignment, forensic research protocol, deliverables, output format, reel script rules, quality checklist, research stub).

- **Package:** [packages/randomizer](../../packages/randomizer) — `data/{desk,atlas,epics}.json` (Desk lists are samples until the real ones are pasted in; Atlas is all 193 UN members plus flagged extras; Epics is the playbook's starter catalogue, place statuses are starting points research verifies), `draw.ts` (the one shared draw: 30-day primary and 90-day combination blocks, 60/40 heat weighting with a heat-85 exemption, staleness and the Breaking → Developing → Evergreen fallback, region and tradition stratification, the one-in-three philosophical quota, locks, Atlas pair spin, Epics sequence mode; deterministic per seed, `DRAW_RULES` holds the numbers), `spinBrief.ts` (the brief sections), `stub.ts` (research stub, `HERO INSIGHT` extraction), `spins.ts` (server: `randomizer_spins` + `desk_heat`, [migration 088](../../supabase/vizmaya-fyi/migrations/088_randomizer.sql)). Tests: `npx tsx src/draw.test.ts`.
- **Lifecycle:** `spun` → (`rejected` on re-spin, with a one-tap reason) → `researching` → `insight_review` (Atlas and Epics: a human approves the hero insight in admin) → `approved` (the Desk skips the gate) → `published` (a story published with the spin's id). A publish request for a gated spin that isn't approved saves a draft with a warning.
- **Agent API (token-gated, `Authorization: Bearer $HTML_STORIES_TOKEN`):** `GET|POST /api/randomizer/spins`, `GET|PUT /api/randomizer/spins/<id>` (`{ research }`), `GET|POST /api/randomizer/heat` (the weekly heat refresh: `{ refreshed, failed }`); handlers in `packages/html-stories/src/randomizerApi.ts`. The brief for a spin is `GET /api/html-stories/brief?spin=<id>` (read-only: a public URL can't create spins, so it can't fill the log the repeat blocks read). Publish with `spinId` (JSON) or `&spin=<id>` to tie a page to its spin.
- **MCP:** `spin_randomizer`, `get_randomizer_spin`, `save_spin_research`, `get_desk_heat`, `refresh_desk_heat`, plus `spinId` on `get_html_story_brief` and `publish_html_story`.
- **Heat refresh:** there is no server-side news fetch. The refresh is an agent job (a weekly routine calling `get_desk_heat` then `refresh_desk_heat`); until a segment is refreshed its heat is the dataset seed and every spin says so. A recorded failure shows in admin and turns that segment's spins Evergreen.
- **Admin:** the **Randomizer** tab (`/vizmaya/randomizer`).

### Football Desk (footshorts)

A fourth randomizer on the same shell and the same spin log, for footshorts.com stories: **Football Desk** (`footshorts`: tournament, team, angle, freshness; plus an opponent when Head-to-head is on; football explainer with charts; no approval gate). [Migration 090](../../supabase/vizmaya-fyi/migrations/090_randomizer_footshorts.sql) widens the `randomizer` check.

- **Dataset:** `data/footshorts.json`: the 13 competitions the footshorts worker ingests (keyed by `fixtures.competition_slug`, with their league entity slugs), 10 football angles, and Matchday (4 days) / Running story (30) / Evergreen. Teams are not in the dataset: they come from the news snapshot, so the team reel only offers clubs with fixtures.
- **News, not a seed:** `loadFootshortsNews()` in `spins.ts` reads the footshorts tables in this same project at spin time: teams with a fixture in a covered tournament from 60 days back to 30 ahead (`fixtures` + `entities`), the cluster-lead stories tagged to each in the last 14 days (`articles` + `article_entities`, confidence weighted, log-scaled to a 0 to 100 heat), the three newest headlines, and the last three results and next two fixtures. A tournament's heat counts stories tagged to it or any of its teams. Tunables in `FOOTSHORTS_NEWS_RULES`.
- **Draw (`drawFootshorts`):** one 60/40 branch per spin: heat-weighted picks the tournament by its heat (plus a floor of 5 so quiet ones keep a chance) and then a team by its heat; pure random picks both uniformly. Only tournaments with teams in the window are in the draw; the same tournament twice in a row is re-drawn once; 30-day team block with the heat-85 exemption; 90-day block on tournament, team, angle, freshness and opponent; no tagged story inside the drawn window shifts Matchday to Running story. Head-to-head prefers an opponent the team meets in the window. The spin snapshots the team, opponent and up to 8 fixture ids (meetings first, then recent results and the next match).
- **Brief:** `GET footshorts.com/api/html-stories/brief?spin=<id>` (a spin's brief only renders on its own site: Football Desk spins on footshorts, the rest on vizmaya). It carries the assignment (team, tournament, angle, freshness, the latest footshorts headlines, the fixtures), the research protocol (rumours stay Unverified until confirmed), the football explainer format, and the match context for the spin's fixtures (no bearer token needed for those: the spin id is the capability). Publish with `spinId` to footshorts only.
- **Agent API:** footshorts.com serves `GET|POST /api/randomizer/spins`, `GET|PUT /api/randomizer/spins/<id>` and `GET /api/randomizer/news` with its own `HTML_STORIES_TOKEN`; vizmaya.fyi serves the same (plus `/news`). One log either way.
- **MCP:** `spin_randomizer` with `randomizer: "footshorts"` (posts to footshorts.com; `pair: true` for a head-to-head), `get_football_news`, then `get_html_story_brief` / `publish_html_story` with `app: "footshorts"` and the `spinId`.
- **Admin:** `/footshorts/randomizer`, with the live news heat table.
- **Deploy:** apply migration 088. It reuses `HTML_STORIES_TOKEN` and the Supabase service key.

### NBA Desk (viznba)

A fifth randomizer on the same shell and the same spin log, for VizNBA stories: **NBA Desk** (`viznba`: conference, franchise, angle, freshness; plus an opponent when Head-to-head is on; basketball explainer with charts; no approval gate). [Migration 092](../../supabase/vizmaya-fyi/migrations/092_viznba.sql) widens the `randomizer` check and registers the `viznba` app row admin's `/viznba` section needs.

- **Dataset:** `data/viznba.json`: the two conferences and their divisions, all 30 franchises (keyed by `viznba_teams.team_id`, ESPN's abbreviation lowercased, with the ESPN id, the NBA abbreviation, division and a team colour that reads on the dark background), 10 basketball angles, and Last night (3 days) / This week (10) / Evergreen.
- **News, not a seed:** `loadViznbaNews()` in `spins.ts` reads the viznba_ tables in this same project at spin time: the summarized stories in the last 14 days (`viznba_articles` + `viznba_article_entities`, confidence weighted, log-scaled to a 0 to 100 heat), where a story tagged with a player or coach counts for the team he is on now (`viznba_players` / `viznba_coaches`), the three newest headlines and the three most-tagged people per team; and ESPN's day scoreboards for 21 days back to 14 ahead, eight at a time (`fetchNbaGames`; ESPN refuses date ranges) for each team's last three results and next two games. A failed schedule read leaves the games empty and the spin says so. Tunables in `VIZNBA_NEWS_RULES`.
- **Draw (`drawViznba`):** one 60/40 branch per spin: heat-weighted picks the conference by its heat (plus the floor of 5) and then a franchise by its heat; pure random picks both uniformly. The same conference twice in a row is re-drawn once; 30-day team block with the heat-85 exemption; 90-day block on conference, team, angle, freshness and opponent; no tagged story inside the drawn window shifts Last night to This week to Evergreen. Head-to-head draws from the whole league and prefers a team the franchise plays in the window. The spin snapshots the team, opponent and up to 6 ESPN game ids (meetings first, then recent results and the next game).
- **Brief:** `GET <viznba>/api/html-stories/brief?spin=<id>`. It carries the assignment (team, conference, angle, freshness, the people in the news, the latest VizNBA headlines, the games), the research protocol (trade and injury rumours stay Unverified until confirmed), the basketball explainer format, and the game context for the spin's games (`viznbaBrief.ts`: each game's ESPN box score; no bearer token needed: the spin id is the capability). Publish with `spinId` to viznba only.
- **Agent API:** the viznba web app serves `GET|POST /api/randomizer/spins`, `GET|PUT /api/randomizer/spins/<id>` and `GET /api/randomizer/news` (the NBA Desk's snapshot) with its own `HTML_STORIES_TOKEN`. One log either way.
- **MCP:** `spin_randomizer` with `randomizer: "viznba"` (posts to the viznba site; `pair: true` for a head-to-head), `get_nba_news`, then `get_html_story_brief` / `publish_html_story` with `app: "viznba"` and the `spinId`.
- **Admin:** `/viznba/randomizer`, with the NBA news heat table (conferences, every franchise's heat, stories, people in the news, last and next game, newest headline).
- **Deploy:** apply migration 092. It reuses the viznba web deployment's `HTML_STORIES_TOKEN` and the Supabase service key.

## Epics (/energy-profile, /epstein, …)

Topic collections that bundle a bespoke landing page with curated vizmaya stories. Data model lives in migration `015_epics_iea.sql` (per-epic tables still carry the `iea_` prefix from when the epic was called "iea"; renamed to `energy-profile` in migration 019).

- `epics` — `slug`, `name`, `description`, `landing_component`. The discriminator picks which React component the route renders.
- `story_epics` — many-to-many between `stories.slug` and `epics.slug`, with optional `position` for ordering.
- Per-epic data tables alongside (`iea_news`, `iea_countries` so far).

URLs are top-level per epic (`/energy-profile`, `/epstein`) rather than `/epic/<slug>` — each landing page is hand-built. Reads go through `lib/epics.ts`.

### Energy Profile news pipeline

`.github/workflows/scrape-energy-profile-news.yml` runs daily (06:15 UTC) — pulls Google News RSS for "International Energy Agency", hands each new article to Claude Haiku (`text.haiku` via `@vismay/ai-gateway`, zod-schema structured output) for ISO country-code tagging, and upserts into `iea_news`. Tagging stays an extraction call rather than per-country Jev decisions because the candidate set is every ISO code. Idempotent on `source_url`.

- **Script:** [scripts/energy-profile/scrape-news.ts](scripts/energy-profile/scrape-news.ts). Run locally with `pnpm energy-profile:scrape`.
- **Manual run in prod:** GitHub → Actions → "Scrape Energy Profile news" → "Run workflow".
- **Required repo secret** (in the `Production` environment): `AI_GATEWAY_API_KEY` (the shared gateway key). The Supabase secrets are reused from the other workflows.

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
0981.HK, …) in its native currency. Deliberate exceptions, so their prices
import automatically with the US tickers instead of through the intl paths:
TSMC and ASML via their US ADRs (`TSM` on NYSE, `ASML` on NASDAQ; migration
067 retired `2330.TW` and `ASML.AS`), and Advantest, SoftBank Group and Hon
Hai via their US OTC lines (`ATEYY`, `SFTBY`, `HNHPF`; migration 083 retired
`6857.T`, `9984.T` and `2317.TW`). That leaves four home-exchange listings —
Samsung, SK hynix, SMIC and Tokyo Electron — which have **no working
automatic feed** (the Apify path returns no bars) and are outside the Doom v
Boom market term. Before moving another company to a US symbol, check that
massive.com serves it: `pnpm ai-data-centers:import-stocks -- --probe SYMBOL`
(or the workflow's `probe` input) — reads only, nothing is written.

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

### AI Data Centers daily snapshot (`/ai-daily/doom-v-boom`)

The epic's second output beside the live explorer: one **frozen edition a
day** (window 06:15 → 06:15 UTC, public at 09:00 UTC, never edited after
publish) that curates the previous 24 hours of AI, energy and sustainability
news into one static page — headline + deck, a Doom v Boom reading, six
metric-led key notes, then geography / AI layer / research / AI + energy
chapters, each with its own bespoke SVG/canvas visualisation and a slide-over
panel for the underlying stories, a derived Sources chapter and an archive
rail. PRD: [docs/ai-data-centers-daily-snapshot-prd.md](../../docs/ai-data-centers-daily-snapshot-prd.md);
design reference: **`/ai-daily/doom-v-boom/sample`** — the fixture rendered
through the real components. There is no separate mockup file: a design change
is made in the components and reviewed on that route, so the reference can
never drift from what ships.

- **Schema:** [supabase/vizmaya-fyi/migrations/078_dc_editions.sql](../../supabase/vizmaya-fyi/migrations/078_dc_editions.sql) — snapshot tag columns on `dc_news` (`layer`, `place`, `region`, `theme`, `mood`, `energy`, `facts`, `classifier_version`), the seeded `dc_places` list, `dc_papers`, and `dc_editions` (the row *is* the page: prose + every computed number + the frozen `story_ids` / `paper_ids` / `iea_ids` membership). A trigger rejects updates to a published row; `ai_generations` accepts kind `edition_edit` for the editor audit. `dc_news_recaps` (066) stays read-only for the admin Recaps timeline.
- **Pipeline (GitHub Actions, all in `Production`), triggered by Vercel Cron.** The three daily jobs run as ONE chained workflow, [dc-morning-edition.yml](../../.github/workflows/dc-morning-edition.yml) (06:15 UTC = the window close): scrape → papers → compose, each reusing its own workflow file via `workflow_call`. They used to be three crons and GitHub's scheduler drifted them hours apart, so the composer once wrote an edition from an unfilled window; the next day it did not start the chain or the publish crons at all. So **no daily workflow carries a `schedule:`** — `apps/vizmaya-fyi/vercel.json` crons hit [app/api/ai-data-centers/cron/[job]/route.ts](app/api/ai-data-centers/cron/[job]/route.ts) (`morning` 08:15, `publish` 09:00, `publish-late` 09:30 UTC), which dispatches the workflow through the same `GITHUB_DISPATCH_*` env the render routes use. Auth is Vercel's `Authorization: Bearer $CRON_SECRET` (env var on the vizmaya-fyi project; fails closed). Minute-exact crons need the Pro plan — on Hobby, Vercel runs a daily cron once within the hour. The individual files keep `workflow_dispatch` for manual runs and the admin buttons; `skip_feeds` on the chain composes without re-scraping.
  1. [scrape-news.ts](scripts/ai-data-centers/scrape-news.ts) (first job) — the existing Haiku classifier now also returns the snapshot tags and `facts` in the same call. Dispatch with `backfill_days` (or `pnpm ai-data-centers:scrape-news -- --backfill-days 30`) once after migration 078 to tag history for the mood sparkline and field baselines.
  2. [ingest-papers.ts](scripts/ai-data-centers/ingest-papers.ts) (second job) ([ingest-dc-papers.yml](../../.github/workflows/ingest-dc-papers.yml)) — arXiv API across six categories → keyword gate → Haiku gate + extraction → `dc_papers` (upsert on `arxiv_id`, rejects kept with `relevant=false`).
  3. [compose-edition.ts](scripts/ai-data-centers/compose-edition.ts) (third job, ~06:45) ([compose-dc-edition.yml](../../.github/workflows/compose-dc-edition.yml)) — replaces the retired markdown recap worker. One typed gateway call (Opus 5.5 by default, `DC_DEFAULT_MODEL` in editionCharts.ts) writes the prose (headline, deck, 6 notes, per-layer briefs, research headline) and a second plans the section charts (see below); everything numeric is assembled deterministically in [packages/dc-editions/src/dcEditionAssembly.ts](../../packages/dc-editions/src/dcEditionAssembly.ts) and every note's lead number is grounded in the stories it cites. Falls back to a deterministic edition (`model='deterministic'`) on any model failure. Writes the single draft row; re-runs keep editor edits unless `--clear-edits`.
  4. [publish-edition.ts](scripts/ai-data-centers/publish-edition.ts) 09:00 + 09:30 UTC ([publish-dc-edition.yml](../../.github/workflows/publish-dc-edition.yml)) — freezes the draft (status, number, `published_at`) and pings the signed revalidate hook. Review is a window, not a gate: an admin Hold moves auto-publish by 30 min, once; `--force` publishes through a hold.
- **Readers/writers:** [packages/dc-editions/src/dcEditions.ts](../../packages/dc-editions/src/dcEditions.ts) (`getEdition`, `getLatestEdition`, `listEditions`, `getDraftEdition`, `saveDraftEdition`, `setDraftMembership`, `holdDraftEdition`, `publishDraftEdition`, `getMoodSeries`, `listPapersForEdition`, `assembleEditionNumbers`); client-safe types + vocabularies in `dcEditionTypes.ts`.
- **Routes:** `/ai-daily` (hub of daily series, ISR), `/ai-daily/doom-v-boom` (series landing: latest Boom Score ring, the last 30 mornings as small still rings, methodology, full archive; ISR + revalidated on publish), `/ai-daily/doom-v-boom/latest` (307 to the newest dated edition — the stable "today's edition" link), `/ai-daily/doom-v-boom/[date]` (static, immutable once published), `/ai-daily/doom-v-boom/sample` (fixture, noindex). API: `/api/ai-data-centers/editions?limit=` (archive rail), `/api/ai-data-centers/editions/[date]` (row + resolved stories/papers), `POST /api/ai-data-centers/editions/revalidate?date=` (signed with `ADMIN_SESSION_SECRET`, called by the publish job and the admin). The rings off the edition page are `ScoreRing.tsx`: `StaticRing` (server SVG of the same seeded particles, coloured by boom share) and `LiveRing` (the BoomRing canvas over it; also on the home page cards, which set the edition tokens on a `[data-ring-palette]` host).
- **Frontend:** server components under [app/ai-daily/doom-v-boom/](app/ai-daily/doom-v-boom/) render one edition row to static HTML; the client code is the slide-over `StoryPanel` (delegated `data-panel` handler, `#p=layer:semi` deep links), the canvas `GeoMap` (land mask shipped as a flat array), the hero's Boom Score ring (`BoomRing`: beautiful-headers' Particle Ring ported to Canvas 2D in `particleRing.ts`, no three.js; the share of `--boom` particles is the day's boom share, `(score + 1) / 2`, shown as a score out of 100), the scroll-spy nav and `QuadrantPlot`. No Mapbox, no ECharts, no client fetch. Tokens extend [app/ai-data-centers/theme.ts](app/ai-data-centers/theme.ts) (`energy`, `down`, `doom`/`boom` + `doomInk`/`boomInk` for the Doom v Boom reading, composition hues, map dots, and one accent per AI layer — `layerDc`/`layerHyper`/`layerSemi`/`layerEquip`: each Chapter IV tile (`LayerTile`, `data-layer`) re-points the accent family at its own, so its Phosphor icon, note marks, chips and its chart's lead series follow it; the chart's other series stay on the page palette via `--chart-mid`/`--chart-hi` in `chartSvg.ts`) with a light theme; fonts Prata + Public Sans/Space Mono via `next/font/google`.
- **The energy chapter has no fixed chart slots.** `EnergyChapter.tsx` reads the edition's own stories, not a pre-aggregated block: six vizzes each declare what they need from the stated `facts.figures`, score zero when this edition can't fill them, and the engine ranks the survivors, leads with the strongest and prints what it held back and why. A day with no disclosed capacity gets a different chart, never an empty axis; `perEdition.gw = null` means an edition disclosed nothing and draws as a gap, not a zero. Only *committed* power reaches the capacity bar (`isCommittedPower` in dcEditionAssembly, shared with the composition) — queue and lead-time figures stay on the "other figures" card.
- **Composer-planned charts (migration 079, `dc_editions.charts` + `chart_skips`) — one per section, guaranteed by a ladder.** Six sections: energy, the four layers, research. Each descends `EditionChartRung`s until something draws: **rung 1** the planner ([scripts/ai-data-centers/editionCharts.ts](scripts/ai-data-centers/editionCharts.ts)) over today's stated figures, one gateway call per section with one retry carrying the validator's refusal reason; rungs 2–3 (today against the trailing record / a dataset) are the chart agent's, next; **rung 4** ([editionChartFallbacks.ts](scripts/ai-data-centers/editionChartFallbacks.ts)) the record alone in code — Epoch facility power (dc, energy), tracked-stock moves per layer (`dc_stock_prices` tape), power per edition (energy), paper gains for the unit most papers report in or papers-by-field (research). Rung 4 needs no model, so a section only ends on its template when even the record is under three rows; the chart carries `rung`, the caption names the dataset, and the admin prints "rung 4 (why rung 1 gave nothing)". **No two sections show one comparison:** sections are placed in page order and a rung-1 plan that repeats half the rows or cited stories of one already placed yields to the record; a record builder used by one section (`RecordChart.key`) is skipped for the next, so energy gets facility power *by country* when dc has it *by site*. **Forms vary by the comparison:** the planner prompt names when to use lollipop / grouped bar / scatter / slope / waterfall; rung 4 gives each section a different reading of its dataset — dc a scatter of Epoch power against capital cost (then site lollipop, then moves), hyper an indexed line over the last 10 sessions (`getDcStockMarket(30)` close series), semi diverging bars of window moves (falls in `--down`), equip a slope from window open to close, energy a line per edition / bars by country, research a gains lollipop — with the others as fallbacks when a dataset is short. Renderer rules that made these work: flint's lollipop is a 1.5px bar stem + a scatter head whose `[category, value]` pairs must be flipped when the axes are swapped (or the heads land off the plot); sessions on lines are a *Category* axis (flint's Date axis draws nothing for "09-15"); value axes on non-bar charts get `scale: true` with flint's `min/max` removed (else "37.068" ticks); multi-series lines/slopes drop the legend and name lines with `endLabel`; scatter labels use `labelLayout.hideOverlap`. `sample-charts.ts` pulls the real market + facilities when a Supabase env is present so `/daily/sample` shows every form. **SSR text measure:** ECharts' server renderer has no font metrics and drew mono labels off the card's left edge; `editionCharts.ts` installs `setPlatformAPI({ measureText })` with the real 0.6em-per-glyph width and caps category labels at a third of the chart width. Research is never asked at rung 1 (its numbers are in `dc_papers`, not stories); its chart replaces the results-at-scale scatter in the chapter's second card. Rung 1 in detail: the planner sees each section's stated figures with their v3 tags and plans ONE comparison as a flint spec, or skips with a reason. The plan is validated in [packages/dc-editions/src/dcEditionCharts.ts](../../packages/dc-editions/src/dcEditionCharts.ts) — every numeric cell must be a figure the row's cited story states (value, base unit or headline numeral), ≥ 3 rows, no measure column spanning > 50× — compiled through `@vismay/story-pipeline` `buildEChartsOption`, tuned for a static card (horizontal bars, top legend, mono face) and rendered to an SVG string with ECharts SSR. The page inlines the SVG and `chartSvg.ts` swaps the baked dark-palette hexes for CSS variables (the two hex tables — `TOKEN_HEX` there, `HEX_TO_VAR` here — must agree), so no chart code ships to the client and the light theme still works. A planned chart leads its section (`PlannedChart.tsx` in `LayerTile` / `EnergyChapter`); a skip leaves the template. `--charts-only` (workflow input `charts_only`, admin "Regenerate charts") re-plans on the existing draft without touching prose or edits; membership edits prune charts that quoted a dropped story. `pnpm ai-data-centers:sample-charts` runs the whole path on the fixture and writes `daily/sampleCharts.ts` for `/daily/sample`.
- **Figures are tagged (classifier v3) and judged.** Each `facts.figures[]` entry now carries `subject` (canonical entity), `scope` (site / company / market / policy), `status` (committed / target / forecast / queued / stated), `base` (MW / MWh / USD mn / bare share, via `figureMagnitude` in dcEditionAssembly — the one converter the scraper, the chart planner and the energy chapter share) and Jev's `confidence`. [scripts/ai-data-centers/jevFigureGate.ts](scripts/ai-data-centers/jevFigureGate.ts) asks `typesafe-ai/jev` (through `decide()` in `@vismay/ai-gateway`, like the footshorts worker's entity gate) one boolean per figure — literally stated, tags right — and drops below 0.5; fails open without `AI_GATEWAY_API_KEY`. After a classifier change dispatch the scrape with `retag_days` (or `--retag-days N`) so the current window carries the new fields before the next compose.
- **Doom v Boom is scored per event, weighted (classifier v4, migration 080).** Google News gives one row per outlet, so a story count made one development reported three times three votes (the $1M Vineland fine was once all three doom drivers). `scoreMoodEvents` in [dcEditionAssembly.ts](../../packages/dc-editions/src/dcEditionAssembly.ts) now groups the window into events first — `clusterEvents`: IDF-weighted cosine over the title plus the classifier's canonical `event` line (money / power canonicalised, so "$1 million" = "$1M" and "2 GW" = "2,000 MW"; never the summary, never the URL), a bonus for a shared figure, and penalties for disjoint tickers, disjoint `actors` (fuzzy: neither story mentions the other's), different places or the same outlet; average-link merging, precision first (`EVENT_MATCH`; calibrate from the compose `--dry-run` cluster printout). The IDF corpus is 30 days of the feed plus the window, so quiet days still know what's common. Each event takes the majority mood (an even boom/doom split is neutral + `mixed`) and one weight — relevance (0.6–1.0) × impact (1 → 1×, 5 ≈ 6.3×) × coverage (1 + 0.25·log2 outlets, cap 1.75×), grades the median of the graded members (`MOOD_WEIGHTS`) — and the reading is `(W_boom − W_doom) / (W_boom + W_doom)`, neutral excluded; with no duplicates and equal weights that is the old count. The classifier (`DC_CLASSIFIER_VERSION = 'v4-events-2026-09'`, shared in dcEditionTypes) grades `relevance` and `impact` 1–5 on anchored rubrics — impact rates size, not direction, and a plan / forecast / warning grades one step below the same thing done (that is where "firmness" lives; a separate multiplier would tilt every day toward boom, since doom news is mostly warnings) — and writes the `event` line and up to 3 `actors`. The events are frozen on the edition in `mood_counts` (`{boom, doom, neutral}` = event counts, plus `method: 'events-v1'`, raw `stories` counts, side `weight`s and every event `{lead, ids, mood, w, r, i, outlets, mixed?}`), so `dc_editions` needed no new column; the meter's drivers ("Bloomberg +2"), each side's share of the weight and the `mood:*` panel (one row per event, "Also:" links) read them, and editions without `method` render the old story-by-story way. The history loop only trusts a published score of the same method; older days are re-read from the feed, so the 7/30-day ticks can differ from the archive rail's frozen scores for 30 days. Grouping is Doom v Boom only — the other panels, the layer / pin counts, the energy chapter's "Pressure and relief" and the prose model's input still see every report. The admin membership list groups by event (dup of #id, R·I, weight, mixed).
- **The score is tilted by the market (`news+market-v2`, migration 082).** The events reading above is the *news* reading; the stored `mood_score` is `news + w × market`, clamped to ±1 (`blendMoodScore` in dcEditionAssembly). It is a tilt, not an average: v1 was `(1 − w) × news + w × market`, and with the news reading averaging about +0.56 and the market near zero that shrank every score by about a quarter — an up session could lower a booming day (8 of 26 days lost a word, all downgrades). `w` (`market_weight`) is now how far a market reading of ±1 moves the score. The market is the tracked stocks' **previous session** — the calendar day before the edition (`marketSession`), whose US closes land inside the window and whose bars the 22:45 import has already written by compose time. Each active **US-listed** ticker's close-to-close move on that date (`getDcMarketStocks` filters `market = 'US'`: those prices and caps refresh unattended and close on one session; the home-exchange listings don't) (`sessionMoves` over `getDcCloseSeries`, prior close ≤ 7 days back) is clamped to ±10%; **inside each AI layer** (`STOCK_CATEGORY_TO_LAYER`) the moves are **market-cap weighted**, and the four layers are averaged **equally** (`layerBalancedMove`), so the eleven chip names don't outvote the five hyperscalers; then `tanh(move / scale)`. Fewer than 8 tickers or 3 layers closing that day (Sun/Mon editions, holidays, a failed import) → no market term and the score is the news reading; no news reading → unscored (the market tilts the news, never stands in for it). The split is frozen in `mood_counts.score` `{method, news, market: {session, tickers, up, down, avgPct, score, layers, scalePct} | null, marketWeight}`; the meter prints it (per layer) under the needle, the admin draft line and the composer's `moodParts` input carry it. History: a published `news+market-v2` score is used as is; a published `news+market-v1` edition's frozen news reading, or an `events-v1` score (that day's news reading), gets tilted by its session now; older days are re-scored from the feed with their session. The tape (`getDcTapeMoves`, last two bars whatever their date) is unchanged and still only feeds the ticker strip and charts.
  - **Market caps:** `dc_stocks.market_cap_usd_bn` / `market_cap_as_of`. The stock importer refreshes the US caps from massive.com's ticker reference (`/v3/reference/tickers/{t}`) when they're over a week old (`--refresh-caps` / the workflow's `refresh_caps` input forces it). massive.com's reference has no cap for the OTC lines (`ATEYY`, `SFTBY`, `HNHPF`), so those three are set by hand in SQL (migration 083 carries them over from the retired home rows; the refresh never overwrites a cap with nothing). The four home-exchange listings are outside the market term, so their caps don't matter. A ticker without a cap weighs as its layer's median cap (a layer with no caps weighs its tickers equally). History uses today's caps as the weights.
  - **Calibration:** `w` and `scale` come from the newest `dc_mood_calibrations` row (`getMoodCalibration`; no row / no table → `MARKET_MOOD` defaults 0.25 / 2%). [scripts/ai-data-centers/calibrate-mood.ts](scripts/ai-data-centers/calibrate-mood.ts) (`pnpm ai-data-centers:calibrate-mood`, workflow [calibrate-dc-mood.yml](../../.github/workflows/calibrate-dc-mood.yml), manual) backfills the daily readings — news re-read from the feed for `--news-days` (`readDailyNewsReadings`, published scores ignored so every day is measured alike), layer-balanced moves for `--market-days` of sessions — and fits the scale (`fitMarketScale`) so the market reading's standard deviation matches the news reading's, which makes `w` unit-free: a typical session moves the score `w` times as far as a typical day's news does. It prints the fit, the variance share, how many days change word, the news↔market correlation (same session and next session) and every backfilled day (step summary + CSV artifact); `--write` appends the row (with `--weight` to change `w`), `--note` says why. Published editions stay frozen — backfill never rewrites the archive. Needs price history (`full_backfill`) and tagged news (`backfill_days`); with too little of either it says which and doesn't fit.
  - **Deploy:** apply migration 082 → dispatch `import-dc-stock-prices` with `refresh_caps=true` (and `full_backfill=true` if prices don't reach back a year) → apply migration 083 and dispatch the import again with `full_backfill=true` (history for the three OTC symbols) → dispatch `calibrate-dc-mood` (dry run, read the summary) → rerun with `write=true`.
- **Lead with what's new; carried-over news goes to "Still developing" (migration 084, `dc_editions.continuing`).** Google News keeps surfacing a development for days as more outlets file on it, so consecutive windows can share no story and still lead with the same news (Samsung's $1B Helix stake led both 2026-09-29 and 09-30). The composer loads the last three editions (`listPriorEditions`) and clusters the window together with their stories — the same `clusterEvents` matching as Doom v Boom, run across the cutover (`findCarryOvers` in dcEditionAssembly), plus `mergeCarriedGroups`, which joins groups naming the same money/power figure *and* organisation so one development isn't listed twice. A window story grouped with an earlier edition's story is carried over: the thread carries `since` (first edition), `previously` (the earlier lead's event line) and `newFigures` (anything this window states that the earlier reports didn't). The prose model sees each carried story's `continuing` object plus `previousEdition` and is told not to lead the headline, deck, notes or layer headlines with one unless it adds something; it writes the `continuing` block (≤ `CONTINUING_MAX` = 5, one line per thread on what the window added). Enforced after the model: a headline or deck sentence that repeats ≥ `ECHO_THRESHOLD` (0.5) of a thread's IDF-weighted event line without naming a new figure (`echoedThread`) triggers one rewrite with the offending lines named (the less-repetitive draft wins); a key note citing only carried stories and not led by a new figure (`noteRepeatsThread`) moves to the block, and the notes pad from new stories. The deterministic fallback ranks new stories first and builds the block from the threads. `since` is always derived from the thread, never from the model. Page: `Continuing.tsx` under Key notes, each thread linking back to the edition that first ran it; admin edits `continuing.N.label/text/sources`. Doom v Boom still counts carried stories — the reading is of the window's coverage. **Deploy:** apply 084 (reads and writes fall back to the pre-084 column list, so an early deploy renders without the block rather than failing) → recompose; the dry run prints the threads. **Compat check:** `pnpm ai-data-centers:check-compat` ([check-edition-compat.ts](scripts/ai-data-centers/check-edition-compat.ts)) drives the fallback with PostgREST's real missing-column errors (42703 on select, PGRST204 on write) plus pre-084 rows, composer runs and edits offline; with the Supabase env it also probes whether 084 is applied, reads the last `--limit` editions through the public readers, validates every stored block and composer run, and dry-runs the carry-over check on the latest edition — read-only, exits 1 on any failure. Run it before and after applying 084.
- **The composer runs on Opus 5.5 (`anthropic/claude-opus-5.5`) through the gateway.** `compose-edition.ts` calls `@vismay/ai-gateway` `generateText` with a zod schema for the prose and the chart plan (`COMPOSER_MODEL` / `COMPOSER_CHART_MODEL` override, a `text.*` alias or a gateway id — the bare alias `opus` is rejected). The workflow needs `AI_GATEWAY_API_KEY` in the Production environment (Gemini is no longer used here); the gateway team's spend cap applies, so a capped key silently produces deterministic editions with template charts — the admin's chart status line prints the reason.
- **`QuadrantPlot`** (research, results at scale) places its point labels with collision detection over a ring of candidate anchors, best of 40 seeded shuffles; "Regenerate layout" just advances the seed. Label widths are *estimated* (`WIDTH_CALIBRATION`) for the first paint — the server and client paint must match byte for byte — then, after mount and `document.fonts.ready`, measured with `getComputedTextLength()` and the layout re-placed where the estimate was off by more than a pixel.
- **Template-viz floor (`MIN_VIZ_ROWS = 3`, dcEditionAssembly).** Every deterministic viz — the capacity ledger (three rows that *state* MW; undisclosed rows only trail), the hyperscaler matrix (which also needs two kinds of move, not one column of dots), the horizon and orders timelines, and each energy-chapter card — draws only with three or more rows, one row per subject / supplier (two outlets on one site or one toolmaker collapse via `subjectKey`). The energy chapter's coverage charts (topic × region, clock, pressure v relief) additionally need six energy stories and at least one stated figure. Below the floor a tile prints its notes and no viz (and no viz eyebrow); a research chapter with no papers is just its notice. The energy figures card draws a rail only between figures that share kind, status and scope within the 50× range, so an untagged (pre-v3) figure gets no rail rather than a wrong one.
- **Admin:** `/vizmaya/editions` in `apps/admin` — draft banner with countdown, Publish now / Recompose (dispatches the compose workflow) / Hold, editable prose, membership checkboxes (re-derives the numbers), diff to the previous composer run, and the archive.
- **First deploy:** apply migration 078 → dispatch the scrape with `backfill_days=30` → dispatch `ingest-dc-papers` → dispatch `compose-dc-edition` → review in admin → `publish-dc-edition` (or Publish now). Model providers are unreachable from the dev sandbox proxy — use `--dry-run` locally to preview the deterministic layer.
- **Charts deploy (2026-09):** apply migration 079 *before* shipping the code (`EDITION_COLUMNS` selects `charts`, so reads fail on the old schema) → add `AI_GATEWAY_API_KEY` to the Production environment → dispatch the scrape with `retag_days=2` → dispatch `compose-dc-edition` (or admin Recompose) → check each section's chart status in the admin Editions tab.
- **Event-scoring deploy (2026-09):** apply migration 080 (`dc_news.relevance`, `impact`, `event`, `actors`) — the three `dc_news` reads in dcEditions.ts fall back to the v3 column list on a missing column, so an early deploy degrades to ungraded events rather than breaking → deploy → dispatch the scrape with `retag_days=2` so the window carries v4 tags (`retag_days=30` for comparable history: ~3–4.5k Haiku calls, two runs under the 25-min deadline) → recompose (`--dry-run` prints the grouped reports) → check the grouping in the admin Editions tab.

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

AI calls (text + image + decisions) go through [@vismay/ai-gateway](../../packages/ai-gateway/README.md),
which wraps the Vercel AI Gateway and reads `AI_GATEWAY_API_KEY` (or Vercel's
OIDC token). Yes/no, pick-one and score decisions go to Jev via `decide()`;
text work goes to Claude, tiered by complexity — `text.haiku` for per-item
extraction (social email parse, energy news tagging, umami history events,
epstein NER + PDF OCR), `text.sonnet` for editorial prose (energy country
summaries, epstein sub-stories, entity dedupe clustering), `text.opus` for
`scripts/ingest/structure.ts`. Scripts that take a model override read
`TEXT_MODEL` (alias or gateway id). The remaining direct `@anthropic-ai/sdk`
call sites (ai-data-centers scrape-news / ingest-papers, coke-studio
extract-places) and the TTS engine behind generate-audio still hit providers
directly.

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

**Audio render dispatch:** `lib/storyAudioDispatch.ts` fires `.github/workflows/render-audio.yml` when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set (same envs as PDF/video). The workflow needs `AI_GATEWAY_API_KEY` (TTS is Gemini TTS through the AI gateway). Without dispatch envs configured, the regen button returns `mode: 'unconfigured'` with a hint to run `npx tsx scripts/generate-audio.ts <slug> --force` locally.

**Deploy requirements:**
- Apply migration `012_story_tts.sql` — adds `stories.tts_yaml`.
- Make sure `AI_GATEWAY_API_KEY` is in the `Production` environment in repo secrets so render-audio.yml can reach the gateway.
