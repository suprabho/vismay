# Arsenal 2003-04: "The Invincibles": data pack

All the data on one club in one season, for designing a book or visual story around it: the CSV files described below plus this README.

## The story in one paragraph

Arsène Wenger's eighth season. Arsenal kept their core, signed only goalkeeper **Jens Lehmann** (to replace David Seaman) and later **José Antonio Reyes**, and watched Roman Abramovich buy Chelsea next door. David Dein said he had "parked his Russian tanks on our lawn". In September the 0–0 at Old Trafford became the **Battle of Old Trafford**, with six players charged and a record £175,000 fine. In Europe they lost 0–3 at home to Inter, then won **5–1 at the San Siro**. The league season went **38 games without defeat (26 wins, 12 draws, 90 points)**, setting an English record of 30 unbeaten from the start on 28 March. In one April week they went out of the FA Cup (to United) and the Champions League (to Chelsea, Wayne Bridge's late goal at Highbury). The title was sealed with a 2–2 at **White Hart Lane** on 25 April. **Thierry Henry** scored 39 (30 in the league, the Golden Boot) and was Footballer of the Year again. The unbeaten run reached 49 before it ended at Old Trafford in October 2004.

### Suggested chapter openers (`timeline.csv`, importance 3)

| Date | Moment |
|---|---|
| Jul 2003 | Abramovich buys Chelsea; Dein's "Russian tanks"; Lehmann replaces Seaman |
| 21 Sep 2003 | The Battle of Old Trafford (0–0) |
| 25 Nov 2003 | Inter 1–5 Arsenal at the San Siro |
| Feb 2004 | Club record 24 unbeaten (7 Feb); Henry's 100th Premier League goal (10 Feb); five league wins from five |
| 28 Mar 2004 | English record: 30 unbeaten from the start |
| 3–6 Apr 2004 | Out of the FA Cup (semi, United) and Champions League (quarter, Chelsea) in four days |
| 9 Apr 2004 | Henry turns Liverpool round: 2–1 down, 4–2 up |
| 25 Apr 2004 | Champions at White Hart Lane (2–2) |
| 15–16 May 2004 | 2–1 v Leicester completes the unbeaten season; the parade |

## Headline numbers (`key_numbers.csv`)

| | P | W | D | L | GF | GA |
|---|---|---|---|---|---|---|
| All competitions | 59 | 37 | 16 | 6 | 114 | 48 |
| Premier League: champions, 90 pts (Chelsea 79, United 75) | 38 | 26 | 12 | 0 | 73 | 26 |
| Champions League: quarter-final (Chelsea) | 10 | 5 | 2 | 3 | 16 | 11 |
| FA Cup: semi-final (Manchester United) | 5 | 4 | 0 | 1 | 15 | 5 |
| League Cup: semi-final (Middlesbrough) | 5 | 2 | 1 | 2 | 9 | 5 |
| Community Shield: lost 3–4 on penalties to United | 1 | 0 | 1 | 0 | 1 | 1 |

- **League:** home 15-4-0, away 11-8-0. Top for good from round 22. Never below 3rd after round 1 (7th that day, on alphabetical order). 45 points in each half of the season.
- **Scorers, all competitions:** Henry 39, Pirès 19, Ljungberg 10, Edu 7, Bergkamp 5, Reyes 5. Golden Boot: Henry 30, with Pirès 14 joint 10th (`league_top_scorers.csv`).
- **Ever-presents:** Lehmann played every minute of all 49 league, European and Shield games. Kolo Touré is the season page's most-used player across all competitions (55 games).
- **Money:** about £15m spent (Reyes £10.5m, van Persie agreed for £3m in April, Lehmann £1.5m), against Chelsea's £121m.
- **Discipline:** five Arsenal players sent off across the season (Jeffers, Vieira, Campbell, Cole, Keown).
- **Extremes:** biggest win 5–0 v Leeds (16 Apr). Heaviest defeat 0–3 v Inter at home (17 Sep).

## Files

All files are UTF-8 CSV with a header row. Dates are ISO (`YYYY-MM-DD`). `match_no` (1 = first competitive game, in date order) links the per-match files. `summary.json` holds the same numbers as `key_numbers.csv`, nested.

