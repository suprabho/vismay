# Premier League 2003–04 — league-level spreads

Design briefs for the Premier League spreads of the 2003–04 season book: 17 spreads, numbered by their place in the book (see [flatplan.md](flatplan.md)). Rendered from [spreads.yaml](spreads.yaml) by `scripts/briefs.py`; edit the YAML, not this file.

Every spread is one claim (the headline) proved by one visual, set on the locked series system ([system.ts](../../../apps/admin/lib/seasonBooks/system.ts), SYSTEM_VERSION 1): 12 × 8 spread grid, accent `#D7372B`, second `#1F5AA6`, muted `#8A8780`, results W ink / D draw-grey / L accent, at most two coloured series, direct labels, a Label-style source line under every chart.

## The competition at a glance

- Champions: **Arsenal**, 26–12–0, 90 points, 11 clear of Chelsea.
- 380 games, 1,012 goals (2.66 a game); the lead changed hands 20 times between 6 clubs, last on 2004-02-01.
- Top scorer: Thierry Henry (Arsenal) 30; then Alan Shearer 22, Louis Saha 20, Ruud van Nistelrooy 20.
- Relegated: Leicester City, Leeds United, Wolverhampton Wanderers (all on 33 points).

| pos | team | P | W | D | L | GF | GA | GD | Pts | status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Arsenal | 38 | 26 | 12 | 0 | 73 | 26 | 47 | 90 | Champions |
| 2 | Chelsea | 38 | 24 | 7 | 7 | 67 | 30 | 37 | 79 | Champions League |
| 3 | Manchester United | 38 | 23 | 6 | 9 | 64 | 35 | 29 | 75 | Champions League |
| 4 | Liverpool | 38 | 16 | 12 | 10 | 55 | 37 | 18 | 60 | Champions League |
| 5 | Newcastle United | 38 | 13 | 17 | 8 | 52 | 40 | 12 | 56 | UEFA Cup |
| 6 | Aston Villa | 38 | 15 | 11 | 12 | 48 | 44 | 4 | 56 |  |
| 7 | Charlton Athletic | 38 | 14 | 11 | 13 | 51 | 51 | 0 | 53 |  |
| 8 | Bolton Wanderers | 38 | 14 | 11 | 13 | 48 | 56 | -8 | 53 |  |
| 9 | Fulham | 38 | 14 | 10 | 14 | 52 | 46 | 6 | 52 |  |
| 10 | Birmingham City | 38 | 12 | 14 | 12 | 43 | 48 | -5 | 50 |  |
| 11 | Middlesbrough | 38 | 13 | 9 | 16 | 44 | 52 | -8 | 48 |  |
| 12 | Southampton | 38 | 12 | 11 | 15 | 44 | 45 | -1 | 47 |  |
| 13 | Portsmouth | 38 | 12 | 9 | 17 | 47 | 54 | -7 | 45 |  |
| 14 | Tottenham Hotspur | 38 | 13 | 6 | 19 | 47 | 57 | -10 | 45 |  |
| 15 | Blackburn Rovers | 38 | 12 | 8 | 18 | 51 | 59 | -8 | 44 |  |
| 16 | Manchester City | 38 | 9 | 14 | 15 | 55 | 54 | 1 | 41 |  |
| 17 | Everton | 38 | 9 | 12 | 17 | 45 | 57 | -12 | 39 |  |
| 18 | Leicester City | 38 | 6 | 15 | 17 | 48 | 65 | -17 | 33 | Relegated |
| 19 | Leeds United | 38 | 8 | 9 | 21 | 40 | 79 | -39 | 33 | Relegated |
| 20 | Wolverhampton Wanderers | 38 | 7 | 12 | 19 | 38 | 77 | -39 | 33 | Relegated |

## Spreads

### 02 · L01 — Nobody beat Arsenal. Thirty-eight games, ninety points, eleven clear

**Season intro** · Season intro (frame) · Line race · kicker “Season intro · Premier League”

**Beat** (record, strength 3): Arsenal went the whole league season unbeaten, 26 wins and 12 draws, and won it by 11 points.

**Headline** — Nobody beat Arsenal. Thirty-eight games, ninety points, eleven clear

**Stat** — 26–12–0 · Arsenal’s league record: won, drawn, lost

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
- Books-tab binding: `points-race`, teams Arsenal, Chelsea, Man United, Liverpool
- Encode: x = game number 1–38; y = cumulative points 0–90. One line per club.
- Highlight: Arsenal in accent, Chelsea in second; Manchester United and Liverpool labelled in muted; the other 16 clubs as 0.5pt muted context lines, unlabelled.
- Notes: The chart every later league spread zooms into; keep its scale (0–90) wherever the race returns.
- Annotate: Game 30, 28 March: “30 unbeaten from the start, a record” (1–1 v Manchester United).
- Annotate: Game 34, 25 April: title won at White Hart Lane, four games left.
- Annotate: {'Final point labels at the line end': 'Arsenal 90, Chelsea 79, Man United 75, Liverpool 60.'}

