# VizNBA

NBA vertical of Vismay: a mobile-first `web` app and the `worker` news
pipeline. Tables live in the project-wide Supabase under the `viznba_` prefix
([`supabase/viznba/migrations`](../../supabase/viznba/migrations)).

## `web/` — `@viznba/web`

Next.js 16 + Tailwind v4 + Phosphor icons, dark theme, Saira / Martian Mono.
All sports data comes from ESPN's free public site API (no key); see
`lib/espn.ts`, which normalises every payload at the boundary.

| Route | What it shows | ESPN source |
| --- | --- | --- |
| `/` Feed | Full-screen swipe cards: game recaps with a score-margin hero and the decisive run (`lib/margin.ts`), plus league headlines | `scoreboard`, `summary`, `news` |
| `/for-you` | Followed teams: live card with margin sparkline, preview (win probability, last five, back-to-back, last meeting), finals with linescore and stat bars | `scoreboard` × 11 days, `summary` |
| `/calendar?view=day\|week\|month&date=` | Day list with NOW rule and "My teams" switch; week block chart and team summaries; month grid with per-team dots | `scoreboard` per day |
| `/editorial`, `/editorial/standings` | Epics (Season Tracker, conference races), recaps, boards and ESPN features with filter chips | `standings`, `summary`, `news` |
| `/game/[id]` | Score, margin chart, linescore, team stats, leaders, recap, plays; auto-refreshes while live | `summary` |
| `/teams` | Follow picker | — |
| `/api/remind/[id]` | "Remind me": an `.ics` event with a 30-minute alarm | `summary` |
| `/s/[slug]` | An agent-authored HTML story, served as posted in the VizNBA chrome (`@vismay/html-stories`) | — |
| `/api/html-stories` (+ `/brief`, `/assets`), `/formats/*` | The token-gated publish, brief (with `?games=` box scores) and assets APIs, and the story format runtimes | `summary` (brief) |
| `/api/randomizer/spins`, `/spins/[id]`, `/news` | The NBA Desk's token-gated spin routes and news snapshot (`@vismay/randomizer`) | `scoreboard` |

ESPN buckets games by US-Eastern day; `gamesByLocalDay` re-buckets them into
the viewer's zone. Followed teams and the browser's time zone live in cookies
(`viznba_teams`, `viznba_tz`), so pages render server-side without an
account. If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
set, the Feed also pulls the worker's summarised, team-tagged articles.

HTML stories and the NBA Desk randomizer are managed in admin under `/viznba`
(Pipeline, HTML stories, Randomizer; see
[apps/admin/CLAUDE.md](../admin/CLAUDE.md)). The routes above need
`SUPABASE_SERVICE_ROLE_KEY` (the `html_stories` and `randomizer_spins`
tables are service-role only) and the deployment's own `HTML_STORIES_TOKEN`
for publishing, briefs with game context and spins. Apply
`supabase/vizmaya-fyi/migrations/092_viznba.sql` (the `apps` row and the
randomizer check) before the first spin.

```sh
pnpm --filter @viznba/web dev     # http://localhost:3000
pnpm --filter @viznba/web test    # margin / time-zone unit tests
```

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
