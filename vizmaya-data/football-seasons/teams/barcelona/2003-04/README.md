# FC Barcelona 2003-04: data pack

All the data on one club in one season, for designing a book or visual story around it. It is 16 CSV files plus this README. The files are UTF-8 with a header row. Dates are ISO (`YYYY-MM-DD`). Each file's columns are listed below. `summary.json` repeats `key_numbers.csv` in nested form; use whichever is easier.

## The story in one paragraph

In summer 2003 a new young president, **Joan Laporta**, promised David Beckham, lost him to Real Madrid, and signed **Ronaldinho** from PSG instead. The coach was **Frank Rijkaard**, untested at a big club. Barça were in the UEFA Cup, not the Champions League. By 4 January 2004 they were **12th**, 18 points behind the leader and 6 above the relegation places, and the coach was under fire. **Edgar Davids** arrived on loan in January. From 11 January Barça went **17 league games unbeaten**, including 9 straight wins, and won 2–1 at the Bernabéu for the first time in seven years. Their 45 points over the second half of the season (rounds 20–38) were the most in the league by 11. Real Madrid, top for most of the season, lost their last five games. Barça finished **2nd** on 72 points, behind Valencia's 77. A 16-year-old Lionel Messi made his first-team debut in a friendly that November.

Suggested chapter openers (`timeline.csv`, importance 3):

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
| UEFA Cup: out in the fourth round to Celtic (0–1 on aggregate) | 8 | 5 | 2 | 1 | 17 | 3 |
| Copa del Rey: out in the quarter-final to Zaragoza (1–2 on aggregate) | 6 | 3 | 1 | 2 | 9 | 4 |

- **First vs second half of the league:** rounds 1–19 brought 27 pts (7th). Rounds 20–38 brought 45 pts (1st; Valencia and Deportivo 34).
- **Scorers, all competitions:** Ronaldinho 21, Saviola 19, Kluivert 10, Luis García 8, Cocu 6, Luis Enrique 5, Xavi 5.
- **Extremes:** biggest win 8–0 v Matador Púchov (UEFA Cup). Heaviest defeat 1–5 at Málaga (3 Dec).
- **Clásicos:** 1–2 at home (6 Dec), 2–1 away (25 Apr; Kluivert 56', Xavi 86').
- 29 players used. Goalkeeper Víctor Valdés: 44 games, 38 conceded.

## Files

