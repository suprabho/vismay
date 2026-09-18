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

Parser and fetch checks, from the repository root:

```sh
pnpm exec tsx --test apps/footshorts/worker/src/espnCups.test.ts
```
