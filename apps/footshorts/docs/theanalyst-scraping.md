# theanalyst.com (Opta) scraping

theanalyst.com is Opta/Stats Perform's editorial site. It's the **one approved
exception** to footshorts' RSS-only news policy ([plan.md](./plan.md)): it
publishes no feed, and it carries three things nothing in our RSS set does —
Opta-grade editorial, the weekly **Opta Power Rankings**, and per-match stats
(xG etc.) in its match centre. The exception was approved with the same
mitigations RSS gets: **always attribute and link back, summarize only, never
store or reproduce full article text.**

Companion doc to [`football-data-api.md`](./football-data-api.md), which
covers the keyed stats API. Everything here is scraping, so it also carries a
verification checklist that MUST pass before the crons are trusted.

## The three scrape targets

| Target | Adapter | Entry point | Destination | Cadence |
|---|---|---|---|---|
| General news | `worker/src/theanalyst/news.ts` | `ingest.ts` (`SCRAPE_SOURCES` loop) | `articles` (same pipeline as RSS: dedupe → Gemini summary → entity tags) | hourly, inside `footshorts-ingest.yml` |
| Opta Power Rankings widget | `worker/src/theanalyst/powerRankings.ts` | `theanalystPowerRankings.ts` | `power_rankings`, as a **draft** for admin review — never auto-published | daily Mon-Fri, `footshorts-theanalyst-power-rankings.yml` (+ admin "Run scrape" button) |
| Match centre stats | `worker/src/theanalyst/matchCentre.ts` + `matchDiscovery.ts` | `theanalystMatchFacts.ts` | `opta_match_facts` (per-side upsert) + theanalyst ids persisted on `fixtures` | 3-hourly (30 min after the scores refresh), `footshorts-theanalyst-match-facts.yml` |

### URL shapes

- Articles: `https://theanalyst.com/articles/<slug>`
- Power Rankings explainer article (title/publishedAt/narrative only — NOT
  where the ranked list lives): `https://theanalyst.com/articles/who-are-the-best-football-team-in-the-world-opta-power-rankings`
