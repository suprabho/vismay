# FC Barcelona 2003-04: the turnaround: data pack

All the data on one club in one season, for designing a book or visual story around it: the CSV files described below plus this README.

## The story in one paragraph

In summer 2003 a new young president, **Joan Laporta**, promised David Beckham, lost him to Real Madrid, and signed **Ronaldinho** from PSG instead. The coach was **Frank Rijkaard**, untested at a big club. Barça were in the UEFA Cup, not the Champions League. By 4 January 2004 they were **12th**: 18 points behind the leader, 7 above the relegation places, and the coach under fire. **Edgar Davids** arrived on loan in January. From 11 January Barça went **17 league games unbeaten**, including 9 straight wins, and won 2–1 at the Bernabéu for the first time in seven years. Their 45 points over rounds 20–38 were the most in the league by 11. Real Madrid, top for most of the season, lost their last five. Barça finished **2nd on 72 points**, behind Valencia's 77. A 16-year-old Lionel Messi made his first-team debut in a friendly that November.

### Suggested chapter openers (`timeline.csv`, importance 3)

| Date | Moment |
|---|---|
| Jun 2003 | Laporta elected president |
| Jul 2003 | Rijkaard appointed; Ronaldinho signs (19 Jul) |
| 3 Sep 2003 | Ronaldinho's first goal, kicked off after midnight (1:30 a.m.) |
| 16 Nov 2003 | Messi's first-team debut, aged 16 (friendly at Porto) |
| 6 Dec 2003 | Clásico lost 1–2 at Camp Nou; Rijkaard under fire |
| Jan 2004 | Davids arrives; low point 12th (4 Jan); unbeaten run begins (11 Jan) |
| 25 Apr 2004 | Xavi's late winner at the Bernabéu |
| May 2004 | Madrid lose their last five; Barça pass them in round 37 and finish 2nd |

## Headline numbers (`key_numbers.csv`)

| | P | W | D | L | GF | GA |
|---|---|---|---|---|---|---|
| All competitions | 52 | 29 | 12 | 11 | 89 | 46 |
| La Liga: 2nd, 72 pts (champions Valencia 77) | 38 | 21 | 9 | 8 | 63 | 39 |
| UEFA Cup: fourth round, out to Celtic (0–1 on aggregate) | 8 | 5 | 2 | 1 | 17 | 3 |
| Copa del Rey: quarter-final, out to Zaragoza (1–2 on aggregate) | 6 | 3 | 1 | 2 | 9 | 4 |

- **Two halves:** rounds 1–19 brought 27 pts (7th). Rounds 20–38 brought 45 pts, 1st (Valencia and Deportivo 34).
- **Scorers, all competitions:** Ronaldinho 21, Saviola 19, Kluivert 10, Luis García 8, Cocu 6, Luis Enrique 5, Xavi 5. The Pichichi went to Real Madrid's Ronaldo with 24; Ronaldinho and Saviola had 14 each (`league_top_scorers.csv` lists the top 8).
- **Big games:** Clásicos 1–2 at home (6 Dec) and 2–1 away (25 Apr; Kluivert 56', Xavi 86'); Barcelona derbies 3–1 away and 4–1 at home.
- **Extremes:** biggest win 8–0 v Matador Púchov (UEFA Cup). Heaviest defeat 1–5 at Málaga (3 Dec).
- 29 players used. Víctor Valdés: 44 games, 38 conceded. Barça conceded 13 in the last 15 minutes of games, more than in any other band.

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

## Visual ideas the data supports
- **The title race:** this club's position or points by round (`league_table_by_round.csv`) against the clubs it raced.
- **Two halves:** the first-half table against the second-half table (`key_numbers.csv` → `league.second_half_table`).
- **Month grid:** one tile per month from `months.csv`, sized by points won of points possible.
- **Squad minutes heatmap:** player × match from `lineups.csv`.
- **Where they came from and went:** `prev_club` → this club → `next_club` flows from `squad.csv`.
- **Expected vs actual:** `implied_win_prob` against the result, league games.
- **When goals came:** for and against by 15-minute band.

## Caveats
- **Ronaldinho's goals:** 14 league / 21 all competitions here (BDFutbol and Wikipedia's stats table). Some Wikipedia text says 15 / 22.
- **"Bottom of the table" is a myth:** some sources claim it, but Barça were never lower than 12th (7 points above the relegation places).
- **Tables are by round, not by date.** Round 30 (Betis 1–1 Barça) was played on 14 Apr, after round 32.
- **Matador Púchov** (UEFA Cup first round): the opposing lineups are incomplete.
- **Friendlies:** neutral-venue games (the USA tour, the Copa Catalunya final) get no derived result, because the side order isn't certain.
- **Status flags** (`status` in `squad.csv`) follow BDFutbol's legend. Use `transfers.csv` for windows.
- **Not included:** Elo ratings (source offline when built), league attendances, shots (football-data's Spanish file has none for 2003-04), assists, StatsBomb event data (none for this team-season), exact dates for Laporta's election (June 2003) and Rijkaard's appointment (pre-season).

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

Rebuild in the vismay repo (`vizmaya-data/football-seasons/`): `python3 -I scripts/team_season.py fetch --team barcelona --season 2003`, then `build`. `club_events.csv` is the only hand-edited file.
