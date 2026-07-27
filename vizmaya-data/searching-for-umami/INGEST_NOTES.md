# searching-for-umami — ingest notes

## Status: SAMPLE DATA

`dishes.json` is currently a **hand-authored 30-row sample** (6 dishes per
cuisine, `tags: ["sample-data"]`) written to exercise the pipeline. Nothing
in it was scraped: ratings, rating counts, images and `scraped_at` are null;
`rank_in_cuisine` is a placeholder ordering; descriptions were written
in-house (they are not TasteAtlas text). `source_url` points at each dish's
real TasteAtlas page. Replace the sample by running the scraper below.

## Why the scrape can't run in CI or the dev sandbox

Two independent blocks, both verified 2026-07-27:

1. The Claude Code cloud sandbox's network policy denies CONNECT to
   `www.tasteatlas.com:443` outright (proxy-level 403).
2. TasteAtlas itself sits behind Cloudflare-style bot protection and returns
   403 to non-browser fetchers and datacenter IPs. GitHub-hosted Actions
   runners are datacenter IPs — a scheduled workflow would be dead on
   arrival (the repo already learned this with Yahoo Finance; see the
   `apify/dc-yahoo-stock-scraper` residential-proxy actor).

So the scrape is a **manual, local step on a residential connection**, and
the committed importer stays deterministic — same split as
`../seriously-curious/`.

**Fallback if local scraping is also blocked:** port the scraper to an Apify
actor with residential proxies, following `apify/dc-yahoo-stock-scraper/`.
Mentioned for completeness; not built.

## Running the real scrape (on your machine)

```
cd apps/vizmaya-fyi
npx playwright install chromium          # once
pnpm searching-for-umami:scrape --cuisine india --limit 5 --headed   # smoke test
pnpm searching-for-umami:scrape          # full run, all 5 cuisines
pnpm searching-for-umami:import          # load dishes.json into food_dishes
```

- `--headed` opens a visible browser — recommended for the first run so you
  can click through any Cloudflare interstitial; after that the stored
  browser profile usually passes headless.
- The scraper is resumable: discovered listing URLs checkpoint to
  `scrape-state.json`, and dishes already in `dishes.json` are skipped
  (`--force` re-fetches them). Kill and re-run freely.
- Politeness is built in (sequential navigation, randomized 2–4 s delays,
  abort after 3 consecutive 403/429s). A full ~500-dish run takes ~35–45 min.
  Don't parallelize it.

## How extraction works (per-field provenance)

**Phase 1 — discover (per cuisine listing page):** the SPA loads list items
via XHR from `www.tasteatlas.com/api/...`; the scraper captures those JSON
responses (name, slug, rating, vote count, list rank come through cleanly)
and falls back to scroll-and-scrape of the rendered cards when the API shape
drifts. Listing URLs live in the `CUISINES` config at the top of the script —
if TasteAtlas moves its "best rated" pages, fix the URL there, nothing else.

**Phase 2 — detail (per dish page):**

| Field | Source on the dish page |
|---|---|
| `slug` | last path segment of the dish URL |
| `name` | page H1 |
| `region` | the "origin" locality/region line when present (often just the country) |
| `category` | the food-type chip (e.g. "Bread", "Street Food") |
| `description` | first 1–2 sentences of the intro, cut at a sentence boundary, hard-capped ≤ 400 chars with ellipsis — **never the full text** (rights) |
| `ingredients` | the "Main ingredients" chips, when present |
| `rating`, `rating_count` | the star widget; falls back to the phase-1 listing values |
| `image_url` | `og:image` meta tag |
| `rank_in_cuisine` | position in the phase-1 listing at scrape time |

## Gotchas

- **Cross-cuisine duplicates** (a dish listed under two cuisines, plausible
  for Indonesia/Thailand border dishes): the first-scraped row wins, the
  second listing appends `listed-in:<cuisine>` to `tags` and logs a warning.
  One row per dish keeps `(epic_slug, slug)` unique and readers simple.
- **Ratings drift** — TasteAtlas ratings are live community values;
  `scraped_at` records when a row was captured. Re-scrape with `--force` to
  refresh.
- The importer warns (not fails) on an unknown `cuisine` slug so the table
  stays food-generic; it hard-fails on in-file duplicate slugs and on
  descriptions > 600 chars.

## Publish checklist

1. Run the full scrape locally; eyeball `dishes.json` (no truncation
   overruns, regions/categories sane, ~100 rows per cuisine).
2. `pnpm searching-for-umami:import` twice (second run proves idempotency).
3. Review/rewrite descriptions for rights compliance before any public
   surface ships.
4. Build the landing page (`apps/vizmaya-fyi/app/searching-for-umami/`),
   then flip the epic to `status='published'` (+ `show_on_home` if wanted)
   in a follow-up migration.
