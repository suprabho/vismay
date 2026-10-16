# Chelsea 2003-04: the first Abramovich season: data pack

All the data on one club in one season, for designing a book or visual story around it: the CSV files described below plus this README.

## The story in one paragraph

In July 2003 Ken Bates sold Chelsea to **Roman Abramovich** for £140 million. That summer Claudio Ranieri's squad was rebuilt for about **£121 million**: Damien Duff (£17m), Hernán Crespo (£16.8m), Claude Makélélé (£16m), Adrian Mutu (£15.8m), Juan Sebastián Verón (£15m), Wayne Bridge and Geremi (£7m each), Joe Cole (£6.6m), Glen Johnson (£6m), and in January Scott Parker (£10m). Verón scored on his debut at Anfield. Chelsea were top in September and again in November, and Ranieri became "the Tinkerman" for his rotation. Arsenal didn't lose, though: Chelsea finished **2nd on 79 points, 11 behind**. In Europe they came through a qualifier against Žilina and won at **Highbury in the quarter-final with Wayne Bridge's 88th-minute goal**, ending an 18-game winless run against them. They then lost the semi-final to Monaco (5–3 on aggregate), a defeat Ranieri was blamed for. Monaco lost the final to José Mourinho's Porto. Ranieri was sacked on 31 May, and **Mourinho** arrived on 2 June.

### Suggested chapter openers (`timeline.csv`, importance 3)

| Date | Moment |
|---|---|
| Jul 2003 | Abramovich buys the club; Dein's "Russian tanks"; the spending starts |
| Jul–Aug 2003 | Duff, Verón, Mutu, Crespo, Makélélé and others arrive (`transfers.csv`) |
| 17 Aug 2003 | Verón scores on debut: Liverpool 1–2 Chelsea |
| Sep / Nov 2003 | Top of the table, and Lampard is Player of the Month (September) |
| 6 Apr 2004 | Bridge's 88th-minute winner at Highbury knocks Arsenal out of Europe |
| 5 May 2004 | Out to Monaco in the Champions League semi-final |
| 26 May – 2 Jun 2004 | Mourinho's Porto win the Champions League; Ranieri sacked (31 May); Mourinho arrives (2 Jun) |

## Headline numbers (`key_numbers.csv`)

| | P | W | D | L | GF | GA |
|---|---|---|---|---|---|---|
| All competitions | 59 | 36 | 12 | 11 | 102 | 48 |
| Premier League: 2nd, 79 pts (Arsenal 90) | 38 | 24 | 7 | 7 | 67 | 30 |
| Champions League: semi-final (Monaco), qualifiers included | 14 | 8 | 4 | 2 | 21 | 10 |
| FA Cup: fifth round (Arsenal) | 4 | 2 | 1 | 1 | 8 | 4 |
| League Cup: quarter-final (Aston Villa) | 3 | 2 | 0 | 1 | 6 | 4 |

- **League:** top after rounds 6–8 and 14–15; 3rd for most of the winter; 2nd from round 27. Home 12-4-3, away 12-3-4. 21 league clean sheets.
- **Late goals:** 28 goals in the last 15 minutes, more than in any other 15-minute band.
- **Scorers, all competitions:** Hasselbaink 17, Lampard 15, Guðjohnsen 13, Crespo 12, Mutu 10, Duff 6.
- **Most minutes:** Lampard (4,549), Terry, Bridge, Makélélé, Cudicini. 28 players used.
- **Money:** about £121m spent on 14 arrivals and £0.5m received. Only five departures are listed (`transfers.csv`).
- **Extremes:** biggest win 5–0 at Wolves (20 Sep). Heaviest defeat 2–4 at Charlton (26 Dec).

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
- **FA Cup and League Cup games come from Wikipedia**, because BDFutbol doesn't cover English domestic cups. They have scores, scorers (mapped to squad ids), attendance and, mostly, referee and stadium, but no lineups. In `squad.csv` they appear as `facup_goals` / `leaguecup_goals` only. Played and minute totals cover the league, Europe and the Community Shield.
- **Minutes:** Wikipedia's goal minutes can be a minute off other sources. BDFutbol writes stoppage time as e.g. 92'.
- **Transfermarkt `joined`** is blanked when Transfermarkt shows a later spell at the club (Henry's 2012 loan, Lehmann's 2011 return).
- **Elo ratings** aren't included: api.clubelo.com was down when this was built.
- **Assists** aren't in these sources for this season.
- **Abramovich's takeover date:** the club season page and Bates' article say July 2003; Abramovich's article says June 2003.
- **Ranieri's last day:** the season page says he was sacked 31 May 2004; his own article ends his tenure 30 May.
- **No friendlies:** Chelsea's season page lists none, so `friendlies.csv` is empty.

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

Rebuild in the vismay repo (`vizmaya-data/football-seasons/`): `python3 -I scripts/team_season.py fetch --team chelsea --season 2003`, then `build`. `club_events.csv` is the only hand-edited file.