**Body** (105 words)

> Six clubs led the Premier League in 2003-04 and the lead changed hands twenty times, most of them before February. After the first of February it never moved again. Arsenal took 45 points from their first nineteen games and 45 from their last nineteen, won 26, drew 12 and lost none, the first unbeaten top-flight season in England since Preston in 1888-89. Behind them Chelsea, rebuilt with Roman Abramovich's money, finished second on 79; Manchester United, top at halfway, fell to third. In Europe the season belonged to clubs nobody had tipped: Porto beat Monaco in the final. This book follows both, month by month.

**Caption** — Cumulative league points after each game, every club. Arsenal and Chelsea highlighted; Manchester United and Liverpool labelled.

**Source line** — Source: football-data.co.uk results; points 3/1/0.

**Design notes**

- Chart region spans the right page (x 6.5–12, y 0–6.75); headline over 2.5 rows at 1.15× Headline.
- The 16 context lines are one muted group; no legend, direct labels only at the line ends of the four named clubs.
- Draw the two annotation leaders at 0.5pt to the Arsenal line; captions in Caption style.

**Check before print**

- [ ] “First unbeaten top-flight season since Preston 1888–89” is not in our data: confirm wording against a published source.

### 03 · L02 — Chelsea spent two and a half times what the rest of the league did

**August 2003** · Hero (hero) · Bars · kicker “August · Transfers”

**Beat** (people, strength 3): Chelsea, bought by Roman Abramovich in July, spent £107.8m on nine £5m-plus signings before September.

**Headline** — Chelsea spent two and a half times what the rest of the league did

**Stat** — £107.8m · Chelsea’s nine £5m-plus signings, July to 1 September

**Chart**

- Data: [`epl_summer_signings.csv`](data/epl_summer_signings.csv)
- Encode: One horizontal bar per club that made a £5m-plus signing, length = total fee (£m). Chelsea’s bar is segmented by player, largest first.
- Highlight: Chelsea in accent with player names on the segments (Duff 17.0, Crespo 16.8, Makélélé 16.6, Mutu 15.8, Verón 15.0, Geremi 7.0, Bridge 7.0, Joe Cole 6.6, Glen Johnson 6.0). Other clubs in muted.
- Notes: Order bars by total. Manchester United 18.24 (Ronaldo 12.24, Kléberson 6.0), Blackburn 7.5, Tottenham 6.25, Birmingham 5.5, Liverpool 5.0.
- Annotate: A bracket under the five muted bars: “the other 19 clubs together: £42.5m”.

**Body** (109 words)

> Roman Abramovich bought Chelsea in July 2003, and by the time the transfer window shut the club had signed nine players for £5m or more: Damien Duff, Hernán Crespo, Claude Makélélé, Adrian Mutu, Juan Sebastián Verón and four more. Together they cost £107.8m. Every other Premier League club put together made six signings of that size, for £42.5m, and the biggest of those was Manchester United's £12.24m for an 18-year-old from Sporting called Cristiano Ronaldo. Claudio Ranieri, who had finished fourth the season before, now had two players for most positions. The money bought second place, 79 points, and a Champions League semi-final. It did not buy the title.

**Caption** — Total fees paid for £5m-plus signings, 1 June to 1 September 2003, by Premier League club. Chelsea's bar is split into its nine signings.

**Source line** — Source: Wikipedia, List of English football transfers summer 2003 (reported fees); £5m-plus moves only.

**Design notes**

- Bars run left to right across the gutter in the chart region (x 3.75–12); keep Chelsea’s bar first and full-width so the rest look small at the same scale.
- Segment labels inside Chelsea’s bar in Label style, ink on accent at 100% would fail contrast — set them paper on accent.
- Stat in Numerals at 54pt in the left column under the headline.

**Check before print**

- [ ] Fees are as reported at the time and Wikipedia's list only holds deals at or above about £5m; say “£5m-plus signings” every time, never “spending”.
- [ ] Abramovich's purchase date (July 2003) comes from events.csv, which is not hand-verified yet.

### 06 · L03 — Old Trafford held four Loftus Roads

**September 2003** · Comparison (dense) · Bars · kicker “September · Crowds”

**Beat** (other, strength 1): Old Trafford averaged 67,641 a game, four times the crowd Fulham drew at Loftus Road.

