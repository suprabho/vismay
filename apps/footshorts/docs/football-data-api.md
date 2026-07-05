# football-data.org — API reference & footshorts integration

How footshorts consumes [football-data.org](https://www.football-data.org/) v4 for stats,
fixtures, standings, and the canonical entity set. Pairs with `plan.md` (the "Stats API"
decision row and Phases 3/5).

## API surface

- **Base URL:** `https://api.football-data.org/v4`
- **Auth:** `X-Auth-Token: <FOOTBALL_DATA_TOKEN>` header (env var, set in `worker/.env`).
- **Tier:** free — **10 req/min**, **personal/educational only**, 13 competitions, no
  player/squad or per-match-stats endpoints. See [Constraints](#constraints--what-the-free-tier-doesnt-give-us).

All three worker scripts (`seed.ts`, `fixtures.ts`, `scores.ts`) import one shared wrapper
from `worker/src/footballData.ts`, which retries on a `429` (see below):

```ts
import { fdFetch, sleep, FD_TOKEN, filterCompetitions } from './footballData';
```

### Rate-limit response headers

Docs: <https://docs.football-data.org/general/v4/lookup_tables.html>

| Header | Meaning |
|---|---|
| `X-RequestsAvailable` | requests left before you're blocked |
| `X-RequestCounter-Reset` | seconds until the request counter resets |
| `X-API-Version` | API version in use (`v4`) |
| `X-Authenticated-Client` | detected client, or `anonymous` |

Scripts pace blindly with a fixed `sleep(6500)` (6.5 s) between calls. The shared `fdFetch`
also reads `X-RequestCounter-Reset` on a `429` and waits that many seconds (+1 s buffer,
capped at 90 s) before retrying, up to 3 times — so a shared-token rate-limit hit no longer
fails the whole competition. We don't yet read `X-RequestsAvailable` for adaptive pacing.
See [Known gaps](#known-gaps).

### Scoping a run to specific competitions

`scores.ts` and `fixtures.ts` accept an optional `--competitions=` flag (or `COMPETITIONS`
env var) to limit a run to a subset — handy for re-running just one competition after a
rate-limit hit, or refreshing the World Cup after a knockout draw without touching the rest.

- **scores** keys by football-data **code**: `pnpm scores -- --competitions=WC,PL`
- **fixtures** keys by entity **slug**: `pnpm fixtures -- --competitions=world-cup,premier-league`

Matching is case-insensitive; unmatched tokens are warned about and ignored. Both workflows
expose the same filter as a `workflow_dispatch` input (blank on the schedule → all). The two
workflows also share one `concurrency` group (`footshorts-football-data`) so a manual
dispatch of one can't overlap a scheduled run of the other on the shared token.

### Enum lookup tables

Values the API returns; the columns below show how footshorts normalizes them.

**Match status** → `normalizeStatus()` in `fixtures.ts`:

| football-data | footshorts |
|---|---|
| `SCHEDULED`, `TIMED` | `scheduled` |
| `IN_PLAY`, `PAUSED` | `live` |
| `FINISHED` | `finished` |
| `POSTPONED` | `postponed` |
| `SUSPENDED`, `CANCELLED` | `cancelled` |
| `EXTRA_TIME`, `PENALTY_SHOOTOUT`, `AWARDED` | ⚠️ unmapped → falls through to `s.toLowerCase()` |

**Stage** (stored verbatim in `fixtures.stage`): `FINAL | THIRD_PLACE | SEMI_FINALS |
QUARTER_FINALS | LAST_16 | LAST_32 | LAST_64 | ROUND_4…ROUND_1 | GROUP_STAGE |
PRELIMINARY_ROUND | QUALIFICATION* | PLAYOFF* | PLAYOFFS | REGULAR_SEASON | CLAUSURA |
APERTURA | CHAMPIONSHIP | RELEGATION*`

**Group:** `GROUP_A … GROUP_L`

**Reference enums we don't consume yet:** competition type (`LEAGUE | LEAGUE_CUP | CUP |
PLAYOFFS`), team type (`MEN_CLUB | MEN_NATIONAL | WOMEN_CLUB | WOMEN_NATIONAL`), score
duration (`REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT`), card type (`YELLOW | YELLOW_RED |
RED`), goal type (`REGULAR | OWN | PENALTY`), referee role.

## How footshorts uses it

Three one-shot scripts in `apps/footshorts/worker/src/`, all writing to Supabase.

### `seed.ts` — canonical entities (run once)

1. `GET /competitions` → filter to the 13 free-tier comps.
2. Per comp, `GET /competitions/{code}/teams` (6.5 s apart).
3. Upserts `entities` (leagues + teams, on `type,slug`) and the `team_competitions` junction.

Seeded competition codes:

| Code | Competition | | Code | Competition |
|---|---|---|---|---|
| `PL`  | Premier League   | | `EL`  | Europa League |
| `PD`  | La Liga          | | `WC`  | World Cup |
| `BL1` | Bundesliga       | | `EC`  | Euros |
| `SA`  | Serie A          | | `DED` | Eredivisie |
| `FL1` | Ligue 1          | | `PPL` | Primeira Liga |
| `CL`  | Champions League | | `BSA` | Brazil Série A |
|       |                  | | `ELC` | Championship |

- `commonName()` strips club-type tokens (`FC`, `SSC`, `1. FC` …) and trailing founding
  years so FD's official names slugify to what news articles use: `"Juventus FC"` →
  `juventus`, `"Bologna FC 1909"` → `bologna`. Display `name` keeps the original.
  Glued acronyms need their own strip entries (`\b` won't split them): `ACF`, `CFC`,
  `BC` cover `"ACF Fiorentina"` → `fiorentina`, `"Genoa CFC"` → `genoa`,
  `"Atalanta BC"` → `atalanta`. If a team's chip never appears despite coverage, check
  the worker logs for `[entity-miss]` — the slug likely kept a token like this.
- `CL/EL/WC/EC` are non-domestic → membership recorded, but they don't set a team's
  `league_slug` (that always points at the domestic league).
- Players are **not** seeded — squads are paid-tier (`seed-squads.ts` exists for the
  later squad ingest path).

### `fixtures.ts` — fixtures + standings

Per seeded league (from `entities` where `football_data_id` is set):

- `GET /competitions/{id}/matches` (full current season) → upsert `fixtures` on
  `football_data_id`. Unmapped opponents stored as free-text `*_team_name` (default `TBD`).
- `GET /competitions/{id}/standings` → take the `TOTAL` table only, upsert `standings` on
  `(competition_slug, season, team_id)`. Cups with no `TOTAL` table are skipped gracefully.
- `normalizeSeason()`: multi-year league (Aug→May) → `"25-26"`; single-year cup → `"2025"`.
- **`fixture_stats` is left empty** — shots/possession/cards/xG are paid-tier.

### `scores.ts` — finished-score refresh (every 3h)

Update-only, never inserts. Per comp code:

- `GET /competitions/{code}/matches?status=FINISHED&dateFrom&dateTo` over a **2-day** lookback.
- Resolve each FD match to a local fixture by `(home_team_id, away_team_id, kickoff_at ±6h)`
  — skips if 0 or >1 match. Writes `home_score`, `away_score`, `status='finished'`.
- Scheduled by `.github/workflows/footshorts-scores.yml`: scores-only top-ups every
  3 hours, with the 00:00/12:00 UTC slots also running events + recaps.

### `entityResolver.ts` — names → canonical IDs

Bridges Gemini's extracted names (`"Arsenal"`, `"Man Utd"`) to FD-backed entity IDs:
exact slug → alias table (`man-utd`, `barca`, `psg`, `epl`→`premier-league`, …) → log an
`[entity-miss]`. **Never auto-creates** entities, to keep the canonical set clean and block
hallucinations from polluting the follow graph.

## Constraints — what the free tier doesn't give us

- **Commercial use is banned** on free tier (personal/educational only). `plan.md` lists
  this as a launch risk → upgrade to Standard (€29–49/mo) or migrate to **api-football**
  before launch.
- **No live data:** live scores deferred to Phase 5 (poll ~60 s while a followed fixture is
  live, back off otherwise).
- **No per-match stats** (shots, possession, cards, xG) and **no player/squad endpoints**.
- **Coverage ceiling:** 13 competitions — top-5 European leagues + CL/EL + a few others.
  No lower divisions.

## Known gaps

- The shared `fdFetch` retries on `429` (reads `X-RequestCounter-Reset`) but still ignores
  `X-RequestsAvailable`; reading it would allow adaptive pacing instead of a fixed 6.5 s.
- `normalizeStatus()` doesn't map `EXTRA_TIME` / `PENALTY_SHOOTOUT` / `AWARDED`; they fall
  through to `s.toLowerCase()`, so a knockout match in extra time lands as
  `status='extra_time'` rather than `live`. Tighten before knockout rounds.

## Migration note

`plan.md` locks the path **football-data.org (MVP) → api-football (growth)**. api-football
adds broader coverage, squads/players, per-match stats, and a live push stream — the
endpoints the free tier withholds.