### Matches and goals
**`matches.csv`**: one row per competitive game.
- `date`, `weekday`, `month`, `competition`, `round` (a league round number, or the cup round and leg), `venue` (H / A / N = neutral)
- `opponent`, `opponent_id`, `opponent_final_pos` (league games only)
- `home`, `away`, `hg`, `ag`: the score, home team first. `gf`, `ga`: the club's own goals. `result` W/D/L. `penalties` (shoot-out, home first). `points` (league only)
- `ht`: half-time, home–away (league only). `aggregate`: cup aggregate after the second leg, that leg's home team first
- `scorers_for`, `scorers_against`: e.g. `Henry 31'; Pirès 49'`
- `stadium`, `city`, `referee`, `attendance`, `opponent_manager`
- `shots_for` / `shots_against`, `sot_for` / `sot_against` (on target), `corners_*`, `fouls_*`: league games in leagues whose football-data.co.uk file has them (England yes, Spain no)
- `b365_win`, `b365_draw`, `b365_loss`, `implied_win_prob`: pre-match Bet365 odds and the win probability they imply (league games only). Good for "expected vs actual".
- `league_pos_after`, `league_pts_after`, `pts_behind_leader_after`
- `source`: BDFutbol (full lineups) or Wikipedia (score and scorers only). `has_lineups`: 1 or 0

