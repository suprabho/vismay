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

supabase/vizmaya-fyi/migrations/             # repo root (moved out of apps/)
  046_coke_studio_epic.sql                   # schema + epic row (draft, hidden)
  047_coke_studio_song_lyrics.sql            # lyrics cache (RLS, service-role only)
apps/vizmaya-fyi/
  scripts/coke-studio/
    import.ts                                # CSV → Supabase upsert (idempotent)
    fetch-lyrics.ts                          # multi-source orchestrator
    extract-places.ts                        # Claude Sonnet 4.6 → place_mentions + gazetteer
    sources/
      types.ts                               # LyricsSource + LyricsCandidate
      utils.ts                               # script detect, fuzzy match, scoring
      youtube.ts                             # Coke Studio YouTube channel (no auth)
      lyricstranslate.ts                     # lyricstranslate.com (no auth)
      genius.ts                              # Genius API (opt-in, needs token)
```

## Lyrics sources

The fetcher fans out to every enabled source in parallel for each song and
picks the best by a quality score (`length + 1000 if native script + 1000
if translation present`). Sources without their env var skip themselves.

| Source | Auth | Typical coverage | Notes |
|---|---|---|---|
| **YouTube** (Coke Studio channel descriptions) | none | ~70% overall, ~95% for S11+ | Authoritative — official bilingual lyrics. Also backfills `youtube_url` + `duration_seconds` on `coke_studio_songs`. |
| **LyricsTranslate** | none | ~60% overall, strongest for famous songs | Crowdsourced; usually has parallel English translation. |
| **Genius** | `GENIUS_CLIENT_ACCESS_TOKEN` | ~30-40% (mainly newer English-leaning tracks) | Was the original source; kept as a fallback. Genius API search + page-HTML lyrics scrape. |

Adding a source: write one file in `scripts/coke-studio/sources/` that exports
a `LyricsSource`, register it in `fetch-lyrics.ts`'s `main()`. Wayback Machine
of cokestudio.com.pk would be a natural fourth.

## One-time setup

### Genius API token (optional)

Skippable — YouTube + LyricsTranslate cover most of the corpus on their own.
If you want Genius as an additional source:

1. Sign in at https://genius.com → https://genius.com/api-clients → "New
   API Client". App name: anything (e.g. "vizmaya-coke-studio"). App URL +
   Redirect URI: anything (e.g. `https://vizmaya.fyi`). Submit.
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

All paths in these scripts are anchored to the script file location, so cwd
doesn't matter — invoke them from anywhere.

```bash
# 0. Apply migrations 046 + 047
supabase db push                  # or paste into SQL editor

# 1. Seed songs + hand-seeded gazetteer (one-time, idempotent)
pnpm --filter vizmaya-fyi coke-studio:import

# 2. Fetch lyrics from every enabled source in parallel (~7-10 min for 352 songs)
pnpm --filter vizmaya-fyi coke-studio:fetch-lyrics

# 3. Extract place mentions with Claude (~10-15 min, 352 LLM calls)
pnpm --filter vizmaya-fyi coke-studio:extract-places

# 4. Re-import to push place_mentions + auto-added gazetteer rows
pnpm --filter vizmaya-fyi coke-studio:import
```

Each step is idempotent — safe to re-run any of them. The npx form
(`npx tsx apps/vizmaya-fyi/scripts/coke-studio/<script>.ts`) works too;
both invocations are cwd-independent.

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

## What's not in this pipeline (yet)

- **`coke_studio_song_languages`** — table is header-only on disk; intended
  for a future enrichment from Zahra Sabri's compilation + fasttext on
  lyric snippets.
- **Lyricists / composers backfill** — empty in the source CSV; same
  Wikipedia page has them and they can be parsed in a follow-up pass.
- **`coke-studio-map` landing component** — not built. While the epic row
  stays `status='draft'` + `show_on_home=false`, the data layer is invisible
  to readers. Flip both flags once the landing exists.

`youtube_url` + `duration_seconds` no longer need a separate enrichment
script — the YouTube source backfills them onto `coke_studio_songs` whenever
its result wins for a song.
