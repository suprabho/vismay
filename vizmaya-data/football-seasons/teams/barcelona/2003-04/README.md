# FC Barcelona 2003-04: team-season pack

Everything for one club in one season, gathered in one folder for designing the book or story around it. Rijkaard's first season and Laporta's first year. Ronaldinho arrives, the team is 12th at New Year, then goes on a 17-match unbeaten league run and finishes 2nd.

Rebuild: `python3 -I scripts/team_season.py fetch --team barcelona --season 2003`, then `build` (run from `vizmaya-data/football-seasons/`). Raw pages are cached in `raw/teams/barcelona-2003-04/`, which is gitignored. This folder is the committed output. `club_events.csv` is the one hand-edited file. Everything else is rebuilt.

## The season in numbers (`summary.json`)

| | P | W | D | L | GF | GA |
|---|---|---|---|---|---|---|
| All competitions | 52 | 29 | 12 | 11 | 89 | 46 |
| La Liga: 2nd, 72 pts (Valencia 77) | 38 | 21 | 9 | 8 | 63 | 39 |
| UEFA Cup: out in the fourth round to Celtic | 8 | 5 | 2 | 1 | 17 | 3 |
| Copa del Rey: out in the quarter-final to Zaragoza | 6 | 3 | 1 | 2 | 9 | 4 |

