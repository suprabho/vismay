# VizNBA

NBA vertical of Vismay. Today it is the news pipeline only — no `web` app
yet. Tables live in the project-wide Supabase under the `viznba_` prefix
([`supabase/viznba/migrations`](../../supabase/viznba/migrations)).

## `worker/` — `@viznba/worker`

```
ESPN site API ──seed:roster──▶ viznba_teams / viznba_players / viznba_coaches
                                          │ (canonical set)
RSS feeds ──ingest:news──▶ viznba_articles ──▶ Jev: topic (NBA or hidden)
                                          ──▶ Claude Haiku: summary + names
                                          ──▶ resolver: names → canonical ids
                                          ──▶ Jev gate: subject or passing mention?
                                          ──▶ viznba_article_entities (+ confidence)
```

| File | What it does |
| --- | --- |
| `src/sources.ts` | RSS feed registry (ESPN, CBS, Yahoo, NBC, FOX, Guardian, Hoops Rumors, RealGM, SB Nation) |
| `src/seedRoster.ts` | Upserts 30 teams, every current roster player and head coach from ESPN; flags players no longer on a roster `active=false` |
| `src/aliases.ts` | Hand-curated team / player nicknames ("Sixers", "SGA", "Wemby") and the never-resolve list ("LA") |
| `src/summarise.ts` | Jev picks one of 12 topic categories; NBA ones (`game`, `transaction`, `injury`, `draft`, `front_office`, `league`, `analysis`, `off_court`) go to Claude for a 55-60 word summary + team / player / coach names |
| `src/entityResolver.ts` | Exact name / alias → unique last name → first initial + last name; anything ambiguous is dropped and logged as `[entity-miss]` |
| `src/jevEntityGate.ts` | Per-candidate "is this a subject of the article?" — fails open |
| `src/ingestNews.ts` | The pipeline; idempotent on `url_hash`, retries `pending`/`failed` rows, exits non-zero on an unhealthy run |
| `src/eval/` | `@vismay/eval-entities` adapter — LLM-judged precision / recall of the tags |

### Running

```sh
cp apps/viznba/worker/.env.example apps/viznba/worker/.env   # fill it in
# apply supabase/viznba/migrations/001_init.sql (dashboard SQL editor)
pnpm --filter @viznba/worker seed:roster    # once, before the first ingest
pnpm --filter @viznba/worker ingest:news
pnpm --filter @viznba/worker eval           # tag quality report
pnpm --filter @viznba/worker test           # resolver + gate unit tests
```

CI: [`viznba-seed-roster.yml`](../../.github/workflows/viznba-seed-roster.yml)
(weekly, Mondays) and [`viznba-ingest-news.yml`](../../.github/workflows/viznba-ingest-news.yml)
(every 4 hours). Re-run the roster seed by hand after the trade deadline,
draft night and the start of free agency.

### Tagging misses

The ingest log prints `[entity-miss] player: "…"` for every extracted name
that didn't resolve. A real miss is usually a nickname — add it to
`src/aliases.ts` and re-run `seed:roster`. Retired or unsigned players are
not in the canonical set by design.
