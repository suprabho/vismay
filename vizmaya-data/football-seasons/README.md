# Football Seasons since 2002 — data workspace

Book series: **one season per book, one month per chapter**, themes threading across books.
Scope: Big 5 leagues (+ Championship, Eredivisie, Primeira, Scottish Prem as context), Champions League, World Cups & Euros (+ all internationals).

## Layout
- `raw/` — untouched downloads (re-fetchable)
- `data/matches.csv` — one row per match, 2002-07 → today: `date, season, month, competition, stage, home, away, hg, ag, ht, note, source` + league extras (shots, corners, cards, referee, xG where present, Bet365 odds)
- `data/coverage_by_season.csv` — match counts per season × competition (sanity check)
- `scripts/fetch_core.sh` — downloads (run in batches: `FROM=2 TO=9 bash scripts/fetch_core.sh` … `FROM=18 TO=26`)
- `scripts/build_matches.py` — merges raw → `data/matches.csv`

## Sources (layer 1 — results backbone)
| Source | Covers | Notes |
|---|---|---|
| football-data.co.uk | 9 leagues, 2002/03 → 2026/27 | results, HT, shots, cards, corners, odds; referees (EPL); xG in recent files |
| jalapic/engsoccerdata `champs.csv` | UCL 2002/03 → 2015/16 | includes qualifying rounds |
| openfootball champions-league / football.json | UCL 2016/17 → 2025/26 | main draw only; 2026/27 not yet published |
| martj42/international_results | every international since 1872 | + goalscorers, shootouts |
| statsbomb/open-data (`competitions.json` only so far) | event data for select seasons | e.g. Arsenal 03/04, Messi's La Liga years, World Cups, Euros |

## Known gaps / caveats
- Eredivisie 2004/05 not available at source.
- UCL counts before 2016/17 include qualifiers; filter by `stage` for main draw.
- Current-season UCL 2026/27 → use Footshorts' football-data.org pipeline.
- Team names differ between sources ("Real Madrid" vs "Real Madrid CF") → need a crosswalk (reuse Footshorts `entityResolver`).
- Seasons: league/UCL labelled by source season; internationals Aug–Jul (summer tournaments belong to the season just ended; WC 2022 → 2022-23).

## Layer 0 — team crosswalk
- `data/teams.csv` (committed) — one row per club: `canonical_id` (= Footshorts entity slug when one exists), country, each source's spelling (`football_data_name`, `openfootball_name`, `engsoccerdata_name`, `clubelo_name`; several spellings joined with ` | `), `needs_review` + note.
- `data/teams_overrides.csv` (committed) — hand decisions, `source,raw_name,canonical_id,note`; always win on rerun. `canonical_id` `-` on a `clubelo` row = "none of our clubs".
- Rebuild: `pnpm --filter @footshorts/worker history:teams` (reads Footshorts entities read-only; picks up `raw/clubelo/` snapshots for ClubElo names).

## Layer 4 — strength over time (Elo)
- National teams: `python3 -I scripts/elo_national.py` → `data/elo_national_monthly.csv` (team, month, elo, rank — rank among teams active in the prior 4 years) + `data/elo_national_matches.csv` (pre-match ratings + swing per match). World Football Elo method, computed from 1872.
- Clubs: `python3 -I scripts/elo_clubs.py fetch` (month-end snapshots → `raw/clubelo/`, cached; stops on API outage) → `history:teams` → `python3 -I scripts/elo_clubs.py build` → `data/elo_monthly.csv` (club = canonical_id, month, elo, ClubElo rank, level).