**Headline** — Old Trafford held four Loftus Roads

**Stat** — 67,641 · Manchester United’s average home league crowd

**Chart**

- Data: [`epl_table_final.csv`](data/epl_table_final.csv)
- Encode: Twenty horizontal bars, average home attendance, largest first, split across the two pages (1–10 left, 11–20 right) on one shared scale.
- Highlight: Manchester United in accent, Fulham in second; all others muted.
- Notes: Top: Man United 67,641, Newcastle 51,440, Man City 46,834 (first season at the City of Manchester Stadium). Bottom: Fulham 16,342, Portsmouth 20,108, Blackburn 24,376.
- Annotate: Fulham: 16,342 at Loftus Road, the ground they shared while Craven Cottage was rebuilt.

**Body** (90 words)

> Manchester United averaged 67,641 at Old Trafford, more than four times the 16,342 Fulham drew at Loftus Road, the Queens Park Rangers ground they rented while Craven Cottage was rebuilt. The gap was about more than demand. Newcastle (51,440) and Manchester City (46,834, in their first season at the new City of Manchester Stadium) had the room; Arsenal, the champions, played to 38,079 at Highbury, seventh in the league. Portsmouth, promoted, squeezed 20,108 into Fratton Park. Across the season the Premier League drew about 13.3 million people to 380 games.

**Caption** — Average home league attendance, 2003-04, all twenty clubs, on one scale across both pages.

**Source line** — Source: worldfootball.net via Wikipedia, 2003–04 FA Premier League.

**Design notes**

- Split the ranking at the gutter, not by size; keep the scale identical on both pages so Fulham’s bar is visibly a quarter of United’s.
- Value labels at the bar end, tabular numerals.

**Check before print**

- [ ] Fulham's ground share at Loftus Road (2002–04) and City's first season at the new stadium are not in our data; confirm.
- [ ] The 13.3 million total is avg_attendance × 19 summed over the Wikipedia table (13,297,359).

### 07 · L04 — Until Christmas, first and third were never more than five points apart

**October 2003** · Hero (hero) · Line race · kicker “October · The title race”

**Beat** (title-race, strength 2): Until Christmas, first and third in the Premier League were never more than five points apart.

**Headline** — Until Christmas, first and third were never more than five points apart

**Stat** — 5 · Biggest gap from first to third, September to December

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv), [`epl_leader_by_date.csv`](data/epl_leader_by_date.csv)
- Books-tab binding: `points-race`, teams Arsenal, Chelsea, Man United
- Encode: The intro’s race cropped to 16 August – 31 December (games 1–19); y from 0 to 50 so the three lines separate.
- Highlight: Arsenal accent, Chelsea second, Manchester United ink at 0.75pt with a direct label (the third series stays un-coloured, per the chart style).
- Notes: The preset draws the whole season; crop to games 1–19 in the layout, not the data.
- Annotate: Shade the band between the top and third line; label its widest point (5 points).
- Annotate: 21 Sep: Manchester United 0–0 Arsenal at Old Trafford (Vieira sent off, Van Nistelrooy missed a late penalty).

**Body** (111 words)

> For four months the title was a three-way argument. Between September and the end of December the gap between the leaders and the club in third never grew beyond five points, and the top spot changed hands ten times. Chelsea went top in September after Abramovich's new signings won six of their first nine; Manchester United led at Christmas; Arsenal, who drew 0-0 at Old Trafford in September in a game remembered for the fight at the end, were never out of the top two. The FA fined Arsenal £175,000 for that afternoon, the largest fine it had given a club. Nobody yet thought the season would end without Arsenal losing.

**Caption** — Cumulative points, games 1–19, the top three. The shaded band is the gap from first to third.

**Source line** — Source: football-data.co.uk; standings by date, 3/1/0, ties on GD then GF.

**Design notes**

- Same line weights and colours as the intro race so the reader recognises the zoom.
- The shaded band in draw-grey at 30%, under the lines.

**Check before print**

- [ ] The £175,000 fine is from events.csv (not yet hand-verified).

### 08 · L05 — Liverpool shot more than anyone and finished 30 points behind

**October 2003** · Comparison (dense) · Scatter · kicker “October · Shooting”

**Beat** (other, strength 1): Liverpool took more league shots than anyone, 558, and finished 30 points behind Arsenal.

**Headline** — Liverpool shot more than anyone and finished 30 points behind

**Stat** — 558 · Liverpool’s league shots, the most of any club

**Chart**

