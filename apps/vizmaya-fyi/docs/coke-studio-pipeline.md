# Coke Studio Pakistan — data pipeline

End-to-end flow for the `coke-studio` epic (vizmaya-fyi). One-time data
plumbing — the landing component (`coke-studio-map`) is a separate piece of
work and isn't covered here.

## Layout

```
vizmaya-data/coke-studio/                    # source-of-truth CSVs (sibling repo)
  songs.csv                                  # 352 rows, hand-curated from Wikipedia
  gazetteer.csv                              # 33 hand-seeded places
  song_languages.csv                         # header-only (enrichment lands here)
  place_mentions.csv                         # written by extract-places.ts
  gazetteer-additions.csv                    # written by extract-places.ts (auto-add)
  gazetteer-suggestions.csv                  # written by extract-places.ts (review queue)
  lyrics-misses.csv                          # written by fetch-lyrics.ts

apps/vizmaya-fyi/
  supabase/migrations/
    046_coke_studio_epic.sql                 # schema + epic row (draft, hidden)
    047_coke_studio_song_lyrics.sql          # lyrics cache (RLS, service-role only)
  scripts/coke-studio/
    import.ts                                # CSV → Supabase upsert (idempotent)
    fetch-lyrics.ts                          # Genius API → coke_studio_song_lyrics
    extract-places.ts                        # Claude Sonnet 4.6 → place_mentions + gazetteer
```

## One-time setup

### Genius API token

Lyrics come from Genius. Free tier is 1000 req/day — enough for the 352-song
corpus with daily-limit headroom.

1. Sign in at https://genius.com → https://genius.com/api-clients → "New
   API Client". App name: anything (e.g. "vizmaya-coke-studio"). App URL:
   anything (e.g. `https://vizmaya.fyi`). Submit.
2. On the resulting client page, click **"Generate Access Token"**.
3. Add to `apps/vizmaya-fyi/.env.local`:

   ```
   GENIUS_CLIENT_ACCESS_TOKEN=...
   ```

### Anthropic API key

The extractor calls Claude Sonnet 4.6 with structured tool-use and prompt
caching. Ballpark cost for the full 352-song run: ~$10-15 with cache hits.

Add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Supabase (already required by other vizmaya-fyi scripts)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## Full-corpus run

> All commands assume cwd = vizmaya repo root so `vizmaya-data/coke-studio/*.csv`
> resolves correctly. See *Running from `apps/vizmaya-fyi`* below.

```bash
# 0. Apply migrations 046 + 047
supabase db push                  # or paste into SQL editor

# 1. Seed songs + hand-seeded gazetteer (one-time, idempotent)
npx tsx apps/vizmaya-fyi/scripts/coke-studio/import.ts

# 2. Fetch lyrics from Genius (~6 min, 1 req/sec throttle)
npx tsx apps/vizmaya-fyi/scripts/coke-studio/fetch-lyrics.ts

# 3. Extract place mentions with Claude (~10-15 min, 352 LLM calls)
npx tsx apps/vizmaya-fyi/scripts/coke-studio/extract-places.ts

# 4. Re-import to push place_mentions + auto-added gazetteer rows
npx tsx apps/vizmaya-fyi/scripts/coke-studio/import.ts
```

Each step is idempotent — safe to re-run any of them.

### Useful flags

- `--season N`        — restrict to one season (good for pilot runs)
- `--limit N`         — cap how many songs are processed in one invocation
- `--dry-run`         — print what would happen, make no external calls
- `--force`           — refetch / re-extract even for songs already cached

```bash
# Pilot with one season
pnpm coke-studio:fetch-lyrics -- --season 1
pnpm coke-studio:extract-places -- --season 1

# Re-extract just the bottom-confidence songs after prompt tweaks
pnpm coke-studio:extract-places -- --force --season 11
```

## Gazetteer policy (hybrid)

When the extractor finds a place not in the current 33-row gazetteer, it
proposes a new row. The policy splits proposals into two buckets:

| Proposal                                                       | Where it lands                  |
|---------------------------------------------------------------|---------------------------------|
| `place_type` in `city`/`country`/`province`, confidence ≥ med | `gazetteer-additions.csv` (auto-add) |
| Everything else (shrines, rivers, historical, low confidence) | `gazetteer-suggestions.csv` (queue)  |

Mentions referencing a queued place are dropped from `place_mentions.csv` —
the FK on `coke_studio_place_mentions.place_canonical` would reject them
anyway. They're recoverable: triage `gazetteer-suggestions.csv`, promote
the good ones into `gazetteer.csv` by hand, then re-run
`extract-places.ts --force` for the affected songs.

## Lyrics misses

Songs the Genius search can't find go to `lyrics-misses.csv` with a reason.
Common cases:

- Punjabi/Sindhi-only titles in native script with no Roman alias
- Songs Genius transcribed under a non-Coke Studio cover instead
- Network blips (retry by running again — successful rows aren't re-misses)

Workflow: open `lyrics-misses.csv`, eyeball, decide whether to source
manually or skip. Direct Genius URL works too — drop the song into the
`coke_studio_song_lyrics` table with `source='manual'`.

## Cost notes (Sonnet 4.6, May 2026 pricing)

- Per-song call: ~5k input tokens lyrics + system + tool, ~1.5k output (JSON tool result)
- Cached: system prompt + tool schema + gazetteer block (~4k tokens) — cached after the first call
- ≈ $0.03/song uncached, ≈ $0.008/song cached
- 352 songs total: ≈ **$10-15** end-to-end if rerun from cold

## Running from `apps/vizmaya-fyi/` directly

The pnpm scripts use `process.cwd()` to find `vizmaya-data/` (matching the
existing `fifa-wc26:import` pattern). `pnpm coke-studio:import` from inside
`apps/vizmaya-fyi/` will fail to find the CSVs because `vizmaya-data` is at
the repo root, not under the package. Two options:

```bash
# (a) Run from repo root with explicit script path
cd vismay
npx tsx apps/vizmaya-fyi/scripts/coke-studio/import.ts

# (b) Symlink the data dir into apps/vizmaya-fyi (gitignored)
cd apps/vizmaya-fyi
ln -s ../../vizmaya-data vizmaya-data
pnpm coke-studio:import
```

If this footgun keeps biting, the cleaner fix is to anchor the data path on
the script file location instead of `process.cwd()`. Tracked as a follow-up.

## What's not in this pipeline (yet)

- **YouTube enrichment** — `youtube_url` and `duration_seconds` stay empty
  after this pipeline. Separate script needed (YouTube Data API search by
  `(title, season)`).
- **`coke_studio_song_languages`** — table is header-only on disk; intended
  for a future enrichment from Zahra Sabri's compilation + fasttext on
  lyric snippets.
- **Lyricists / composers backfill** — empty in the source CSV; same
  Wikipedia page has them and they can be parsed in a follow-up pass.
- **`coke-studio-map` landing component** — not built. While the epic row
  stays `status='draft'` + `show_on_home=false`, the data layer is invisible
  to readers. Flip both flags once the landing exists.
