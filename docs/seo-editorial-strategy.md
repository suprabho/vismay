# SEO strategy: editorials on VizF1, Footshorts and VizNBA

*October 2026. Owner: the VizF1 / Footshorts / VizNBA desks. Code: `packages/html-stories/src/seo.ts` and each app's `app/sitemap.ts`, `app/robots.ts`, `app/editorial/rss.xml/route.ts`.*

## The bet

None of the three sites can win the search results page for "F1 results", "Premier League table" or "Lakers score".
ESPN, BBC, Sky, Formula1.com and the leagues own those queries, with more authority than we will ever have.
What they don't do well is the **second question**: *why* the result happened, shown in data.

- "why did Verstappen pit on lap 18 Monza"
- "Arsenal set piece goals 2025-26"
- "Celtics three point attempts down this season"

These questions get less search volume per query, but they cover a long tail of new topics every weekend.
Each one is best answered by a chart, and they are the queries Google Discover and AI answer engines pull from.

Our editorials (the agent-written HTML stories at `/s/<slug>`) are the product built for exactly that.
So the strategy is:

1. **Make every editorial findable.** It needs a server-rendered page, a canonical URL, a listing in the sitemap and the RSS feed, structured data, and a search-shaped headline.
2. **Publish into demand spikes.** Write within hours of the race, the match or the game, when the questions are being asked.
3. **Build topic authority.** Cluster editorials around the drivers, teams, clubs and players people follow, and link the cluster together.
4. **Turn utility pages into entry points.** Box scores, standings and race pages are server-rendered and linked to the editorials, which grow the long-tail footprint.

## Where we started (audit, Oct 2026)

| | VizF1 (`www.vizf1.com`) | Footshorts (`footshorts.com`) | VizNBA (`nba.vizmaya.fyi`) |
|---|---|---|---|
| sitemap / robots | none | none | none |
| `metadataBase`, title template | no / no | no / no | no / yes |
| Editorial index | `/editorial`, server-rendered, but the grid is client-paged | in-app tab only, rendered client-side and partly signed-in | `/editorial`, server-rendered, but only 9 items before "more" |
| `/s/<slug>` editorials | full HTML, but no canonical / JSON-LD; SEO only as good as the agent's own tags | same | same |
| Engine stories (`/editorial/<slug>`) | iframe of `render.vismay.xyz` (noindex) | same, behind sign-in | none |
| Entity pages | driver / team / race exist, **client-rendered**; `/race/<round>` has no season | league / team **signed-in + client-rendered**; `/player/*` links 404 | `/game/<id>` server-rendered; no team / player pages |
| JSON-LD, RSS | none | none | none |

On all three sites, the only content a crawler could reliably read was the `/s/<slug>` editorials.
Nothing told search engines those editorials existed.

## Phase 1: shipped with this doc

**Every editorial (`/s/<slug>`, all apps)** goes through `injectHtmlStorySeo` (`packages/html-stories/src/seo.ts`) when served.
It adds only what the author's document lacks, and never overrides the author's own tags:

- a `rel=canonical` to the production origin, so preview and apex hosts never compete with the real URL;
- robots `max-image-preview:large` (needed for Discover);
- `og:type=article`, `og:url`, `og:site_name`, `article:published_time` / `modified_time` / `section`, and the Twitter card tags;
- a `NewsArticle` + `BreadcrumbList` JSON-LD graph, with the desk as author and the site as `NewsMediaOrganization` publisher;
- an RSS `<link rel=alternate>`.

The chrome-less `?embed=1` copy (the app WebViews) gets `noindex, follow` plus an `X-Robots-Tag` header, so it never duplicates the real page.

**Per app:**

| | VizF1 | Footshorts | VizNBA |
|---|---|---|---|
| `sitemap.xml` | `/editorial`, `/feed`, `/about-us`, all `/s/*` (with images) | `/editorial`, `/feed`, `/about-us`, storyboards, all `/s/*` | `/`, `/editorial`, standings, calendar, all `/s/*`, last 7 days of finished `/game/*` |
| `robots.txt` | blocks api / auth / login / onboarding / following | the same, plus profile | blocks api; `/for-you` and `/teams` now `noindex` |
| `/editorial/rss.xml` | ✓ | ✓ | ✓ |
| Root metadata | `metadataBase`, title template, OG / Twitter defaults, RSS alternate | the same; description was "Footshorts web" | the same |
| Editorial index | keyword title / description, canonical | **new public, server-rendered `/editorial` archive**: every story as a plain link | keyword title / description, canonical |
| Other | iframe `/editorial/<slug>` set to `noindex, follow` | the same; native storyboards get `generateMetadata` | `/game/<id>` titles become "Celtics 112–104 Lakers: box score and recap (Oct 10, 2026)", with recap description and canonical |