- Data: [`epl_table_final.csv`](data/epl_table_final.csv)
- Encode: Left page: x = shots, y = goals, one dot per club. Right page: the same clubs ranked by goals per shot on target (bars).
- Highlight: Liverpool accent, Arsenal second; the other 18 muted with direct labels for the extremes only (Birmingham fewest shots 328; Bolton and Southampton lowest conversion 0.166).
- Notes: Chelsea had the best goals per shot on target (0.275), Arsenal next (0.267).
- Annotate: Liverpool: 558 shots, 300 on target, 55 goals. Arsenal: 471 shots, 273 on target, 73 goals.

**Body** (94 words)

> Liverpool took 558 league shots in 2003-04, more than any other club and 87 more than Arsenal. They put 300 on target, also the most. They scored 55. Arsenal scored 73 from 273 on target, a goal for every 3.7, against Liverpool's one in 5.5. Only Chelsea converted better. At the other end, Bolton took 533 shots, the second-highest total, and scored 48. Gérard Houllier's side finished fourth, 30 points behind the champions, and he was sacked in May. The numbers are a reminder that shooting a lot and shooting well are different things.

**Caption** — Shots and goals for every club (left), and goals per shot on target (right). Liverpool and Arsenal highlighted.

**Source line** — Source: football-data.co.uk match statistics.

**Design notes**

- One visual in two halves per the comparison template; the scatter axes start at zero.
- Dot labels in Label style, placed to avoid the leader lines.

**Check before print**

- [ ] Houllier's sacking (24 May 2004) is from events.csv.

### 11 · L06 — At halfway four points covered the top three. By May it was fifteen

**December 2003** · Hero (hero) · Slope · kicker “December · Halfway”

**Beat** (turning-point, strength 2): At halfway four points covered the top three, with Manchester United first; by May it was fifteen and United were third.

**Headline** — At halfway four points covered the top three. By May it was fifteen

**Stat** — 4 → 15 · Points from first to third, after 19 games and after 38

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
- Encode: Slope chart, left axis = table position after each club’s 19th game, right axis = final position. One line per club, all twenty.
- Highlight: Manchester United (1st → 3rd) in accent, Arsenal (2nd → 1st) in second; Everton (11th → 17th, the biggest fall) labelled in ink.
- Notes: The position at game 19 is each club's own 19th game, so clubs are compared at the same number of games.
- Annotate: Points at halfway: United 46, Arsenal 45, Chelsea 42.
- Annotate: Biggest climbs: Aston Villa 10th → 6th, Bolton 12th → 8th, Tottenham 18th → 14th.

**Body** (112 words)

> After nineteen games, half a season, Manchester United were top on 46 points, one ahead of Arsenal and four ahead of Chelsea. It was the closest the top three would be all year. Over the second half Arsenal took exactly what they had taken in the first, 45 points, Chelsea took 37 and United 29. By May the gap from first to third was fifteen points. Further down, the table moved less than it felt: Leeds and Wolves were in the bottom three at halfway and finished there, with Leicester one place above them. The biggest fall was Everton's, from eleventh to seventeenth, the biggest climb Aston Villa's, from tenth to sixth.

**Caption** — League position after each club's 19th game (left) and final position (right), all twenty clubs.

**Source line** — Source: football-data.co.uk; standings by date, 3/1/0.

**Design notes**

- Twenty lines is the limit for a slope; keep the 17 context lines at 0.5pt muted and push labels to the outer margins.
- Club names on both axes in Label style, positions in tabular numerals.

### 13 · L07 — United took 2.27 points a game before Ferdinand's ban and 1.56 after it

**January 2004** · Hero (hero) · Results strip · kicker “January · Manchester United”

**Beat** (collapse, strength 3): United took 2.27 points a game before Rio Ferdinand's eight-month ban began on 20 January and 1.56 after it.

**Headline** — United took 2.27 points a game before Ferdinand's ban and 1.56 after it

**Stat** — 1.56 · United’s points per game from 20 January, down from 2.27

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
- Books-tab binding: `results-strip`, teams Man United
- Encode: United’s 38 league results as one strip, game by game, W ink / D draw-grey / L accent; a thin running points-per-game line above it.
- Highlight: A vertical rule at 20 January, labelled “Ferdinand’s ban begins”; the two ppg values set in Stat beside each half.
- Notes: The split falls between game 22 (17 Jan, Wolves 1–0 United) and game 23.
- Annotate: Before: 22 games, 50 points, 15 conceded. After: 16 games, 25 points, 20 conceded.

**Body** (113 words)

> Rio Ferdinand missed a drugs test on 22 September. In December the FA banned him for eight months, and the ban began on 20 January. Up to then Manchester United had taken 50 points from 22 league games, 2.27 a game, and conceded 15. From then on they took 25 from 16, 1.56 a game, and conceded 20. Ferdinand was not the only reason. Ruud van Nistelrooy scored 20 league goals but the side around him was changing, and Arsenal and Chelsea were simply better over the spring. But the line on this strip is where United's title defence turned into a race for third. They won the FA Cup in May instead.