### Matches and goals
**`matches.csv`** (52 rows, one per competitive game, in date order). `match_no` links every other per-match file.
- `date`, `weekday`, `month`; `competition` (La Liga / UEFA Cup / Copa del Rey); `round` (league round number, or cup round plus leg)
- `venue` H/A; `opponent`, `opponent_id`; `opponent_final_pos` (opponent's final league place, league only)
- `home`, `away`, `hg`, `ag`: score as home–away. `gf`, `ga`: Barça's goals for/against. `result` W/D/L. `points` (league only)
- `ht`: half-time, home–away (league only). `aggregate`: cup tie aggregate after the second leg, that leg's home team first
- `scorers_for`, `scorers_against`: e.g. `Saviola 9'; Ronaldinho 24'`
- `stadium`, `city`, `referee`, `attendance` (cup games only), `opponent_manager`
- `b365_win`, `b365_draw`, `b365_loss`, `implied_win_prob`: pre-match Bet365 odds and the win probability they imply (league only). Good for "expected vs actual".
- `league_pos_after`, `league_pts_after`, `pts_behind_leader_after`: league standing after that round

**`goals.csv`** (135 rows, both teams): `minute`, `period` (1H/2H), `player`, `team`, `for_club` (1 = Barça), `penalty`, `own_goal`, `score_after` (home–away), `club_score_after` (Barça first). Plots well as a goal-minute strip or a 15-minute histogram.

**`lineups.csv`** (1,810 rows): every player in each matchday squad, both teams. Columns: `number`, `started`, `sub_on` / `sub_off` minute, `minutes`, `goals`, `yellow` + `yellow_min`, `second_yellow`, `red` + `sent_off_min`, `missed_penalty`, `injured`, `nation`. Filter `for_club = 1` for Barça. Use it for minutes grids (player × match) and starting-XI pitch graphics.

**`friendlies.csv`** (16 rows): pre-season USA and England tour, the Gamper Trophy v Boca Juniors (22 Aug), the Porto friendly (Messi's debut) and others. `score` is home team first. Neutral-venue games have no derived result.

### Squad
**`squad.csv`** (36 rows, sorted by minutes played)
- Bio: `full_name`, `shirt`, `position` (GK/RB/LB/CB/MF/FW), `position_detail`, `birth_date`, `age_at_season_start`, `birth_place`, `birth_country`, `nationality`, `height_cm`, `weight_kg`, `foot`
- Arrival: `joined`, `signed_from`; `status` (signed / signed mid-season / left mid-season / promoted from reserves); `academy` (1 = club youth product); `international`
- Per competition (`liga_`, `uefa_`, `copa_`) and in total (`all_`): `played`, `started`, `sub_apps`, `minutes`, `goals`, `yellow`, `red`
- Also `all_bench_unused`, `all_goals_conceded` (goalkeepers), `minutes_per_goal`, `prev_club` / `next_club` (where they came from and went next)

**`player_careers.csv`** (616 rows): each squad player's league career season by season: `club`, `division`, `age`, `apps`, `starts`, `minutes`, `goals`. `this_season = 1` marks 2003-04 at Barça. Use it for "before / during / after" career arcs, e.g. Ronaldinho at PSG → Barça → Milan.

**`player_months.csv`** (203 rows): player × month: `apps`, `starts`, `minutes`, `goals`, cards. Shows who mattered in which month.

### League context
**`league_table_by_round.csv`** (760 rows = 38 rounds × 20 clubs): `pos`, `played`, `won`, `drawn`, `lost`, `gf`, `ga`, `gd`, `pts`, `pts_behind_leader`, `pts_above_relegation`. Feeds a bump chart of positions or a points race (Barça vs Valencia vs Real Madrid vs Deportivo).

**`league_table_final.csv`** (20 rows): final table. Racing's `pts_adjustment` of −1 is a points deduction.

**`league_matches.csv`** (380 rows): every La Liga result: `round`, `date`, teams, score, `ht`, yellow/red cards per team, stadium, referee, Bet365 odds.

### Time
**`months.csv`** (10 rows, Aug → May): one per chapter. Columns: record, goals, `league_points` of `league_points_possible`, `league_pos_end`, `league_pts_behind_leader_end`, `top_scorer`, competitions played.

**`timeline.csv`** (76 rows, date order): the whole season as events.
- `kind`: club / context / rivals / transfer / match / milestone / debut / goal / discipline / friendly
- `importance`: 3 = could open a chapter, 2 = spread-worthy, 1 = detail
- `date_precision`: day / month / window / pre-season / season. Only `day` rows have an exact date.
- `title`, `detail`, `people`, `match_no` (links to `matches.csv`), `source`, `source_url`, `evidence`

**`club_events.csv`** (19 rows): the hand-picked off-pitch subset of the timeline. Each row carries a verbatim quote (`evidence`) from the Wikipedia page named in `source`, checked against that page.

### Money and moves
**`transfers.csv`** (24 rows): `direction` in/out, `window` summer/winter, `player`, `position`, `nationality`, `age`, `other_club`, `type` (transfer / loan / promotion / contract termination), `fee`, `fee_eur_m`, `source_url`. Per Wikipedia: about €50.5m spent, €3.15m received.

### Headline figures
**`key_numbers.csv`**: `metric`, `value` pairs, e.g. `records.La Liga.won,21`, `league.low_point.pos,12`, `league.position_by_round` (38 positions, space-separated), `streaks.unbeaten_league.length,17`, `goals_by_15_min.against.76-90,13`, `second_half_table.*`.

## Visual ideas the data supports
- **The turnaround curve:** Barça's league position by round, from 12th (round 18) to 2nd (round 37). Overlay Real Madrid's flatline at 70 points from round 33.
- **Two halves:** the rounds 1–19 table against the rounds 20–38 table.
- **Month grid:** one tile per month from `months.csv`, sized by points won of points possible.
- **Squad minutes heatmap:** player × match from `lineups.csv`, with Davids' arrival marked in January.
- **Where they came from and went:** `prev_club` → Barça → `next_club` flows from `squad.csv`.
- **Expected vs actual:** `implied_win_prob` against the result for each league game.
- **When goals came:** for and against by 15-minute band. Barça conceded 13 in the last 15 minutes, more than in any other band.

## Caveats
- **Ronaldinho's goals:** 14 league / 21 all competitions here (BDFutbol and Wikipedia's stats table). Some Wikipedia text says 15 / 22.
- **"Bottom of the table" is a myth:** some sources claim it, but Barça were never lower than 12th.
- **Tables are by round, not by date.** Round 30 (Betis 1–1 Barça) was played on 14 Apr, after round 32.
- **Matador Púchov** (UEFA Cup first round): the opposing lineups are incomplete.
- **Not included:** Elo ratings (source offline when built), league attendances, assists, shot or pass event data (StatsBomb has none for this team-season), exact dates for Laporta's election (June 2003) and Rijkaard's appointment (pre-season).
- **Status flags** (`status` in `squad.csv`) follow BDFutbol's legend. Use `transfers.csv` for transfer windows.

## Sources and credit
- [BDFutbol](https://www.bdfutbol.com/en/t/t2003-041.html): matches, lineups, minutes, cards, goals, squad, player bios and careers, league results and standings
- [football-data.co.uk](https://www.football-data.co.uk/spainm.php): half-time scores, Bet365 odds
- [Transfermarkt](https://www.transfermarkt.com/fc-barcelona/kader/verein/131/saison_id/2003): positions, foot, joined date
- [Wikipedia](https://en.wikipedia.org/wiki/2003%E2%80%9304_FC_Barcelona_season): transfers and fees, cup attendances, friendlies, club events (CC BY-SA)

### Checks
- Goals add up to every score.
- Player minutes match BDFutbol's squad table to within 2 minutes.
- League points match the official standings every round.

Rebuild (in the vismay repo, `vizmaya-data/football-seasons/`): `python3 -I scripts/team_season.py fetch --team barcelona --season 2003`, then `build`. `club_events.csv` is the only hand-edited file.