- **Low point:** 12th after round 18 (4 Jan 2004, a 3–0 loss at Racing). 18 pts behind the leader, 6 above the relegation places.
- **Turn:** rounds 1–19 brought 27 pts (7th). Rounds 20–38 brought 45 pts, the best second half in the league by 11 (Valencia and Deportivo 34).
- **Runs:** 17 league games unbeaten (11 Jan → 2 May). 9 straight league wins (25 Jan → 21 Mar).
- **Clásicos:** 1–2 at Camp Nou (6 Dec). 2–1 at the Bernabéu (25 Apr, Xavi 86').
- **Scorers, all competitions:** Ronaldinho 21, Saviola 19, Kluivert 10, Luis García 8, Cocu 6.
- **Extremes:** biggest win 8–0 v Matador Púchov (UEFA Cup). Heaviest defeat 5–1 at Málaga.
- 29 players used. Valdés conceded 38 in 44 games.

## Files

| File | One row per | What's in it |
|---|---|---|
| `matches.csv` | competitive match (52) | date, competition, round, H/A, opponent (+ crosswalk id, final league position), score (`hg`/`ag` home–away, `gf`/`ga` Barça's), result, league points, half-time (league only, home–away), aggregate (cups, that leg's home team first), scorers for/against with minutes, stadium, city, referee, attendance (cups only), opposing manager, Bet365 odds + implied win probability (league only), league position / points / gap to leader after the round, BDFutbol match id |
| `goals.csv` | goal (135, both sides) | minute, scorer, penalty / own goal, score after (home–away and Barça-first), half |
| `lineups.csv` | player in a matchday squad (both teams) | shirt, started, sub on/off minute, minutes played, goals, yellow (+ minutes), second yellow, red (+ minute), missed penalty, injured, nationality |
| `squad.csv` | Barça player (36) | bio (full name, birth date/place, nationality, height, weight, foot, detailed position), joined + signed from, status (signed / signed mid-season / left mid-season / promoted), academy product, international, then per-competition and total apps, starts, sub apps, minutes, goals, cards, unused bench, goals conceded (GKs), minutes per goal, club before and after |
| `player_careers.csv` | player × season × club | each squad player's whole BDFutbol career: division, age, apps, starts, minutes, goals (`this_season` flags 2003-04 at Barça) |
| `player_months.csv` | player × month | apps, starts, minutes, goals, cards (the one-month-per-chapter view) |
| `months.csv` | month (Aug–May) | record, goals, league points won of possible, league position and gap at month end, top scorers, competitions played |
| `league_matches.csv` | La Liga match (380) | every league result with round, half-time, cards per team, stadium, referee, Bet365 odds |
| `league_table_by_round.csv` | round × club (38 × 20) | position, P W D L GF GA GD Pts, gap to leader, margin over relegation |
| `league_table_final.csv` | club | final table |
| `transfers.csv` | move in or out | window, player, position, nationality, age, other club, type (transfer / loan / promotion / release), fee (+ € million), citation URL |
| `friendlies.csv` | friendly (16) | pre-season USA/England tour, Gamper Trophy v Boca, mid-season friendlies |
| `timeline.csv` | event (≈70) | the season in order: `club_events.csv` (hand-picked, quoted) + events read off the data (first/last match, low point, runs, Clásicos, big wins and defeats, cup exits, debuts and first goals of new players, red cards, winter moves). Sort by `importance` (3 = could open a chapter) |
| `club_events.csv` | hand-picked off-pitch event | Laporta's election, Rijkaard, the Beckham miss, Ronaldinho's signing and debut, the 1:30 a.m. goal, the Bernabéu win, the documentary. **Every row quotes its Wikipedia page word for word, and the build checks the quote against the cached page.** Add rows here |
| `summary.json` | — | headline numbers above, plus home/away splits, goals by 15-minute band, the second-half table, position by round, and the build's own checks |

Ids: `opponent_id` / `team_id` are the workspace crosswalk ids (`data/teams.csv`). Clubs outside the crosswalk get a slug. `player_id` is BDFutbol's (`https://www.bdfutbol.com/en/j/j<id>.html`). `transfermarkt_id` is on `squad.csv`.

## Sources

| Source | Gives |
|---|---|
| [BDFutbol](https://www.bdfutbol.com/en/t/t2003-041.html) | all 52 matches with lineups, subs, card and goal minutes, referees; the squad table; player bios and careers; all 380 league results and the official standings by round (head-to-head tie-breaks and Racing's 1-point deduction included) |
| [football-data.co.uk](https://www.football-data.co.uk/spainm.php) `SP1` 2003-04 | league half-time scores, Bet365 odds |
| [Transfermarkt](https://www.transfermarkt.com/fc-barcelona/kader/verein/131/saison_id/2003) | detailed position, foot, joined date, signed from |
| [Wikipedia: 2003–04 FC Barcelona season](https://en.wikipedia.org/wiki/2003%E2%80%9304_FC_Barcelona_season) | transfers with fees and citations, cup attendances, friendlies; plus the Laporta, Rijkaard and Ronaldinho pages for the club events |

## Checks the build runs

- Every match's goal rows add up to its score (135 goals, 52 matches).
- Squad apps, minutes and goals rebuilt from the lineups match BDFutbol's own squad table. The one gap is Márquez's minutes, 2 off in the league and 1 in the cup, from a red-card minute.
- League points rebuilt from the 380 results match BDFutbol's standings every round. The only difference is Racing's deduction, which goes in `pts_adjustment`.
- All 380 league rows match a football-data.co.uk row (date, teams, score).

## Caveats and source disagreements

- **Ronaldinho's goals:** BDFutbol and Wikipedia's own stats table both give 14 league / 21 total. Wikipedia's infobox and Ronaldinho article say 15 / 22. This pack uses 14 / 21.
- **"Bottom of the table":** the club season page and Laporta's article say the team was at the bottom. Neither BDFutbol nor Wikipedia's own round-by-round row puts them below 12th. Rijkaard's article ("close to the relegation zone") is nearer the mark: 6 pts clear at the low point.
- **Position by round:** BDFutbol and Wikipedia differ in rounds 1, 2, 4, 16 and 31, which are same-points tie-break orderings. The pack uses BDFutbol.
- **Tables are by round, not by date.** Round 30 (Betis 1–1 Barça) was played on 14 Apr, after round 32. "After round 31" therefore already includes it.
- **Status flags** are BDFutbol's legend. "Signed mid-season" is set for some players who were in the squad from round 1 (Van Bronckhorst, Sergio García), so use `transfers.csv` for windows.
- **Matador Púchov** (UEFA Cup first round): BDFutbol has only Barça's lineups and one Púchov player, and the Púchov 93' scorer (Jambor) has no player id.
- **Friendlies:** scores are as Wikipedia lists them, home team first. Neutral-venue games (USA tour, Copa Catalunya final) get no derived result, because the side order there isn't certain.
- **Not in the pack:** Elo (api.clubelo.com was down during the build, so rerun `fetch` to add `elo.csv`); attendances for league games; event data (StatsBomb publishes no 2003-04 Barça matches; the only 2003-04 club data is Arsenal and the UCL final); assists (none of these sources carry them for this season); exact dates for Laporta's election (June 2003) and Rijkaard's appointment (pre-season).
