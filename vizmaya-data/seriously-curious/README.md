# seriously-curious — source of record

The book **_Seriously Curious: The Facts and Figures That Turn Our World
Upside Down_** (The Economist, ed. Tom Standage), scraped into 109
self-contained fact-articles so its chapters/facts can be attached as
grounded **sources in the story composer**.

Follows the `vizmaya-data/<name>/` layout (see `../coke-studio/` for the
sibling "raw corpus + importer + provider" pattern).

## What this is

The book is a collection of ~500-word explainer articles ("Why there is a
shortage of sand", "How football transfers work", …) grouped into 10
thematic sections. Each article is a self-contained, quotable unit of fact —
exactly the granularity the composer wants to ground a story on. So the unit
of storage is **one row per article**, tied to the `seriously-curious`
**epic**.

## Files

| File | What it is |
|------|-----------|
| `Seriously Curious ... .pdf` | The source PDF (274pp), at the `vizmaya-data/` root. |
| `articles.json` | 109 rows, one per article — the importer's input. `{ epic_slug, book_name, slug, section, section_index, article_index, title, page_start, page_end, char_count, entities[], keywords[], facts[], body }`. |
| `sections.json` | The 10 thematic sections + per-section article counts (reference only). |
| `INGEST_NOTES.md` | How the PDF was scraped/tagged, per-field provenance, and the gotchas. |

## Relationship to the live pipeline

- **Migration** `supabase/vizmaya-fyi/migrations/068_seriously_curious.sql`
  creates `book_articles` (public-read) and seeds the `seriously-curious`
  epic row (`draft`, hidden from home — there's no landing page).
- **Importer** `apps/vizmaya-fyi/scripts/seriously-curious/import.ts`
  (`pnpm seriously-curious:import`) reads `articles.json` and upserts into
  `book_articles`, idempotent on `(epic_slug, slug)`.
- **Composer** picks it up through the search-based **`book-facts`** library
  provider (`apps/admin/lib/libraryProviders.ts`) — reachable by both the
  "From library" picker **and** the AI research/enrich agent. Attaching an
  article snapshots its text as a `story_sources` row that grounds every
  downstream compose pass.

## Refreshing / re-scraping

Re-run the extractor in `INGEST_NOTES.md`, then `pnpm seriously-curious:import`.
The upsert only touches rows whose payload changed. Slugs are the natural key,
so keep titles stable.

## Adding another book

The table + provider are book-generic (keyed by `epic_slug` + denormalized
`book_name`). A second book needs only: a new epic-seed migration + an
`articles.json` under `vizmaya-data/<book>/` + a one-line importer that points
at it. No new provider code — it joins the same **Book facts** composer tab.

## Rights note

The PDF is a copyrighted Economist book held here as a **private editorial
source corpus** — used to ground/inform composed stories, not to be
republished verbatim. Keep the epic `draft`/hidden; treat extracted bodies as
research input, not public content.