**`goals.csv`**: every goal, both teams. Columns: `minute`, `period` (1H / 2H / ET), `player`, `player_id` (blank if the scorer isn't in the squad, e.g. an opponent), `player_link` (Wikipedia name, cup games only), `team`, `for_club` (1 = this club), `penalty`, `own_goal`, `score_after` (home first), `club_score_after` (this club first). Plots well as a goal-minute strip or a 15-minute histogram.

**`lineups.csv`**: every player in each matchday squad, both teams, for games with `has_lineups = 1`. Columns: `number`, `started`, `sub_on` / `sub_off` minute, `minutes`, `goals`, `yellow` (+ `yellow_min`), `second_yellow`, `red` (+ `sent_off_min`), `missed_penalty`, `injured`, `nation`. Filter `for_club = 1` for this club. Feeds minutes grids (player × match) and starting-XI graphics.

**`friendlies.csv`**: pre-season and mid-season friendlies, where the club's Wikipedia page lists them. `score` is home team first.

### Squad
**`squad.csv`**: one row per squad player, sorted by minutes.
- Bio: `full_name`, `shirt`, `position` (GK/RB/LB/CB/MF/FW), `position_detail`, `birth_date`, `age_at_season_start`, `birth_place`, `birth_country`, `nationality`, `height_cm`, `weight_kg`, `foot`
- Arrival: `joined`, `signed_from`; `status` (signed / signed mid-season / left mid-season / promoted from reserves); `academy` (1 = youth product); `international`
- Per competition: `league_*`, plus one prefix per cup (`ucl_` Champions League, `uefa_` UEFA Cup, `copa_` Copa del Rey, `shield_` Community Shield). Each has `played`, `started`, `sub_apps`, `minutes`, `goals`, `yellow`, `red`.
- Cups that only Wikipedia covers have goals only: `facup_goals`, `leaguecup_goals`.
- Totals: `all_played`, `all_started`, `all_minutes` and the card counts cover the games with lineups. `all_goals` counts every competition.
- Also: `all_bench_unused`, `all_goals_conceded` (goalkeepers), `minutes_per_goal`, `prev_club` / `next_club` (club the season before and after)

**`player_careers.csv`**: each squad player's league career, season by season. Columns: `club`, `division`, `age`, `apps`, `starts`, `minutes`, `goals`. `this_season = 1` marks 2003-04 at this club. Use it for before / during / after career arcs.

**`player_months.csv`**: player × month: apps, starts, minutes, goals, cards (games with lineups).

### League context
**`league_table_by_round.csv`**: the table after every round, 20 clubs × 38 rounds. Columns: `pos`, `played`, `won`, `drawn`, `lost`, `gf`, `ga`, `gd`, `pts`, `pts_adjustment` (deductions), `pts_behind_leader`, `pts_above_relegation` (margin over 18th, the first relegation place). Feeds a bump chart or a points race.

**`league_table_final.csv`**: the final table.

**`league_matches.csv`**: every league result (380), with round, half-time, shots / on target / corners / fouls (where the league file has them), cards, stadium, referee, Bet365 odds.

**`league_top_scorers.csv`**: the league's top-scorer table (Pichichi / Golden Boot). `club_is_us = 1` marks this club's players.

### Time
**`months.csv`**: one row per month (a chapter). Columns: record, goals, `league_points` of `league_points_possible`, `league_pos_end`, `league_pts_behind_leader_end`, `top_scorer`, competitions played.

**`timeline.csv`**: the season as events, in date order.
- `kind`: club / context / rivals / transfer / match / milestone / debut / goal / discipline / friendly
- `importance`: 3 = could open a chapter, 2 = spread-worthy, 1 = detail
- `date_precision`: day / month / window / pre-season / season. Only `day` rows have an exact date.
- `title`, `detail`, `people`, `match_no` (links to `matches.csv`), `source`, `source_url`, `evidence`

It mixes the hand-picked `club_events.csv` with events read off the data: first and last games, the low point, runs, big games, big wins and defeats, how each cup ended, debuts and first goals of new players, red cards, mid-season moves.

**`club_events.csv`**: the hand-picked off-pitch and story events. Each row carries a verbatim quote (`evidence`) from the Wikipedia page named in `source`, checked against that page. Text in `detail` is a short paraphrase backed by the quote or the data.

### Money and moves
**`transfers.csv`**: one row per move. Columns: `direction` in / out, `window` (summer / winter / in-season), `date` (where listed), `player`, `position`, `nationality`, `other_club`, `type` (transfer / loan / promotion / release), `fee`, `fee_eur_m` or `fee_gbp_m`, `source_url`.

### Headline figures
**`key_numbers.csv`**: `metric`, `value` pairs. Examples: `records.<competition>.won`, `league.final_pos`, `league.low_point.*`, `league.first_half.*` / `league.second_half.*` (points in each half of the league season and the second-half table), `league.position_by_round` (38 positions, space-separated), `streaks.*`, `goals_by_15_min.for.76-90`, `big_games.*` (games against the rivals named below), `top_scorers_all.<player>`.

### Event data, StatsBomb (all 38 league games)
StatsBomb's free open data has every Premier League game of the Invincibles season. Pitch is 120 × 80 with each event from the acting team's view, attacking left → right. Rows carry `match_no` to link to `matches.csv`.
- **`statsbomb_matches.csv`**: StatsBomb match id ↔ crosswalk club ids, managers, stadium.
- **`statsbomb_shots.csv`** (544 Arsenal shots plus the opponents'): location, end location, xG, outcome, body part, shot type, technique, under pressure, first time, assister. Feeds shot maps and xG timelines.
- **`statsbomb_pass_network.csv`** + **`statsbomb_pass_nodes.csv`**: completed passes passer → recipient, and each player's average position, up to the first substitution. Feeds pass networks.
- **`statsbomb_pressures.csv`**: every pressure: location, counterpress, duration. Feeds pressing maps.
- **`statsbomb_team_match.csv`**: per team per game: passes, completion, shots, xG, pressures by third, counterpresses, PPDA.

## Visual ideas the data supports
- **The title race:** this club's position or points by round (`league_table_by_round.csv`) against the clubs it raced.
- **Two halves:** the first-half table against the second-half table (`key_numbers.csv` → `league.second_half_table`).
- **Month grid:** one tile per month from `months.csv`, sized by points won of points possible.
- **Squad minutes heatmap:** player × match from `lineups.csv`.
- **Where they came from and went:** `prev_club` → this club → `next_club` flows from `squad.csv`.
- **Expected vs actual:** `implied_win_prob` against the result, league games.
- **When goals came:** for and against by 15-minute band.

## Caveats
- **FA Cup and League Cup games come from Wikipedia**, because BDFutbol doesn't cover English domestic cups. They have scores, scorers (mapped to squad ids), attendance and, mostly, referee and stadium, but no lineups. In `squad.csv` they appear as `facup_goals` / `leaguecup_goals` only. Played and minute totals cover the league, Europe and the Community Shield.
- **Minutes:** Wikipedia's goal minutes can be a minute off other sources. BDFutbol writes stoppage time as e.g. 92'.
- **Transfermarkt `joined`** is blanked when Transfermarkt shows a later spell at the club (Henry's 2012 loan, Lehmann's 2011 return).
- **Elo ratings** aren't included: api.clubelo.com was down when this was built.
- **Assists** aren't in these sources for this season.
- **StatsBomb covers all 38 league games** (`statsbomb_*.csv`). The Champions League, cups and Shield aren't covered. Publishing anything from it needs the StatsBomb logo and credit ([licence](https://github.com/statsbomb/open-data#license)).
- **StatsBomb shots** total 69 Arsenal league goals. The other 4 of the 73 are opponents' own goals.

### Checks the build runs
- Each game's goal rows add up to its score (exceptions listed under Caveats).
- Player minutes match BDFutbol's own squad table to within a few minutes; the small gaps are red-card and stoppage minutes.
- League points match the official standings every round.
- All 380 league results join to football-data.co.uk.
- Every hand-picked event's quote is found on its page.

## Sources and credit
- [BDFutbol](https://www.bdfutbol.com/): games, lineups, minutes, cards, goals with minutes, referees, squad, player bios and careers, league results and standings
- [football-data.co.uk](https://www.football-data.co.uk/): half-time scores, shots, corners, fouls (England), Bet365 odds
- [Transfermarkt](https://www.transfermarkt.com/): detailed positions, preferred foot, joined date
- Wikipedia (CC BY-SA): the club season page (cup games, attendances, transfers, friendlies), the league and cup pages, and the people pages quoted in `club_events.csv`

Rebuild in the vismay repo (`vizmaya-data/football-seasons/`): `python3 -I scripts/team_season.py fetch --team arsenal --season 2003`, then `build`. `club_events.csv` is the only hand-edited file.
