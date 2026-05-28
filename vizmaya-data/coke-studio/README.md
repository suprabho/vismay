# Coke Studio Pakistan — corpus data

CSVs that feed `apps/vizmaya-fyi/scripts/coke-studio/import.ts` (Supabase
migration `046_coke_studio_epic.sql`).

| File | Phase | Rows | Status |
|---|---|---|---|
| `songs.csv` | 1 | 352 | Seeded from Wikipedia "List of Coke Studio Pakistan episodes" |
| `gazetteer.csv` | 3 prerequisite | 33 | Hand-seeded with the Pakistan + qawwali-tradition starter set |
| `song_languages.csv` | 2 | 0 | Header only — fill from Zahra Sabri's compilation + fasttext pass |
| `place_mentions.csv` | 3 | 0 | Header only — fill from gazetteer-match + LLM-assisted extraction |

See `INGEST_NOTES.md` for the per-season breakdown and the gotchas the
Wikipedia-scrape phase surfaced (notably: S13 = "Coke Studio 2020", not the
Explorer mini-series; lyricists/composers left blank for a follow-up pass).

## Conventions

- Arrays inside cells use `|` as the separator (artists, lyricists,
  composers, verse_locations, aliases). Spreadsheet-friendly.
- Dates are `YYYY-MM-DD`.
- `confidence` is `high` | `medium` | `low` (default `medium`).
- All upserts are idempotent on the natural keys:
  - songs → `song_id`
  - song_languages → `(song_id, language)`
  - place_mentions → `mention_id`
  - gazetteer → `place_canonical`

## Running the importer

```bash
cd apps/vizmaya-fyi
pnpm coke-studio:import
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` or the environment.