## Layer 3 — player stats
`scripts/players.py` (stdlib): `tm-clubs` → `wiki-fetch` → `build`.
- `data/player_season.csv` — season, competition, player (+ Transfermarkt `player_id` or Wikipedia `player_wiki` link target), club (canonical_id, ` | ` if several), apps, minutes, goals, assists, cards, goals_rank / assists_rank (competition ranking), source.
- `data/player_month.csv` — same per month, scorers & assisters only (players with 0 G+A dropped).
- **2012-13 → 2025-26**: Transfermarkt open data (`raw/transfermarkt/`, dcaribou mirror; upstream paused — nothing after 2026-06-28, so no 2026-27). All 9 competitions except the Championship (not in the dataset).
- **2002-03 → 2011-12**: Wikipedia season-page top-scorer tables (`raw/wikipedia/`, cached) → season level only, usually top 10–20, goals (assists only where the page lists them). Championship comes from Wikipedia for every season.
- Clubs: Transfermarkt ids are paired to the crosswalk by matching games (competition, date ±1, score) → `data/transfermarkt_clubs.csv`; Wikipedia club names match within that competition-season's clubs.
- Known gaps: Championship 2002-03 → 2005-06 (no scorer table on Wikipedia). Scottish Premiership 2017-18 onward is missing the 5 post-split rounds in Transfermarkt (198 of 228 games), so totals run a few goals low. Belenenses and B-SAD share one id (football-data names both "Belenenses"). Wikipedia vs Transfermarkt agree on 38/40 top-5 scorers for 2012-13 (2 Scottish ±1).

## Layer 2 — monthly events (pilot: 2003-04)
`scripts/events.py` (`fetch` → `tables` → `text` → `build`, each `--season 2003`) + `pnpm --filter @footshorts/worker history:events -- --season=2003` between `text` and `build`.
- `data/manager_changes.csv` — date, club, outgoing, incoming, reason, appointed, citation (Wikipedia "Managerial changes" tables; England, Italy, Portugal, Scotland have them for 2003-04).
- `data/transfers.csv` — every move found: Wikipedia "List of English football transfers" (with fees) + Transfermarkt `transfers` (all leagues, but before 2012 only players still active after 2012).
- `data/events.csv` (committed) — date, season, month, type, importance (3 = could open a chapter), competition, teams (canonical ids), people, one-line summary, fee, source_url, origin, source_page, evidence, **verified**, **notes**. Manager changes + transfers ≥ £5m/€7m + Claude-extracted events, duplicates merged.
- Claude extraction reads the season's articles (league + "in X football" + club season pages + competition/story pages; edit `SEASON_EXTRAS` / `SEASON_STORIES` in events.py per season). Every event must quote its article verbatim and is dropped if the quote isn't found; results cached in `raw/events_llm/`.
- Hand check: fill `verified` (yes / no / fixed) and `notes` in events.csv; `build` keeps them on rerun as long as origin + date + type + summary are unchanged.
- Coverage is English-heavy: English Wikipedia has no "in Spanish/Italian/German/French football" pages or transfer lists for 2003-04, so continental events come only from league/club pages.

## Layer 5 — StatsBomb event data (marquee seasons only → special features)
`python3 -I scripts/statsbomb.py list` shows what StatsBomb publishes; `fetch --season 2003` then `build --season 2003`.
- 2003-04 = Premier League 2003/04 (all 38 Arsenal "Invincibles" matches) + Champions League 2003/04 (the final only, Monaco 0–3 Porto). No Euro 2004.
- `data/statsbomb/2003-04/`: `matches.csv` (StatsBomb id ↔ crosswalk club ids, managers), `shots.csv` (shot maps: location, end location, xG, outcome, assister), `pass_network.csv` + `pass_nodes.csv` (completed passes passer→recipient and average positions, up to each team's first sub), `pressures.csv` (pressing maps), `team_match.csv` (passes, completion, shots, xG, pressures by third, counterpresses, PPDA).
- Coordinates: StatsBomb 120×80 pitch, each event from the acting team's view (attacking left → right).
- Checks: Arsenal 26W 0L, Henry 30 / Pirès 14 from shots (matches Layer 3); 5 score/shot mismatches are own goals.
- Publishing requires StatsBomb attribution (logo + credit) per https://github.com/statsbomb/open-data#license.

## Planning the books (admin)
The admin **Books** tab (`/footshorts/books`, see [apps/admin/CLAUDE.md](../../apps/admin/CLAUDE.md#books-tab-footshortsbooks)) is where each book is planned in spreads: story beats (with a beat finder over `admin_historical_matches`), the flatplan, a card per spread (headline + chart sketch + stat + body + caption, then bound to real data), chapter thumbnails, and the locked series system (grid, type, chart style, spread templates). Plans live in the private `admin_season_books` table.

## Next layers (not fetched yet)
5. **Event data** — StatsBomb open data for marquee seasons.
