# searching-for-umami — source of record

The food corpus behind the **Searching for Umami** epic: the top-rated dishes
TasteAtlas tags under five Asian cuisines — **India, China, Thailand,
Indonesia, Japan** — one row per dish with its region of origin, food
category, key ingredients, community rating and source link.

Follows the `vizmaya-data/<name>/` layout (see `../seriously-curious/` for the
sibling "raw corpus + importer" pattern).

## What this is

TasteAtlas (https://www.tasteatlas.com) catalogues dishes per country with
crowd ratings, regions and ingredient lists. The unit of storage is **one row
per dish**, tied to the `searching-for-umami` **epic** — the granularity a
food landing page ranks/maps on and a composed story can be grounded on.

> **✅ REAL DATA (scraped 2026-07-27):** `dishes.json` holds the live-scraped
> corpus — the **top 10 best-rated dishes per cuisine (50 rows)** with real
> community ratings, regions, categories, truncated description blurbs and CDN
> image URLs. That is the complete set TasteAtlas serves anonymous web
> visitors: the "Top 100" listing pages render exactly 10 dish cards (no
> lazy-load/pagination beyond that), and per-dish pages are hard-blocked for
> automation — so `ingredients` is `[]` and `rating_count` is null throughout
> (neither appears on listing cards). See INGEST_NOTES.md for the full story.

## Files

| File | What it is |
|------|-----------|
| `dishes.json` | The importer's input, one row per dish. `{ epic_slug, slug, name, cuisine, country_code, region, category, description, ingredients[], rating, rating_count, rank_in_cuisine, image_url, source_url, tags[], scraped_at }`. 50 scraped rows (top 10 per cuisine). |
| `scrape-state.json` | Scraper checkpoint (discovered dish URLs per cuisine, failures). Created by the scraper; safe to delete to force re-discovery. Not imported. |
| `INGEST_NOTES.md` | How to run the scrape, per-field provenance, and the gotchas. |

## Relationship to the live pipeline

- **Migration** `supabase/vizmaya-fyi/migrations/069_searching_for_umami.sql`
  registers the `umami` consumer app, creates `food_dishes` (public-read) and
  seeds the `searching-for-umami` epic row (`app_slug='umami'`, `draft`,
  hidden from home).
- **Consumer app** `apps/umami/web` (Searching for Umami, default domain
  umami.fyi) renders the cuisine/dish explorer at `/` via `listFoodDishes()`
  in `packages/content-source/src/epics.ts`.
- **Scraper** `apps/vizmaya-fyi/scripts/searching-for-umami/scrape-tasteatlas.ts`
  (`pnpm searching-for-umami:scrape`) — **local-run only**: TasteAtlas sits
  behind Cloudflare and blocks datacenter IPs (the dev sandbox and GitHub
  Actions runners both are one), so the scrape runs on a residential
  connection. Resumable; writes only this folder's JSON, never the DB.
- **Importer** `apps/vizmaya-fyi/scripts/searching-for-umami/import.ts`
  (`pnpm searching-for-umami:import`) reads `dishes.json` and upserts into
  `food_dishes`, idempotent on `(epic_slug, slug)`. `--dry-run` validates
  without touching Supabase.

## Refreshing / re-scraping

```
pnpm searching-for-umami:scrape --cuisine india --headed   # smoke test
pnpm searching-for-umami:scrape --headed                   # full run (~4 min)
pnpm searching-for-umami:import
```

`--headed` is effectively required (headless fingerprints get blocked), and
the machine needs Google Chrome installed — the scraper launches the system
Chrome, wiping `.browser-profile` for a fresh identity per listing.

The scraper skips dishes already present in `dishes.json` (delete rows or use
`--force` to refresh them); the importer's upsert only touches rows whose
payload changed. Dish slugs are the natural key — they come from TasteAtlas
URLs and are stable.

## Adding another cuisine

`food_dishes` is food-generic (keyed by `epic_slug`, cuisine denormalized as
a text slug). Another cuisine needs only a new entry in the scraper's
`CUISINES` config; another *food epic* needs only a new epic-seed migration
plus its own corpus folder. No schema changes.

## Rights note

TasteAtlas's editorial texts and photography are copyrighted. This corpus
stores **facts** (dish name, region, category, ingredients, rating figures)
plus a **truncated ≤ ~400-char summary** — never the full editorial text —
and every row carries `source_url` for attribution. The importer hard-fails
on descriptions over 600 chars to enforce this. Keep the epic `draft` until
descriptions have been reviewed (ideally rewritten in-house) for publication.
