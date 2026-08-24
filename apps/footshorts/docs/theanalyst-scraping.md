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
| Opta Power Rankings article | `worker/src/theanalyst/powerRankings.ts` | `theanalystPowerRankings.ts` | `power_rankings`, as a **draft** for admin review — never auto-published | weekly, `footshorts-theanalyst-power-rankings.yml` (+ admin "Run scrape" button) |
| Match centre stats | `worker/src/theanalyst/matchCentre.ts` + `matchDiscovery.ts` | `theanalystMatchFacts.ts` | `opta_match_facts` (per-side upsert) + theanalyst ids persisted on `fixtures` | 3-hourly (30 min after the scores refresh), `footshorts-theanalyst-match-facts.yml` |

### URL shapes

- Articles: `https://theanalyst.com/articles/<slug>`
- Power Rankings (the recurring article): `https://theanalyst.com/articles/who-are-the-best-football-team-in-the-world-opta-power-rankings`
- Match centre: `https://theanalyst.com/opta-football-match-centre?competitionId=<id>&seasonId=<id>&matchId=<id>` — all three ids are **opaque strings** (e.g. `73ob0ein8likagvlqcyqf4zys`), stored as `text` on `fixtures` (`theanalyst_*` columns, migration `20260824000000`).

## Politeness rules (worker/src/theanalyst/fetch.ts)

- Identified User-Agent with a contact address: `Footshorts/1.0 (theanalyst ingest; hello@promad.design)`.
- Fixed ≥1s delay between consecutive requests within a run; no parallel fetches.
- Per-run caps: max 10 new article pages per ingest run (`MAX_SCRAPED_ARTICLES_PER_RUN`), max 20 match-centre pages per match-facts run (`MAX_SCRAPES_PER_RUN`). Hourly/3-hourly crons drain backlogs instead of bursting.
- Non-HTML or non-2xx responses are hard failures, never parsed.
- Dedupe before fetch: known `url_hash`es and already-scraped fixtures are skipped without a request; Power Rankings runs no-op on an unchanged content hash.

## Competition id map (worker/src/theanalyst/competitions.ts)

theanalyst has no discoverable API for its ids, so the map is manually
curated, keyed by our `competition_slug`. To find ids: open the match centre
in a browser, navigate to a match in the competition, copy `competitionId` /
`seasonId` from the address bar. **Season ids change every season** — refresh
them at season start or discovery silently finds nothing.

## ⚠️ Selector fragility — what needs patching when the DOM shifts

All of this was authored **without network access to theanalyst.com** (the
authoring sandbox blocks the domain), so every page-structure assumption is a
best-effort heuristic, deliberately isolated so fixing it is a contained
patch:

| File | Assumption to verify |
|---|---|
| `theanalyst/news.ts` | listing pages link articles at `/articles/<slug>`; article pages expose `og:title` / `article:published_time` / `og:image` and body text under `<article>`/`<main>` |
| `theanalyst/powerRankings.ts` | the ranked list is a table, an `<ol>`, or "N. Team" text lines (three strategies tried in order) |
| `theanalyst/matchCentre.ts` | stat rows contain a text label (spellings in `STAT_LABELS`) plus two numbers, home first; page is server-rendered |
| `theanalyst/matchDiscovery.ts` | the match centre without a `matchId` lists the competition's matches as links carrying `?matchId=`, with "Home vs Away" link text |
| `theanalyst/competitions.ts` | the Premier League id pair (taken from the feature request's example URL) is current |
| `sources.ts` | `SCRAPE_SOURCES[].listingUrl` points at a real article-listing page |

If the site turns out to be fully JS-rendered (scrapers throw "JS-rendered
page or selector drift?"), plain fetch+cheerio won't work — the fallback is a
headless-browser fetch, or an Apify actor like the yahoo-stock one
(`apify/dc-yahoo-stock-scraper`) if datacenter IPs are also blocked.

## Verification checklist — before trusting the crons

Both new workflows ship with `workflow_dispatch` so every step can be run
manually first. Do not rely on their schedules until all of this passes:

1. **robots.txt + ToS**: check `https://theanalyst.com/robots.txt` — confirm
   `/articles` and `/opta-football-match-centre` aren't disallowed; honor any
   `Crawl-delay` (raise `CRAWL_DELAY_MS` in `theanalyst/fetch.ts`). Scan the
   site's terms for scraping restrictions. If either forbids this, stop and
   revisit the source decision.
2. **RSS re-check**: confirm theanalyst really publishes no feed (footer,
   `/feed`, `<link rel="alternate">`). If a feed exists, prefer it for the
   general-news part — it's strictly better than scraping and replaces
   `news.ts`'s listing scrape.
3. **Real-DOM pass**: fetch a listing page, one article, the Power Rankings
   article, and one match-centre page from an environment with site access;
   fix the assumptions in the table above.
4. **Populate `competitions.ts`** with verified current-season ids for every
   tracked competition.
5. **Manual runs** (non-`:ci`, loads `.env`): `pnpm ingest` (confirm
   theanalyst articles land + summarize), `pnpm power-rankings -- --dry` then
   for real (confirm a sane draft in the admin tab),
   `pnpm match-facts -- --dry` then for real against a finished fixture
   (confirm discovery mapped ids and `opta_match_facts` rows look right).
6. **Publish cadence**: confirm which weekday the Power Rankings actually
   publishes; fix the placeholder cron (`0 9 * * 1`) in
   `footshorts-theanalyst-power-rankings.yml`.