**The agent brief** (`packages/html-stories/src/brief.ts`, "Search (should)") now tells every writing agent what only the author can supply:

- a `<title>` of 60 characters or fewer that leads with the subject;
- a 120–160 character description that carries the finding;
- one `<h1>` that matches the title;
- findings stated in text, not only in charts;
- full names on first mention;
- two or three internal links;
- a subject-led slug.

**Do right after deploy:**

1. Verify all three properties in Google Search Console and Bing Webmaster Tools.
   - Use domain properties (`vizf1.com`, `footshorts.com`, `vizmaya.fyi` covers `nba.`).
   - Submit each `/sitemap.xml`.
2. Apply to Google News (Publisher Center) for each site, with the editorial RSS feed as the source.
3. Spot-check one `/s/<slug>` per app in Google's Rich Results Test (NewsArticle and Breadcrumb should be valid).

## Editorial playbook

### What we write, mapped to search intent

| Format | Intent it answers | Timing | VizF1 | Footshorts | VizNBA |
|---|---|---|---|---|---|
| **Instant explainer** | "why did X happen" | within 3–6 h of the event | strategy call, crash, penalty, upset pole | the result that moved the table, a sacking | the upset, the record night |
| **Recap with replay / data** | "X vs Y recap", "race recap" | same night | `recap` format with the race replay | match story with timeline and xG | box score story |
| **Preview** | "X vs Y prediction", "<GP> preview" | 2–3 days before | circuit, tyre, form | derby, title six-pointer | rivalry, national TV games |
| **Trend piece** | "is X getting worse", "X this season" | weekly | pace trends, teammate battles | pressing, set pieces, transfers' impact | shooting splits, pace, rotation |
| **Evergreen explainer** | "how does X work" | refresh each season | sprint format, tyre rules, the 2026 regulations | how the table / UCL format works | play-in, apron / tax rules |
| **Season hubs (epics)** | "<season> standings", "title race" | updated every round | championship tracker | title / relegation race | Season Tracker (`/editorial/standings`) |

Evergreens and hubs build authority slowly.
Explainers and recaps catch the spikes.
Aim for about 60% timely and 40% evergreen / hub work.

### Cadence (minimum viable)

- **VizF1:** each race weekend, publish one preview (Thursday), one instant explainer (Sunday night) and one recap (Monday). Between rounds, publish one trend piece per week. That is about 3–4 a week in season.
- **Footshorts:** each matchweek, publish two explainers on the biggest stories (Saturday / Sunday nights) and one trend piece midweek. Add a Champions League piece on European weeks. That is about 3–4 a week.
- **VizNBA:** the season is starting, so the volume is daily. Publish one game story on most nights, two trend pieces a week and a weekly Season Tracker refresh. That is about 6–8 a week.

The randomizer desks (Football Desk, NBA Desk) generate the trend-piece angles.
Weight them toward entities with search heat right now, using the same news-heat signals the desks already use.

### Writing rules (now in the brief)

- **Headline = subject + angle.** "Verstappen's Monza tyre gamble, lap by lap", not "The gamble". Keep the clever line for the deck.
- **Description = the answer.** It is the search snippet and the Discover caption. Include the key number.
- **Slug = the subject.** `arsenal-set-pieces-title-race`. Never change a slug after publishing. Repost to the same slug to update the story; the canonical and the `dateModified` handle freshness.
- **Text carries the facts.** Every chart's point is also a sentence. Crawlers and answer engines can't read a canvas.
- **Images.** Every story needs a 1200×630 `og:image` (the brief requires it). Discover only shows stories with large images.
- **Internal links.** Link two or three related editorials, and link the hub. Later, when entity pages are server-rendered, link the driver / club / team pages too (Phase 2).
- **Updates beat duplicates.** A running story, such as a title race or a transfer saga, gets one URL that is updated, not five near-duplicates.

### Topic clusters to build first

Pick the entities with the most search demand and the most data we already hold:

- **VizF1:**
  - the championship protagonists and their teams;
  - the 2026 regulation story (power units, active aero);
  - rookies;
  - each remaining 2026 round (preview → explainer → recap triad).
- **Footshorts:**
  - the Premier League's big six plus the current title / relegation contenders;
  - the Champions League league phase;
  - one cluster per marquee summer signing ("is X working?").
- **VizNBA:**
  - the contenders and the biggest markets (Lakers, Celtics, Knicks, Warriors);
  - MVP race;
  - rookies;
  - the trade-deadline narrative later in the season.

Each cluster has one hub, either an epic or the standings / tracker page.
Each editorial in the cluster links to the hub, and the hub lists the editorials.