**Caption** — Manchester United's league results in order, with points per game before and after Rio Ferdinand's ban began on 20 January 2004.

**Source line** — Source: football-data.co.uk; ban date from contemporary reports.

**Design notes**

- Strip cells sized so 38 fit the chart region width (x 3.75–12); the rule at the split in ink 0.5pt.
- Don't colour the halves differently; the results colours already carry it.

**Check before print**

- [ ] Ban start date 20 January 2004 is from contemporary reports, not our data; events.csv only has the 19 December hearing.
- [ ] Correlation, not cause — the body says so; keep it.

### 14 · L08 — United went into February top, a point ahead of Arsenal with a game more played

**January 2004** · Table (dense) · Table · kicker “January · The table”

**Beat** (collapse, strength 3): United took 2.27 points a game before Rio Ferdinand's eight-month ban began on 20 January and 1.56 after it.

**Headline** — United went into February top, a point ahead of Arsenal with a game more played

**Stat** — 53 · Manchester United’s points after 23 games, 31 January

**Chart**

- Data: [`epl_month_tables.csv`](data/epl_month_tables.csv)
- Books-tab binding: `month-table`, month 2004-01
- Encode: The full table at 31 January, 20 rows, columns P W D L GF GA GD Pts.
- Highlight: United’s row in accent, Arsenal’s in second; the zero in Arsenal's L column set in Stat weight.
- Notes: The last month-end United led; by the end of February Arsenal were nine clear.
- Annotate: Arsenal: 22 played, 15–7–0. United: 23 played, 17–2–4.

**Body** (109 words)

> At the end of January, Manchester United were top of the league on 53 points from 23 games. Arsenal were a point behind with a game in hand and still had a nought in the defeats column after 22. Chelsea were six further back. It was the last time United would lead at the end of a month. Ferdinand's ban had begun eleven days earlier; Arsenal had signed José Antonio Reyes from Sevilla for £10.5m. Over the next four weeks Arsenal won all five of their league games and United took five points from four. By the end of February the gap was nine points, the other way round.

**Caption** — Premier League table at 31 January 2004.

**Source line** — Source: football-data.co.uk; 3/1/0, ties on GD then GF.

**Design notes**

- Table on the right page full height; tabular numerals, rules only every five rows.
- Bottom three rows in draw-grey.

**Check before print**

- [ ] Reyes fee (£10.5m) from events.csv.

### 15 · L09 — Six clubs led the table. After 1 February, only Arsenal did

**February 2004** · Hero (hero) · Results strip · kicker “February · The lead”

**Beat** (title-race, strength 3): Six clubs led the Premier League in 2003-04, the lead changed hands 20 times, and after 1 February only Arsenal led.

**Headline** — Six clubs led the table. After 1 February, only Arsenal did

**Stat** — 20 · Times the lead changed hands, all before 1 February

**Chart**

- Data: [`epl_leader_by_date.csv`](data/epl_leader_by_date.csv)
- Encode: A ribbon of the 97 match dates, 16 August → 15 May, each cell coloured by the club top of the table that night.
- Highlight: Arsenal’s cells in accent, Chelsea’s in second, United’s in ink; Blackburn, Manchester City and Portsmouth (August only) in muted with labels.
- Notes: Cells are match dates, not calendar days; the days-at-the-top counts are calendar days between match dates.
- Annotate: A rule at 1 February: “the last change at the top”.
- Annotate: Days at the top: Arsenal 215, Manchester United 30, Chelsea 19, Blackburn 7, Man City 1, Portsmouth 1.

**Body** (104 words)

> In the first two weeks of the season Blackburn, Manchester City and Portsmouth all spent a night at the top of the Premier League. By the end of the season six clubs had led it, and the lead had changed hands twenty times. Arsenal and Chelsea swapped it through the autumn; Manchester United held it for most of December and January. On 1 February Arsenal beat Manchester City 2-1 at Highbury and went top again. Nobody else led for the rest of the season. From that day the story stopped being who would win the league and became whether Arsenal could finish it unbeaten.

**Caption** — The club top of the Premier League after each matchday, 2003-04. Each cell is one match date.

**Source line** — Source: football-data.co.uk; standings by date, 3/1/0, ties on GD then GF.

**Design notes**

- Ribbon is one row of 97 cells across the chart region, 8–10mm tall; labels for the August leaders sit above the cells.
- The calendar-days counts as a small Label-style key under the ribbon, ordered by days.

