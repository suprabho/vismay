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

> **⚠️ SAMPLE DATA:** the current `dishes.json` is a hand-authored sample —
> 6 well-known dishes per cuisine (30 rows) with `tags: ["sample-data"]`,
> null ratings/images, and placeholder `rank_in_cuisine` ordering. It exists
> so the migration → import → readers pipeline works end-to-end. Replace it by
> running the real scraper (below) before publishing anything.

## Files

| File | What it is |
|------|-----------|
| `dishes.json` | The importer's input, one row per dish. `{ epic_slug, slug, name, cuisine, country_code, region, category, description, ingredients[], rating, rating_count, rank_in_cuisine, image_url, source_url, tags[], scraped_at }`. Currently the 30-row SAMPLE. |
| `scrape-state.json` | Scraper checkpoint (discovered dish URLs per cuisine, failures). Created by the scraper; safe to delete to force re-discovery. Not imported. |
| `INGEST_NOTES.md` | How to run the scrape, per-field provenance, and the gotchas. |

## Relationship to the live pipeline

- **Migration** `supabase/vizmaya-fyi/migrations/069_searching_for_umami.sql`
  creates `food_dishes` (public-read) and seeds the `searching-for-umami`
  epic row (`draft`, hidden from home — there's no landing page yet).
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
pnpm searching-for-umami:scrape --cuisine india --limit 5 --headed   # smoke test
pnpm searching-for-umami:scrape                                      # full run (~35–45 min)
pnpm searching-for-umami:import
```

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