## Phase 2: next 4–8 weeks (technical, in priority order)

1. **Server-render the entity pages, and give them metadata.** These are the pages people search for by name, and right now crawlers get an empty shell.
   - VizF1: `/driver/[id]`, `/team/[id]`, `/race/[round]`. Fetch on the server and pass the data into the existing client components. Add `generateMetadata` and per-page OG images. Add `SportsTeam` / `Person` / `SportsEvent` JSON-LD.
   - Footshorts: make `/league/[slug]` and `/team/[slug]` public and server-rendered (sign-in only for follow actions). Add the missing `/player/[slug]` route that is already linked and 404s today.
   - VizNBA: add `/team/[abbr]` pages from `viznba_teams` (roster, schedule, standings line, that team's editorials).
   - Then add them to the sitemaps.
2. **Season-qualified race URLs on VizF1:** `/race/2026/[round]` or `/race/2026/[gp-slug]`, with the current URL redirecting. Today `/race/12` points to a different race every year, so it can never build history.
3. **Tag editorials with entities.** Add an `entities` column (or table) to `html_stories`, filled at publish time from the race / match / game context or by the classifier the workers already run. That enables:
   - "More on <entity>" link blocks injected by the server, next to the chrome;
   - `about` / `mentions` in the JSON-LD;
   - entity pages listing their editorials, which is the internal-link backbone of the clusters.
4. **Crawlable chrome links.** The header and footer are injected inside `<template shadowrootmode>`. Google renders declarative shadow DOM, but other crawlers may not. Add a visually hidden plain `<nav>` with the same links, or render the links in light DOM.
5. **Fix redirecting nav targets on VizF1.** `/` and `/schedule` are redirects. Make `/` a real server-rendered landing page (or a 308 to `/feed`), and point the chrome at the final URLs.
6. **Editorial index pagination.** VizNBA's grid and VizF1's magazine page on the client. Add `?page=N` server pagination (or render every card as a link and collapse it with CSS), so the index links to every story without depending on the sitemap.
7. **Default OG images.** Footshorts has no `opengraph-image` at the root. Add a branded 1200×630 card like VizF1's and VizNBA's, plus per-game cards on VizNBA (`/game/[id]/opengraph-image`) showing the final score.
8. **Google News sitemap** (`/news-sitemap.xml`, stories from the last 48 h) once Publisher Center approval is in.
9. **Engine stories (`/editorial/<slug>`).** Decide each story's home:
   - If the story belongs to the vertical, publish it as an HTML story on that site.
   - If it belongs to vizmaya.fyi, leave the iframe noindexed (as now) and link out to the canonical vizmaya URL.

## Phase 3: compounding (quarter)

- **Worker summaries as on-site pages.** Footshorts `articles` and VizNBA `viznba_articles` only link out today. A daily server-rendered "<club> news today" digest per followed entity, built from our own summaries with links to sources, turns the ingestion pipeline into indexable, fresh, entity-targeted pages.
  - Use original summaries only; never republish source text.
- **Authors.** Moving from "desk" bylines to named editors with `/authors/<slug>` pages (vizmaya.fyi already has the registry) strengthens E-E-A-T for YMYL-adjacent topics such as betting-adjacent previews.
- **Answer-engine readiness.** Add a short "Key numbers" list near the top of each story. Answer engines quote extractable facts; the brief can require it.
- **Cross-site linking.** vizmaya.fyi epics that touch sport (for example, the World Cup) should link to the Footshorts / VizF1 / VizNBA hubs, passing authority from the strongest domain.

## Measurement

| KPI | Source | 90-day target |
|---|---|---|
| Indexed editorial URLs / published | Search Console → Pages | ≥ 90% |
| Organic clicks to `/s/*` | Search Console, filtered by page | baseline in week 2, then +20% a month |
| Discover impressions | Search Console → Discover | non-zero on all three sites by week 6 |
| Time from publish to index | Search Console URL inspection, sampled | < 24 h (< 1 h once in Google News) |
| Rich result validity | Search Console → Enhancements | 0 errors |
| Organic share of editorial sessions | Vercel Analytics / Amplitude referrer | 30%+ |

Review monthly:

- Drop formats that don't get impressions.
- Double down on clusters that do.
- Refresh evergreens whose positions slip.

## Ownership checklist per story (for the desk, before publishing)

- [ ] Title: subject first, 60 characters or fewer
- [ ] Description: 120–160 characters, with the key finding
- [ ] Slug: names the subject
- [ ] `og:image`: 1200×630, credited
- [ ] Findings appear in text, not only in charts
- [ ] Two or three internal links, and the hub
- [ ] Published within the window for its format (see the cadence above)