### 16 · L10 — February was the season's highest-scoring month; March was the home sides'

**February 2004** · Comparison (dense) · Bars · kicker “February · Goals”

**Beat** (other, strength 1): February was the season's highest-scoring month at 3.21 goals a game, and in March home sides won 22 of 34.

**Headline** — February was the season's highest-scoring month; March was the home sides'

**Stat** — 3.21 · Goals per game in February 2004

**Chart**

- Data: [`epl_goals_by_month.csv`](data/epl_goals_by_month.csv)
- Books-tab binding: `goals-by-month`
- Encode: Left: goals per game by month, August → May (10 bars). Right: home-win share by month (10 bars), same months.
- Highlight: February in accent on the left, March in accent on the right; other months muted.
- Notes: Months with fewer matches (September 30, March 34) swing more; say so in the caption.
- Annotate: Season average 2.66 goals a game: a 0.5pt reference line across the left bars.
- Annotate: March: home sides won 22 of 34 (64.7%); the season average was 43.9%.

**Body** (105 words)

> The 380 league games produced 1,012 goals, 2.66 a game, but the months were not alike. October was the tightest, at 2.22 a game. February was the loosest: 125 goals in 39 matches, 3.21 a game, including Tottenham 4 Leicester 4. March was the odd month for a different reason. Home sides won 22 of its 34 games, almost two in three, when across the season they won fewer than half. None of this explains a title or a relegation, but it is the texture of a season, the weeks when every game seemed to finish 3-2 and the weeks when nobody could win away.

**Caption** — Goals per game (left) and share of games won by the home side (right), by month. September (30 games) and March (34) are small samples.

**Source line** — Source: football-data.co.uk.

**Design notes**

- Two bar charts sharing one month axis across the gutter; same bar width both sides.

### 18 · L11 — 30 league games unbeaten from the start of a season, a record

**March 2004** · Breather (breather) · Big number · kicker “March”

**Beat** (record, strength 3): Arsenal went the whole league season unbeaten, 26 wins and 12 draws, and won it by 11 points.

**Headline** — league games unbeaten from the start of a season, a record

**Stat** — 30 · Arsenal’s unbeaten start, reached on 28 March (1–1 v Manchester United)

**Chart**

- Notes: Big number only.

**Caption** — The thirtieth was a 1–1 draw with Manchester United at Highbury on 28 March 2004.

**Source line** — Source: football-data.co.uk; record per events.csv.

**Design notes**

- Photo-style left page; brief a flat illustration of an empty Highbury clock end at dusk, no people.

**Check before print**

- [ ] The record claim (30 from the start of a season) is from events.csv; confirm the previous best before print.

### 19 · L12 — Henry scored 30 league goals from 23.9 expected, seven of them in eight April days

**April 2004** · Hero (hero) · Pitch map · kicker “April · Thierry Henry”

**Beat** (record, strength 3): Thierry Henry scored 30 league goals from 23.9 expected, seven of them in eight days of April.

**Headline** — Henry scored 30 league goals from 23.9 expected, seven of them in eight April days

**Stat** — 30 · League goals, from 194 shots worth 23.9 xG

**Chart**

- Data: [`epl_top_scorer_shots.csv`](data/epl_top_scorer_shots.csv)
- Encode: Half-pitch shot map (StatsBomb 120 × 80, attacking right), every Henry league shot; dot area = xG, filled = goal, open = no goal.
- Highlight: Goals filled in accent; the seven April goals (3 v Liverpool 9 Apr, 4 v Leeds 16 Apr) ringed in second.
- Notes: Coordinates are from the shooting team’s view; flip nothing.
- Annotate: 7 penalties, 3 direct free kicks, 20 from open play.
- Annotate: Next best in the league: Shearer 22, Saha and Van Nistelrooy 20.

**Body** (110 words)

> Thierry Henry took 194 league shots in 2003-04, worth 23.9 expected goals by StatsBomb's model, and scored 30. Seven were penalties and three free kicks; twenty came from open play. No one else in the league scored more than Alan Shearer's 22. Henry's April was the season in miniature. On Good Friday, 9 April, Liverpool led twice at Highbury and he scored a hat-trick; a week later he scored four against Leeds. Seven goals in eight days, as Arsenal came out of a fortnight in which they had gone out of the FA Cup and the Champions League. He was voted the footballer of the year by players and writers.

**Caption** — Every league shot by Thierry Henry in 2003-04. Dot size is the chance's expected-goals value; filled dots are goals; ringed dots came in April.

**Source line** — Source: StatsBomb open data (Arsenal 2003/04); goals cross-checked with Wikipedia. StatsBomb logo and credit required.