- Power Rankings widget (the actual ranked list; a continuously-updated
  cross-origin `<iframe>` embedded in the article above — read its `src`
  rather than hardcoding, it's just the fallback):
  `https://dataviz.theanalyst.com/opta-power-rankings/`
- Match centre widget (what `matchCentre.ts` fetches directly — NOT the
  `theanalyst.com/opta-football-match-centre` wrapper page, which only sets
  its iframe's `src` client-side and so never has the widget's DOM in
  `page.content()`): `https://dataviz.theanalyst.com/opta-football-match-centre/?competitionId=<id>&seasonId=<id>&matchId=<id>` — all three ids are **opaque strings** (e.g. `73ob0ein8likagvlqcyqf4zys`), stored as `text` on `fixtures` (`theanalyst_*` columns, migration `20260824000000`). Requires a real `matchId` — without one every panel renders "No data found." There is no listing/no-`matchId` mode at this URL.
- Fixtures listing (what `matchDiscovery.ts` uses to *find* matchIds — see
  below): `https://theanalyst.com/competition/<theanalystSlug>/fixtures`
  (`theanalystSlug` per competition in `theanalyst/competitions.ts`, e.g.
  `premier-league`, `la-liga`).

## Fetch mode per target (verified against the live site)

Only the article listing/pages are server-rendered; the Power Rankings
ranked list and the match-centre stats widget are client-rendered React and
come back empty over plain `fetch` (the "no stat rows found" / "no ranked
list found" errors below). `worker/src/theanalyst/fetch.ts` exports both:

- `fetchHtml` — plain fetch. Used by `news.ts` only.
- `fetchRenderedHtml` — headless Chromium via Playwright (`chromium.launch`,
  one browser instance reused per process, `goto` + `waitForLoadState('networkidle')`
  or `waitForSelector` with a timeout fallback), returns one final HTML
  snapshot. Used by `powerRankings.ts` and `matchCentre.ts`.
- `newRenderedPage` — same shared browser, but hands back a live Playwright
  `Page` for multi-step interaction instead of one snapshot. Used by
  `matchDiscovery.ts`, which has to click through a date-picker calendar (see
  below) — there's no single URL that lists a competition's match history.

Entry scripts (`theanalystPowerRankings.ts`, `theanalystMatchFacts.ts`) call
`closeBrowser()` before `process.exit` — don't add a new entry point without
doing the same, or the process hangs.

CI installs the browser explicitly (`pnpm exec playwright install chromium
--with-deps`, both `footshorts-theanalyst-*.yml` workflows) since it isn't
bundled with the `playwright` package.

## Politeness rules (worker/src/theanalyst/fetch.ts)

- Identified User-Agent with a contact address: `Footshorts/1.0 (theanalyst ingest; hello@promad.design)`.
- Fixed ≥1s delay between consecutive requests within a run; no parallel fetches.
- Per-run caps: max 10 new article pages per ingest run (`MAX_SCRAPED_ARTICLES_PER_RUN`), max 20 match-centre pages per match-facts run (`MAX_SCRAPES_PER_RUN`). Hourly/3-hourly crons drain backlogs instead of bursting.
- Non-HTML or non-2xx responses are hard failures, never parsed.
- Dedupe before fetch: known `url_hash`es and already-scraped fixtures are skipped without a request; Power Rankings runs no-op on an unchanged content hash.

## Competition id map (worker/src/theanalyst/competitions.ts)

Only a human-readable `theanalystSlug` per `competition_slug` is curated
here now — the opaque `competitionId`/`seasonId` pair the match centre
actually addresses matches by is read live off the fixtures listing during
discovery (below), not hand-maintained. An earlier version of this file DID
hand-curate `competitionId`/`seasonId` (guessed from one example URL, never
verified) — season ids change every season and there was no way to notice a
stale one short of the cron silently discovering zero matches every run.
Reading them fresh removes that maintenance burden entirely.

`theanalystSlug` values verified live 2026-08-24 by requesting
`https://theanalyst.com/competition/<slug>/fixtures` and checking the page
title — it doesn't always match our own slug (`la-liga` vs our
`primera-division`), and `champions-league` 301-redirects to
`uefa-champions-league`.

## ⚠️ Selector fragility — what needs patching when the DOM shifts

All of this was authored **without network access to theanalyst.com** (the
authoring sandbox blocks the domain), so every page-structure assumption is a
best-effort heuristic, deliberately isolated so fixing it is a contained
patch:

| File | Assumption to verify |
|---|---|
| `theanalyst/news.ts` | listing pages link articles at `/articles/<slug>`; article pages expose `og:title` / `article:published_time` / `og:image` and body text under `<article>`/`<main>` — **verified live, working over plain fetch** |
| `theanalyst/powerRankings.ts` | the ranked list is a `<table>` with a `<thead>` (columns: rank/team/rating/ranking change), an `<ol>`, or "N. Team" text lines (three strategies tried in order) — **verified live**: it's the table, column-mapped by header text. Fixed a real bug along the way: `toNumber()` returned `0` (not `null`) for any digit-free string, so the "is this a team name, not a number" guard rejected every row. |
| `theanalyst/matchCentre.ts` | stat rows contain a text label (spellings in `STAT_LABELS`) plus two numbers, home first — **confirmed FALSE, rewritten**: the widget renders six distinct `table.Opta-Stats-Bars` sub-widgets (two-`<tr>` label/data pairs, where the data row's middle bar `<div>` duplicates both values as text — a naive "N numbers near this label" scan over-collects) plus a separate `table.Opta-shotoverview` for xG (one `<tr>` per stat, `Opta-Home`/`Opta-StatLabel`/`Opta-Away`). Verified end-to-end against a real finished match (Arsenal 3-0 Coventry): xG 1.88 vs 0.2, 20 shots, 64.1% possession, 40+ additional raw stats, all correctly split home/away. Real label spellings also differed from the guesses: "Total Team xG", "Fouls conceded", "Corners won"/"Corner awarded" (STAT_LABELS updated). "Big chances"/"big chances missed" didn't appear on the one match checked — still unverified. |
| `theanalyst/matchDiscovery.ts` | the match centre without a `matchId` lists the competition's matches as links carrying `?matchId=`, with "Home vs Away" link text — **confirmed FALSE, rewritten**: no such listing view exists at the match-centre URL at any layer. The real listing is a separate page — see the discovery section below. |
| `theanalyst/competitions.ts` | the Premier League id pair (taken from the feature request's example URL) is current — **superseded**: ids are no longer hand-curated at all, see the competition id map section above |
| `sources.ts` | `SCRAPE_SOURCES[].listingUrl` points at a real article-listing page |

Power Rankings and the match centre came back empty over plain fetch+cheerio
("JS-rendered page or selector drift?") and now go through `fetchRenderedHtml`
(headless Chromium) instead — see the fetch-mode section above. If a headless
fetch is ever blocked outright (datacenter IPs flagged, CAPTCHA), the next
fallback is an Apify actor like the yahoo-stock one
(`apify/dc-yahoo-stock-scraper`).

## Match discovery — a calendar, not a listing

The match-centre URL (`dataviz.theanalyst.com/opta-football-match-centre/`)
has no mode that lists a competition's matches without already knowing a
`matchId` — confirmed dead end, the design this replaced. The real fixture
history lives at `https://theanalyst.com/competition/<theanalystSlug>/fixtures`,
but even that only shows **one day's matches at a time** via a date-picker
widget; there's no URL param for date (`?date=` is silently ignored — it's
client-side state) and no separate results/scores page (`/results` 404s).

`matchDiscovery.ts`'s `discoverMatchesForCompetition` drives this with a live
`Page` (`fetch.ts`'s `newRenderedPage`, not `fetchRenderedHtml`):

1. Open the fixtures page, click the header to open its month calendar.
2. Read which day cells are marked as having matches (`aria-label` doesn't
   say "no matches"), paging back a month at a time if the lookback window
   reaches past the calendar's current month — the "Previous month" button
   is disabled at a real boundary (verified: season start), which doubles as
   a natural stop condition.
3. Click each matchday cell in the window in turn (clicking closes the
   calendar, so it's reopened before each click) and read that day's fixture
   tiles: each links to the match centre with `matchId` + `competitionId` +
   `seasonId` already in its query string, so the opaque id pair is
   discovered fresh every run instead of hand-curated (see the competition
   id map section above) — and both are now persisted onto the fixtures row
   alongside `theanalyst_match_id`, since they're no longer available from a
   static per-competition constant at scrape time.

Verified end-to-end 2026-08-24: discovered 9 real Premier League matches
over a 5-day window, correctly team-matched 3 of them against fabricated
fixtures, and successfully scraped full match-centre stats for one.

## Verification checklist — before trusting the crons

Both new workflows ship with `workflow_dispatch` so every step can be run
manually first. Do not rely on their schedules until all of this passes:

1. **robots.txt + ToS**: check `https://theanalyst.com/robots.txt` — confirm
   `/articles` and `/opta-football-match-centre` aren't disallowed; honor any
   `Crawl-delay` (raise `CRAWL_DELAY_MS` in `theanalyst/fetch.ts`). Scan the
   site's terms for scraping restrictions. If either forbids this, stop and
   revisit the source decision. **Checked 2026-08-24:** no `Crawl-delay`, and
   the general `User-agent: *` block only disallows `/wp/wp-admin/` — our
   declared `Footshorts/1.0 (…)` UA isn't blocked by the letter of it.
   Worth a conscious sign-off, not just a pass/fail, though: the file also
   carries a large named block (`anthropic-ai`, `ClaudeBot`, `GPTBot`,
   `Google-Extended`, `Bytespider`, `CCBot`, …) disallowing every known
   AI-crawler UA from the entire site (`Disallow: /`). That's aimed at
   AI-training crawling specifically, not general automated access, and
   footshorts' identified, low-volume, attribution-only scrape reads as a
   different thing — but flag it explicitly before trusting the schedule,
   don't treat the technical pass as the end of the question. ToS scan not
   yet done.
2. **RSS re-check**: confirm theanalyst really publishes no feed (footer,
   `/feed`, `<link rel="alternate">`). If a feed exists, prefer it for the
   general-news part — it's strictly better than scraping and replaces
   `news.ts`'s listing scrape.
3. **Real-DOM pass**: fetch a listing page, one article, the Power Rankings
   article, and one match-centre page from an environment with site access;
   fix the assumptions in the table above. **Done for all four adapters** —
   general news over plain fetch; Power Rankings via its widget (98 teams
   parsed); match discovery via the fixtures-page calendar (9 real matches
   discovered over a 5-day window); match-centre stats end-to-end against a
   real finished match (xG, shots, possession, cards, 40+ raw stats, all
   correctly split home/away). "Big chances"/"big chances missed" labels
   remain unverified — didn't appear on the one match checked.
4. **Populate `competitions.ts`** with verified current-season ids for every
   tracked competition. **Superseded** — ids are discovered live now, not
   hand-curated; only a `theanalystSlug` per competition needs curating, and
   all six tracked competitions have one, verified live (see the competition
   id map section above).
5. **Manual runs** (non-`:ci`, loads `.env`): `pnpm ingest` (confirm
   theanalyst articles land + summarize), `pnpm power-rankings -- --dry` then
   for real (confirm a sane draft in the admin tab) — parsing verified live,
   but the actual Supabase insert is still untested, `pnpm match-facts -- --dry`
   then for real against a finished fixture (confirm discovery mapped ids and
   `opta_match_facts` rows look right) — parsing/discovery verified live
   end-to-end (see above), but the actual Supabase insert path is untested,
   same as Power Rankings.
6. **Publish cadence**: confirm which weekday the Power Rankings actually
   publishes; fix the placeholder cron. **Done** — it's not weekly, the
   widget updates daily Mon-Fri per its own footer copy; cron is
   `0 9 * * 1-5` in `footshorts-theanalyst-power-rankings.yml`.
