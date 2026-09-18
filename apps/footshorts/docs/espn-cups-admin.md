# ESPN cup fixtures — private admin import

The **Cup fixtures** tab at `/footshorts/cup-fixtures` fetches and reviews FA Cup,
Carabao Cup, Copa del Rey, DFB-Pokal, Coppa Italia and Coupe de France matches.
Select a season and optionally a cup, then use **Fetch all six cups** or
**Fetch selected cup**. Imports are manual; there is no scheduled job.

## Storage and visibility

Apply `20260917000000_admin_espn_cup_fixtures.sql` to the Footshorts database before
using the tab. It creates `admin_espn_cup_fixtures` with RLS and no consumer
policies. `PUBLIC`, `anon` and `authenticated` have no table privileges. Reads
and imports use the service role behind the existing admin email allowlist.
API responses use `Cache-Control: private, no-store`.

The importer never writes to `fixtures`, `entities`, match facts, or share cards.
There is no publish action and no consumer app integration. The source event ID,
source URL, fetch timestamp and complete event payload are stored for review;
the raw payload is not returned to the admin browser.

This boundary controls visibility, not source permissions. Internal storage does
not change ESPN's terms; this feature does not establish a reuse licence.

## Source behavior

- Uses ESPN's public soccer scoreboards, without an API key. These endpoints are
  undocumented and may change or become unavailable.
- Fetches calendar years `Y` and `Y+1` and filters by **event** `season.year === Y`.
  A spring 2026 final belongs to 2025/26. Cross-year `dates` ranges returned HTTP
  400 in verification; year queries worked.
- Scheduled zero-score placeholders become null. Match scores and shootout
  scores stay separate; source notes retain aggregate/leg information.
- Stores unconfirmed kickoff times explicitly and displays “Time TBC”.
- Upserts by ESPN event ID: reimporting refreshes scores, status and kickoff
  without duplicates. It never deletes matches on an empty or partial response.
- HTTP/schema failures and potentially truncated (1,000-event) responses fail
  that cup before writing. Other selected cups may still import successfully;
  the admin reports each cup's outcome. Empty coverage is not full coverage.
- The Analyst enrichment is a later step and is not triggered here.

## ESPN match view + extraction (timeline, match facts, lineups, commentary)

Every row in the tab opens an **ESPN match view** panel (click the match name
or **View & extract**). espn.com sends `Content-Security-Policy:
frame-ancestors` limited to ESPN/Disney hosts on all match pages (verified
2026-09-18 on `/soccer/match` and `/soccer/commentary`), so the page cannot be
iframed; the panel renders the same content from ESPN's match summary instead,
with an **Open on ESPN ↗** link to the live page.

**Extract match facts & timeline** fetches
`site.web.api.espn.com/apis/site/v2/sports/soccer/<code>/summary?event=<id>`
and stores one row in `admin_espn_cup_match_details` (migration
`20260918000000_admin_espn_cup_match_details.sql`, same private RLS as the
fixtures table; apply it before extracting). The row holds the normalized
`EspnMatchDetail` (`apps/footshorts/shared/src/espnMatch.ts`) plus a slimmed
copy of the summary for audit. Re-extracting upserts. Nothing is written to
`fixtures`, `fixture_events`, `opta_match_facts` or share cards.

What ESPN provides, and what the extraction keeps:

- **Timeline** — every key event (goals incl. own goals and penalties, missed
  or saved penalties, cards, substitutions, period markers). A second list,
  `events`, carries the goal/card/sub/VAR subset in the `fixture_events`
  vocabulary (`Normal Goal` / `Own Goal` / `Penalty` / `Yellow Card` /
  `Red Card` / `Second Yellow card` / `Substitution` / `Missed Penalty`; subs
  keep the player going off in `player_name`, coming on in `assist_name`) so
  the share-card Match timeline layer renders it unchanged. Own goals keep
  ESPN's side, the team credited with the goal.
- **Match facts** — ESPN's team statistics (possession, shots, corners, fouls,
  passes, saves…) when present. In verification (2026-09-18) ESPN sent them
  for Premier League matches but **not** for FA Cup or Copa del Rey ties, so
  cup rows usually have `facts: null`. Card/sub/goal/penalty counts derived
  from the timeline are always present (`derived`).
- **Lineups** — starters, bench, formation, subbed on/off flags. **Commentary**
  — the full text feed. Venue, attendance and referee from `gameInfo`.

Penalty shootouts: the shootout score comes from the scoreboard import
(`home_penalties` / `away_penalties`); ESPN's key events do not list the kicks.

### Using cup matches in Share cards

The Share cards studio lists each imported cup season as its own competition,
labelled `<Cup> · 2025/26 · ESPN` (the `2025/26` season label keeps it apart
from any football-data `fa-cup` season `2025`). Its fixtures come from
`admin_espn_cup_fixtures` via `/api/footshorts/data/fixtures?…&source=espn`
(crests from ESPN's team-logo CDN, no entity ids), and the Match timeline
layer's events come from the extracted detail via
`/api/footshorts/data/events?fixtureId=<espn event id>` (numeric ids route to
the private table; uuids stay on `fixture_events`). The layer's **Extract
events** button runs the same ESPN extraction as the panel. These are
admin-only routes; the consumer apps never read the ESPN tables. A shootout
result is typed into the Match layer's Penalties field, as for any match.

## Worker commands

From `apps/footshorts/worker`, using the existing Supabase URL/service-role key:

```sh
pnpm cups:espn -- --season=2026 --dry-run
pnpm cups:espn -- --season=2026
pnpm cups:espn -- --season=2025 --competitions=fa-cup,efl-cup
```

`--season` is the start year; default is the current July–June campaign. Dry-run
fetches and prints counts without creating a database client or writing rows.
Unknown competition slugs fail. The worker exits nonzero if any cup fails.

Match detail for one or more imported fixtures (ESPN event ids from the tab or
the `source_url`):

```sh
pnpm cups:espn-match -- --event=735531 --dry-run
pnpm cups:espn-match -- --event=735531,760637
```

Dry-run fetches and prints a summary (score, status, event and commentary
counts, whether team stats and lineups exist) without writing.

Parser and fetch checks, from the repository root:

```sh
pnpm exec tsx --test apps/footshorts/worker/src/espnCups.test.ts apps/footshorts/worker/src/espnMatch.test.ts
```