**Design notes**

- Pitch in rule colour on paper, half-pitch only, across the chart region; dot area ∝ xG with a three-dot size key in Label style.
- StatsBomb logo bottom right of the chart region, per their licence.

**Check before print**

- [ ] Arsenal's FA Cup semi-final defeat (3 Apr, Manchester United) is not in our data; the Champions League exit (6 Apr) is.

### 22 · L13 — Twenty-six wins, twelve draws, and no defeats

**May 2004** · Hero (hero) · Results strip · kicker “May · The Invincibles”

**Beat** (record, strength 3): Arsenal went the whole league season unbeaten, 26 wins and 12 draws, and won it by 11 points.

**Headline** — Twenty-six wins, twelve draws, and no defeats

**Stat** — 0 · League defeats, Arsenal 2003–04

**Chart**

- Data: [`epl_champion_games.csv`](data/epl_champion_games.csv)
- Books-tab binding: `results-strip`, teams Arsenal
- Encode: Arsenal’s 38 results as one strip (W ink, D draw-grey; no accent cells at all). Under each cell, a pair of thin bars for StatsBomb xG for and against.
- Highlight: The five games Arsenal trailed at half-time get a small accent tick (Man City, Tottenham, Liverpool, Portsmouth, Leicester); they took 13 of 15 points from them.
- Notes: The strip has no loss colour in it at all; that absence is the chart.
- Annotate: Underdogs by the bookmakers three times: at Old Trafford (27% win chance), Anfield (36%), Stamford Bridge (36%). Drew one, won two.
- Annotate: xG over the season: 60.9 for, 30.9 against.

**Body** (104 words)

> Arsenal finished the 2003-04 league season with 26 wins, 12 draws and no defeats, 73 goals scored and 26 conceded. They were behind at half-time five times and took 13 points from those games. They went to Old Trafford, Anfield and Stamford Bridge as the bookmakers' underdogs and lost none of the three. Their expected goals, by StatsBomb's model, came to 60.9 for and 30.9 against, a side that made twice the chances it allowed. The last game, 2-1 against Leicester on 15 May, came from a goal down. The next day more than 250,000 people lined the streets of Islington for the parade.

**Caption** — Arsenal's 38 league results in order. Bars under each result show expected goals for (up) and against (down); ticks mark games they trailed at half-time.

**Source line** — Source: football-data.co.uk results and odds; StatsBomb open data (xG). StatsBomb logo and credit required.

**Design notes**

- The same strip cell size as L07 and U06; the xG bars hang from a hairline baseline under the strip.
- Bookmaker notes as Caption-style annotations on the three underdog games.

**Check before print**

- [ ] The parade figure (250,000) is from events.csv.

### 23 · L14 — Three clubs went down on 33 points. Everton stayed up on 39

**May 2004** · Comparison (dense) · Line race · kicker “May · Relegation”

**Beat** (survival, strength 2): Leicester, Leeds and Wolves all went down on 33 points while Everton survived on 39.

**Headline** — Three clubs went down on 33 points. Everton stayed up on 39

**Stat** — 33 · Points for Leicester, Leeds and Wolves, all relegated

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
- Books-tab binding: `points-race`, teams Everton, Man City, Leicester, Leeds, Wolves, Tottenham
- Encode: Left page: the bottom six’s cumulative points, games 1–38, y 0–45. Right page: the same six, home points against away points (paired bars).
- Highlight: The three relegated clubs share accent (one series, labelled individually at the line end); Everton in second; Manchester City and Tottenham muted.
- Notes: The three relegated lines finish on the same point; stagger their end labels.
- Annotate: Wolves won none of their 19 away games (D7 L12).
- Annotate: Leeds conceded 79, the most in the league.

**Body** (101 words)

> Leicester, Leeds and Wolverhampton Wanderers all finished on 33 points and all went down. Leicester and Wolves had been promoted the summer before; Leeds, a Champions League semi-finalist three years earlier, were sinking under debt, sacked Peter Reid in November and conceded 79 goals, the most in the league. Wolves did not win a single away game. Leicester drew fifteen times, more than anyone except Newcastle. Above them, Everton slid from eleventh at halfway to seventeenth and survived on 39, six clear; Manchester City, top for one night in August, finished sixteenth. Portsmouth, the third promoted club, stayed up in thirteenth.

**Caption** — Cumulative points for the bottom six (left); home and away points for the same clubs (right).

**Source line** — Source: football-data.co.uk.

**Design notes**

- The relegated three as one accent series breaks the two-highlight rule only if they get separate colours; keep them one colour and separate them with end labels.

**Check before print**

- [ ] Leeds' 2001 Champions League semi-final is outside this season's data; confirm.

