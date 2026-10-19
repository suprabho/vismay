# 2003–04 book — league and cup spreads, flatplan

32 spreads in reading order (17 Premier League, 14 Champions League, plus the cover). 25 beats. Rhythm: `FFHDHDHDHBHDHDHDHBHDDHDHDBDBDDBD` (F frame, H hero, D dense, B breather).

Club- and match-level spreads, and the other leagues, slot in between these later; months with no league/cup spread here are left to them. `status` is the Books-tab status the card starts at: `data` = bound to a Pull-real-data preset, `card` = headline + chart notes, data in `data/` but not a preset.

| no | chapter | id | competition | template | role | form | headline | data | status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cover | C00 | Book | Cover | frame | Big number | 2003–04 | — | card |
| 2 | Season intro | L01 | Premier League | Season intro | frame | Line race | Nobody beat Arsenal. Thirty-eight games, ninety points, eleven clear | epl_race.csv | data |
| 3 | August 2003 | L02 | Premier League | Hero | hero | Bars | Chelsea spent two and a half times what the rest of the league did | epl_summer_signings.csv | card |
| 4 | August 2003 | U01 | Champions League | Timeline | dense | Timeline | Forty ties to fill sixteen places, and Newcastle lost theirs on penalties | ucl_ties.csv, ucl_matches.csv | card |
| 5 | September 2003 | U02 | Champions League | Hero | hero | Bars | Seventy-two clubs from 48 countries started. By September, 32 were left | ucl_stages.csv, ucl_clubs.csv | card |
| 6 | September 2003 | L03 | Premier League | Comparison | dense | Bars | Old Trafford held four Loftus Roads | epl_table_final.csv | card |
| 7 | October 2003 | L04 | Premier League | Hero | hero | Line race | Until Christmas, first and third were never more than five points apart | epl_race.csv, epl_leader_by_date.csv | data |
| 8 | October 2003 | L05 | Premier League | Comparison | dense | Scatter | Liverpool shot more than anyone and finished 30 points behind | epl_table_final.csv | card |
| 9 | November 2003 | U03 | Champions League | Hero | hero | Bars | The group stage averaged two and a half goals a game. In Monaco one night there were eleven | ucl_matches.csv | card |
| 10 | November 2003 | U04 | Champions League | Breather | breather | Big number | Dado Pršo’s goals in the 8–3 | — | card |
| 11 | December 2003 | L06 | Premier League | Hero | hero | Slope | At halfway four points covered the top three. By May it was fifteen | epl_race.csv | card |
| 12 | December 2003 | U05 | Champions League | Comparison | dense | Small multiples | The champions came through their group second | ucl_groups.csv | card |
| 13 | January 2004 | L07 | Premier League | Hero | hero | Results strip | United took 2.27 points a game before Ferdinand's ban and 1.56 after it | epl_race.csv | data |
| 14 | January 2004 | L08 | Premier League | Table | dense | Table | United went into February top, a point ahead of Arsenal with a game more played | epl_month_tables.csv | data |
| 15 | February 2004 | L09 | Premier League | Hero | hero | Results strip | Six clubs led the table. After 1 February, only Arsenal did | epl_leader_by_date.csv | card |
| 16 | February 2004 | L10 | Premier League | Comparison | dense | Bars | February was the season's highest-scoring month; March was the home sides' | epl_goals_by_month.csv | data |
| 17 | March 2004 | U06 | Champions League | Hero | hero | Results strip | English clubs won three of the eight groups. None reached the final | ucl_english_clubs.csv | card |
| 18 | March 2004 | L11 | Premier League | Breather | breather | Big number | league games unbeaten from the start of a season, a record | — | card |
| 19 | April 2004 | L12 | Premier League | Hero | hero | Pitch map | Henry scored 30 league goals from 23.9 expected, seven of them in eight April days | epl_top_scorer_shots.csv | card |
| 20 | April 2004 | U07 | Champions League | Comparison | dense | Slope | Two quarter-finals turned round in the second leg, and the holders went out | ucl_ties.csv | card |
| 21 | April 2004 | U08 | Champions League | Comparison | dense | Bars | Monaco had the competition’s two top scorers | ucl_scorers.csv | card |
| 22 | May 2004 | L13 | Premier League | Hero | hero | Results strip | Twenty-six wins, twelve draws, and no defeats | epl_champion_games.csv | data |
| 23 | May 2004 | L14 | Premier League | Comparison | dense | Line race | Three clubs went down on 33 points. Everton stayed up on 39 | epl_race.csv | data |
| 24 | May 2004 | U09 | Champions League | Hero | hero | Pitch map | Porto won the final 3–0 with four shots | ucl_final_shots.csv, ucl_final_team.csv | card |
| 25 | May 2004 | U10 | Champions League | Comparison | dense | Small multiples | Porto lost once in thirteen games. Monaco lost four times and still got there | ucl_finalists_road.csv | card |
| 26 | May 2004 | U11 | Champions League | Breather | breather | Big number | days from Gelsenkirchen to Stamford Bridge | — | card |
| 27 | Season in numbers | L15 | Premier League | Table | dense | Heat table | Home sides won 167 of 380 games. Nobody beat Arsenal anywhere | epl_results_grid.csv | card |
| 28 | Season in numbers | L16 | Premier League | Breather | breather | Big number | league goals, 2.66 a game | — | card |
| 29 | Season in numbers | L17 | Premier League | Comparison | dense | Scatter | Arsenal beat the bookmakers' prices by fourteen points | epl_table_final.csv, epl_upsets.csv | card |
| 30 | Season in numbers | U12 | Champions League | Table | dense | Heat table | Portugal sent two clubs. One of them won it | ucl_countries.csv | card |
| 31 | Season in numbers | U13 | Champions League | Breather | breather | Big number | of the four semi-finalists started in August qualifying | — | card |
| 32 | Season in numbers | U14 | Champions League | Timeline | dense | Bracket | Eight of the fifteen knockout ties came down to one goal or away goals | ucl_ties.csv | card |

## Importing into the Books tab

`plan.json` is a full `planSchema` plan (beats + spreads). Check it with
`pnpm --filter admin exec tsx scripts/checkSeasonPlan.ts ../../vizmaya-data/football-seasons/briefs/2003-04/plan.json 2003`,
then load it into the `2003-04` book (PUT `/api/footshorts/books/2003-04` with `{ revision, title, plan }`, revision from a GET). Sketches are empty:
the chart notes carry the sketch until someone draws one.