### 27 · L15 — Home sides won 167 of 380 games. Nobody beat Arsenal anywhere

**Season in numbers** · Table (dense) · Heat table · kicker “Season in numbers · Every league result”

**Beat** (other, strength 1): Home sides won 167 of the 380 league games, and nobody beat Arsenal home or away.

**Headline** — Home sides won 167 of 380 games. Nobody beat Arsenal anywhere

**Stat** — 43.9% · Share of league games won by the home side

**Chart**

- Data: [`epl_results_grid.csv`](data/epl_results_grid.csv)
- Encode: 20 × 20 grid, home club down the side, away club across the top, in final-table order; each cell the score, filled by result (home win ink, draw draw-grey, away win accent).
- Highlight: Arsenal’s row and column outlined in second; no other highlight.
- Notes: The diagonal is empty.
- Annotate: Totals: 167 home wins, 108 draws, 105 away wins.

**Body** (93 words)

> Every one of the season's 380 league games is on the right-hand page. Read across a row for a club's home results, down a column for its away results. Home sides won 167, there were 108 draws and the away side won 105. Arsenal's row is the only one with no away-win colour in it, and their column the only one with no home-win colour. Wolves' column, their away games, has no away win in it at all. Arsenal won 15 home games and drew 4; Manchester United and Chelsea won 12 each.

**Caption** — All 380 Premier League results. Home club down the side, away club across the top, both in final-table order.

**Source line** — Source: football-data.co.uk.

**Design notes**

- The grid fills the right page (x 6.5–12, y 0–7.25); cells about 8mm square, scores in 6.5pt tabular numerals.
- Team names abbreviated to three letters on the top axis.

**Check before print**

- [ ] Home-win counts (Arsenal 15, Man United and Chelsea 12) recounted from epl_results_grid.csv.

### 28 · L16 — 1,012 league goals, 2.66 a game

**Season in numbers** · Breather (breather) · Big number · kicker “Season in numbers”

**Beat** (other, strength 1): Home sides won 167 of the 380 league games, and nobody beat Arsenal home or away.

**Headline** — league goals, 2.66 a game

**Stat** — 1,012 · Premier League goals in 2003–04

**Chart**

- Notes: Big number only.

**Caption** — The first goal was Paul Dickov's for Leicester against Southampton on 16 August; the last Shaun Wright-Phillips' for Manchester City against Everton on 15 May.

**Source line** — Source: football-data.co.uk; first and last goals from Wikipedia.

**Design notes**

- Photo-style left page; brief a flat illustration of a goal net, no people.

### 29 · L17 — Arsenal beat the bookmakers' prices by fourteen points

**Season in numbers** · Comparison (dense) · Scatter · kicker “Season in numbers · Against the odds”

**Beat** (other, strength 1): Arsenal took 14 more points than the bookmakers' prices implied and Manchester City about 10 fewer.

**Headline** — Arsenal beat the bookmakers' prices by fourteen points

**Stat** — +14 · Arsenal’s points above what Bet365’s odds implied

**Chart**

- Data: [`epl_table_final.csv`](data/epl_table_final.csv), [`epl_upsets.csv`](data/epl_upsets.csv)
- Encode: Left: x = points implied by pre-match odds, y = actual points, all 20 clubs, with a 45° line (did as expected). Right: the season’s five biggest upsets as a ranked list with the implied win chance.
- Highlight: Arsenal in accent, Manchester City in second; others muted, labelled only beyond ±5.
- Notes: Expected points = 3 × P(win) + P(draw) per game from Bet365 odds with the margin removed, summed.
- Annotate: Above the line: Arsenal +14.0, Bolton +8.6. Below: Man City −9.9, Leeds −9.7, Everton −9.0.
- Annotate: Biggest upset: Manchester United 2–3 Middlesbrough, 11 February (Middlesbrough 8.5%).

**Body** (95 words)

> Bookmakers set a price on every game, and the prices add up to a forecast. Take the margin out of Bet365's odds for each of Arsenal's 38 games and they implied about 76 points; Arsenal took 90. Bolton, under Sam Allardyce, beat their prices by almost nine. At the other end Manchester City, Leeds and Everton each fell about ten points short of what the market expected of them. The biggest single upset by the odds was Middlesbrough's 3-2 win at Old Trafford in February, a result the prices gave less than a one-in-eleven chance.

**Caption** — Points implied by pre-match odds against points won (left); the five least likely wins of the season (right).

**Source line** — Source: football-data.co.uk (Bet365 odds), margin removed by normalising the three implied probabilities.

**Design notes**

- The 45° line in rule colour; label it “as the odds expected” in Caption style.
