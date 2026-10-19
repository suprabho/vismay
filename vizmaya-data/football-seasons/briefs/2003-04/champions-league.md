# Champions League 2003–04 — cup-level spreads

Design briefs for the Champions League spreads of the 2003–04 season book: 14 spreads, numbered by their place in the book (see [flatplan.md](flatplan.md)). Rendered from [spreads.yaml](spreads.yaml) by `scripts/briefs.py`; edit the YAML, not this file.

Every spread is one claim (the headline) proved by one visual, set on the locked series system ([system.ts](../../../apps/admin/lib/seasonBooks/system.ts), SYSTEM_VERSION 2): 12 × 8 spread grid, accent `#D7372B`, second `#1F5AA6`, muted `#8A8780`, results W ink / D draw-grey / L accent, at most two coloured series, direct labels, a Label-style source line under every chart.

## The competition at a glance

- Winners: **Porto**, 3-0 against Monaco in the final (2004-05-26).
- 72 clubs from 48 countries; 205 matches, 505 goals.
- Top scorer: Fernando Morientes (Monaco) 9; then Dado Pršo 7, Roy Makaay 6, Walter Pandiani 6.

**Stages**

| stage | clubs | matches | goals | goals_per_game | home_win_pct |
|---|---|---|---|---|---|
| First qualifying round | 20 | 20 | 40 | 2.0 | 65.0 |
| Second qualifying round | 28 | 28 | 80 | 2.86 | 46.4 |
| Third qualifying round | 32 | 32 | 76 | 2.38 | 50.0 |
| Group stage | 32 | 96 | 238 | 2.48 | 52.1 |
| Round of 16 | 16 | 16 | 29 | 1.81 | 50.0 |
| Quarter-finals | 8 | 8 | 30 | 3.75 | 62.5 |
| Semi-finals | 4 | 4 | 9 | 2.25 | 25.0 |
| Final | 2 | 1 | 3 | 3.0 | 100.0 |

**Knockout ties**

| stage | team_a | team_b | leg1 | leg2 | agg | winner | decided_by |
|---|---|---|---|---|---|---|---|
| R16 | Lokomotiv Moscow | Monaco | 2-1 | 0-1 | 2-2 | Monaco | away goals |
| R16 | Sparta Prague | AC Milan | 0-0 | 1-4 | 1-4 | AC Milan | aggregate |
| R16 | Celta Vigo | Arsenal | 2-3 | 0-2 | 2-5 | Arsenal | aggregate |
| R16 | Bayern Munich | Real Madrid | 1-1 | 0-1 | 1-2 | Real Madrid | aggregate |
| R16 | Real Sociedad | Lyon | 0-1 | 0-1 | 0-2 | Lyon | aggregate |
| R16 | Porto | Manchester United | 2-1 | 1-1 | 3-2 | Porto | aggregate |
| R16 | VfB Stuttgart | Chelsea | 0-1 | 0-0 | 0-1 | Chelsea | aggregate |
| R16 | Deportivo La Coruña | Juventus | 1-0 | 1-0 | 2-0 | Deportivo La Coruña | aggregate |
| QF | Porto | Lyon | 2-0 | 2-2 | 4-2 | Porto | aggregate |
| QF | AC Milan | Deportivo La Coruña | 4-1 | 0-4 | 4-5 | Deportivo La Coruña | aggregate |
| QF | Real Madrid | Monaco | 4-2 | 1-3 | 5-5 | Monaco | away goals |
| QF | Chelsea | Arsenal | 1-1 | 2-1 | 3-2 | Chelsea | aggregate |
| SF | Monaco | Chelsea | 3-1 | 2-2 | 5-3 | Monaco | aggregate |
| SF | Porto | Deportivo La Coruña | 0-0 | 1-0 | 1-0 | Porto | aggregate |
| final | Porto | Monaco | 3-0 |  | 3-0 | Porto | single match |

## Spreads

### 04 · U01 — Forty ties to fill sixteen places, and Newcastle lost theirs on penalties

**August 2003** · Timeline (dense) · Timeline · kicker “August · Champions League qualifying”

**Beat** (europe, strength 2): Newcastle won in Belgrade and still went out of the Champions League in August, on penalties at home to Partizan.

**Headline** — Forty ties to fill sixteen places, and Newcastle lost theirs on penalties

**Stat** — 4–3 · Partizan’s shoot-out win at St James’ Park, 19 August

**Chart**

- Data: [`ucl_ties.csv`](data/ucl_ties.csv), [`ucl_matches.csv`](data/ucl_matches.csv)
- Encode: Three lanes, one per qualifying round (Q1 16–23 Jul, Q2 30 Jul–6 Aug, Q3 12–20 Aug), on a shared date axis 16 July → 20 August. Each tie is a short bar from first-leg to second-leg date; the winner’s name sits at the bar end.
- Highlight: Newcastle–Partizan in accent; Chelsea–Žilina (5–0 on aggregate) in second. Ties settled on penalties or away goals marked with a small open circle.
- Notes: 10 + 14 + 16 = 40 ties; the 16 Q3 winners join the 16 clubs that went straight into the groups.
- Annotate: Q3: Partizan 0–1 Newcastle, Newcastle 0–1 Partizan, 4–3 on penalties.
- Annotate: Partizan also needed away goals to get past Djurgården in Q2.

**Body** (101 words)

> The Champions League began on 16 July, a month before the Premier League, with twenty champions of Europe's smaller leagues. By 20 August forty ties had been played and sixteen clubs had won a place in the group stage. Newcastle United, third in England the season before, were one of the casualties. They won 1-0 in Belgrade, lost 1-0 at home to Partizan and went out 4-3 on penalties. Partizan had already needed away goals to beat Djurgården in the previous round. Chelsea, fourth the season before, came through the same round 5-0 against Žilina, and went on to the semi-finals.

**Caption** — Every qualifying tie, July and August 2003, by round. Bars run from first leg to second leg; circles mark ties settled on penalties or away goals.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- Lanes take the chart band (y 2.75–5.5) across both pages; dates as Label-style ticks every week.
- 40 bars is dense; keep winner labels only on Q3 and on the highlighted ties, muted dots elsewhere.

**Check before print**

- [ ] Partizan's away-goals win over Djurgården (3–3) and the shoot-outs are from engsoccerdata's pens column; spot-check against UEFA.

### 05 · U02 — Seventy-two clubs from 48 countries started. By September, 32 were left

**September 2003** · Hero (hero) · Bars · kicker “September · Champions League”

**Beat** (europe, strength 2): Seventy-two clubs from 48 countries entered the Champions League in July; 32 reached the group stage in September.

**Headline** — Seventy-two clubs from 48 countries started. By September, 32 were left

**Stat** — 72 · Clubs that played in the 2003–04 Champions League

**Chart**

- Data: [`ucl_stages.csv`](data/ucl_stages.csv), [`ucl_clubs.csv`](data/ucl_clubs.csv)
- Encode: A stepped funnel of vertical bars, one per stage, height = clubs still in (20 → 28 → 32 → 32 → 16 → 8 → 4 → 2 → 1). Label each step with the stage name and the count.
- Highlight: Two thin tracks through the steps, Porto in accent and Monaco in second, both entering at the group stage.
- Notes: Q1 20 clubs, Q2 28 (10 winners + 18 new), Q3 32 (14 + 18), groups 32 (16 + 16), R16 16, QF 8, SF 4, final 2, winner 1.
- Annotate: “16 clubs went straight into the groups — both finalists among them.”

**Body** (105 words)

> Seventy-two clubs from 48 countries played in the 2003-04 Champions League. Twenty began in the first qualifying round in mid-July; eighteen more joined in each of the next two rounds; sixteen, the champions and runners-up of the biggest leagues, waited for the group stage. When the groups were drawn there were 32 clubs left, from 15 countries. Both clubs who would reach the final in Gelsenkirchen were among the sixteen that skipped qualifying, but neither had been a favourite: Porto were Portuguese champions and UEFA Cup holders, Monaco had finished second in France. Two of the four semi-finalists, Chelsea and Deportivo, had started in August.

**Caption** — Clubs still in the competition at each stage. Porto and Monaco traced through.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- Steps read left to right across the gutter; the group stage step (32) sits on the page break so the qualifying rounds are left, the knockouts right.
- Stat 72 in Numerals; count labels in Label style above each step.

**Check before print**

- [ ] Porto as UEFA Cup holders (won May 2003) is outside this season's data; confirm.

### 09 · U03 — The group stage averaged two and a half goals a game. In Monaco one night there were eleven

**November 2003** · Hero (hero) · Bars · kicker “November · Champions League groups”

**Beat** (europe, strength 3): Monaco beat Deportivo 8-3 in the group stage, and Deportivo still reached the semi-finals.

**Headline** — The group stage averaged two and a half goals a game. In Monaco one night there were eleven

**Stat** — 8–3 · Monaco v Deportivo, 5 November 2003

**Chart**

- Data: [`ucl_matches.csv`](data/ucl_matches.csv)
- Encode: A histogram of the 96 group games by total goals (0 to 11). Each game is one stacked unit, so the 8–3 stands alone at 11.
- Highlight: The 8–3 in accent; Juventus 7–0 Olympiacos (7 goals) in second; everything else muted.
- Notes: Distribution: 0 goals 7 games, 1: 22, 2: 26, 3: 22, 4: 8, 5: 6, 6: 3, 7: 1, 11: 1.
- Annotate: “2.48 goals a game across 96 group matches.”
- Annotate: “Deportivo conceded eight — and reached the semi-finals.”

**Body** (96 words)

> The 96 games of the 2003-04 group stage produced 238 goals, a little under two and a half a game. Seven finished 0-0. Only one went past seven. On 5 November in Monaco, Didier Deschamps' side beat Deportivo La Coruña 8-3, the highest-scoring game the Champions League had seen. Dado Pršo scored four. The odd thing is what happened next: Deportivo, who had beaten Monaco 1-0 in Spain a fortnight earlier, still finished second in the group, knocked out Juventus and the holders Milan, and reached the semi-finals. Monaco went all the way to the final.

**Caption** — All 96 group-stage games, by total goals. Each block is one game.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- The chart region (x 3.75–12) holds 12 columns of blocks; the gap between 7 and 11 is part of the story, keep the empty columns.
- Annotation leader from the 11 column to the second note.

**Check before print**

- [ ] “Highest-scoring game the Champions League had seen”, Pršo’s four goals and Deschamps as Monaco coach are not in our data: confirm against UEFA records.

### 10 · U04 — 4 Dado Pršo’s goals in the 8–3

**November 2003** · Breather (breather) · Big number · kicker “November”

**Beat** (europe, strength 3): Monaco beat Deportivo 8-3 in the group stage, and Deportivo still reached the semi-finals.

**Headline** — Dado Pršo’s goals in the 8–3

**Stat** — 4 · Goals by Dado Pršo, Monaco v Deportivo

**Chart**

- Notes: Big number only. Pršo scored 7 Champions League goals in 512 minutes, a goal every 73 minutes (ucl_scorers.csv).

**Caption** — Pršo finished the competition with seven goals in 512 minutes, one every 73.

**Source line** — Source: UEFA via Wikipedia.

**Design notes**

- Left page is a photo-style field; brief an illustration of a striker’s outline in ink on paper, no likeness.

**Check before print**

- [ ] The four goals in one game are not in our data (match scorers aren't loaded); confirm.

### 12 · U05 — The champions came through their group second

**December 2003** · Comparison (dense) · Small multiples · kicker “December · Champions League groups”

**Beat** (europe, strength 2): Porto, the eventual champions, came through their group second, three points behind Real Madrid.

**Headline** — The champions came through their group second

**Stat** — 11 · Porto’s points in Group F, three behind Real Madrid

**Chart**

- Data: [`ucl_groups.csv`](data/ucl_groups.csv)
- Encode: Eight mini tables (A–H) in a 4 × 2 grid, four per page; each row = club, points bar, W-D-L in results colours.
- Highlight: Porto in accent, Monaco in second. Rows that went on to the round of 16 in ink, third place (to the UEFA Cup) in muted, fourth in draw-grey.
- Notes: Group order follows 2003-04 UEFA rules (head-to-head first), computed in spreads.py.
- Annotate: Group C: Deportivo and PSV level on 10, Deportivo through on head-to-head.
- Annotate: English clubs won groups B, E and G.

**Body** (101 words)

> The group stage ended on 10 December with few surprises at the top. Real Madrid won Group F with 14 points and lost none of their six games; Manchester United, Juventus and Chelsea topped theirs. Porto finished second in Real Madrid's group, three points behind, after losing 3-1 to them at home in October, their only defeat of the whole competition. Monaco won Group C on 11 points, scoring 15, eight of them in one night. Deportivo went through from the same group only on head-to-head, level on points with PSV. Nobody looking at these eight tables picked out the finalists.

**Caption** — Final tables of the eight groups. Clubs in ink went through to the round of 16; third place went to the UEFA Cup.

**Source line** — Source: engsoccerdata (jalapic); tie-breaks per UEFA 2003–04 rules.

**Design notes**

- Eight tables in one visual, four per page, identical scales on the points bars.
- Tables in Label style; the group letter in Deck.

### 17 · U06 — English clubs won three of the eight groups. None reached the final

**March 2004** · Hero (hero) · Results strip · kicker “March · English clubs in Europe”

**Beat** (europe, strength 2): English clubs won three of the eight Champions League groups and none of them reached the final.

**Headline** — English clubs won three of the eight groups. None reached the final

**Stat** — 3 / 8 · Groups won by English clubs: Arsenal, Manchester United, Chelsea

**Chart**

- Data: [`ucl_english_clubs.csv`](data/ucl_english_clubs.csv)
- Encode: Four results strips stacked, one per English club, every Champions League game in order (Newcastle 2, Manchester United 8, Arsenal 10, Chelsea 14), aligned on a shared stage axis (Q3, groups, R16, QF, SF).
- Highlight: Results colours only; each strip ends with the club’s exit labelled (date, opponent, aggregate).
- Notes: Strips aligned by stage, not date, so the groups line up.
- Annotate: Newcastle: out 19 Aug, Partizan, penalties. United: out 9 Mar, Porto, 3–2. Arsenal: out 6 Apr, Chelsea, 3–2. Chelsea: out 5 May, Monaco, 5–3.

**Body** (103 words)

> Four English clubs entered the 2003-04 Champions League and three of them won their groups: Arsenal after losing 3-0 at home to Inter on the first night, Manchester United with five wins from six, Chelsea in their first season of Abramovich's money. Then the knockouts took them one at a time. Newcastle had already gone in August. On 9 March United went out to Porto, 3-2 on aggregate. On 6 April Chelsea won at Highbury and knocked out Arsenal, the side nobody in England could beat. On 5 May Monaco beat Chelsea in the semi-final. The final had no English club in it.

**Caption** — Every Champions League game played by the four English clubs, aligned by stage, with the tie that ended each run.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- Four strips of different lengths left-aligned on the stage axis; exits as Caption-style notes at the strip ends.
- Cells the same size as the league results strips (L07, L13) so the forms read as one family.

### 20 · U07 — Two quarter-finals turned round in the second leg, and the holders went out

**April 2004** · Comparison (dense) · Slope · kicker “April · Champions League quarter-finals”

**Beat** (europe, strength 3): Two quarter-finals turned in the second leg, Deportivo from 4-1 down against the holders Milan and Monaco from 4-2 down against Real Madrid.

**Headline** — Two quarter-finals turned round in the second leg, and the holders went out

**Stat** — 4–0 · Deportivo v Milan, 7 April, after losing 4–1 in Milan

**Chart**

- Data: [`ucl_ties.csv`](data/ucl_ties.csv)
- Encode: Four slopes, one per tie: aggregate goal difference (from the eventual winner’s side) after leg 1 and after leg 2. Left page: the two comebacks; right page: Porto–Lyon and Chelsea–Arsenal.
- Highlight: Deportivo in accent, Monaco in second; Porto and Chelsea in muted.
- Notes: A zero line in ink; above it the club goes through.
- Annotate: Deportivo −3 → +1 (5–4). Monaco −2 → 0, through on away goals (5–5).

**Body** (108 words)

> Milan, the holders, won the first leg of their quarter-final 4-1 against Deportivo at San Siro, and Real Madrid beat Monaco 4-2 in Madrid. Both ties were thought settled. On 6 April Monaco won 3-1 at home and went through on away goals, Fernando Morientes, on loan from Real Madrid, scoring against the club that owned him. The next night Deportivo beat Milan 4-0 at the Riazor. The other two ties went the way the first legs pointed: Porto past Lyon, Chelsea past Arsenal. None of the four semi-finalists had won the Champions League; only Porto had won the European Cup, in 1987, before it took the name.

**Caption** — Aggregate goal difference after each leg of the four quarter-finals, from the winners' side. Above zero, through.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- Same y scale (−3 to +3) on all four slopes; tie names as Deck above each.

**Check before print**

- [ ] Morientes on loan from Real Madrid, and scoring in that tie, is not in our data; confirm.
- [ ] Porto's 1987 European Cup and the 1992 rename are outside our data; confirm.

### 21 · U08 — Monaco had the competition’s two top scorers

**April 2004** · Comparison (dense) · Bars · kicker “April · Champions League scorers”

**Beat** (europe, strength 1): Monaco had the competition's two top scorers, Fernando Morientes with nine and Dado Pršo with seven.

**Headline** — Monaco had the competition’s two top scorers

**Stat** — 16 · Champions League goals by Morientes (9) and Pršo (7)

**Chart**

- Data: [`ucl_scorers.csv`](data/ucl_scorers.csv)
- Encode: Left: goals, top 19 scorers (bars). Right: minutes per goal for the same players (bars, fewer is better), same order.
- Highlight: Morientes in accent, Pršo in second; Henry, Van Nistelrooy, Lampard and Pires (English clubs) labelled in ink.
- Notes: Ties share a rank (nine players on 4 goals).
- Annotate: Pršo: a goal every 73 minutes; Morientes every 114; Henry every 178.

**Body** (91 words)

> Monaco did not only beat Real Madrid; they outscored everyone. Fernando Morientes finished the competition with nine goals in 1,026 minutes, Dado Pršo with seven in 512, the best rate of any regular scorer. Behind them came Roy Makaay of Bayern and Walter Pandiani of Deportivo on six. Thierry Henry, who scored 30 in the league, managed five in Europe, one every 178 minutes. Porto, the champions, had no one in the top eight: Benni McCarthy's four were their best. The champions' goals came from everywhere, the finalists' from two men.

**Caption** — Champions League goals (left) and minutes per goal (right), every player with four or more.

**Source line** — Source: UEFA via Wikipedia, 2003–04 UEFA Champions League (top goalscorers).

**Design notes**

- Player names sit on the gutter between the two bar sets, so each name serves both halves.

### 24 · U09 — Porto won the final 3–0 with four shots

**May 2004** · Hero (hero) · Pitch map · kicker “May · The final, Gelsenkirchen”

**Beat** (europe, strength 3): Porto won the final 3-0 with four shots worth 0.50 expected goals.

**Headline** — Porto won the final 3–0 with four shots

**Stat** — 0.50 · Porto’s expected goals in the final; Monaco had 0.68

**Chart**

- Data: [`ucl_final_shots.csv`](data/ucl_final_shots.csv), [`ucl_final_team.csv`](data/ucl_final_team.csv)
- Encode: Full pitch, each team attacking its own end (Porto right, Monaco left); every shot of the final, dot area = xG, filled = goal.
- Highlight: Porto in accent, Monaco in second.
- Notes: StatsBomb minutes are 0-based (period minute); add one for the printed minute.
- Annotate: Carlos Alberto 39′ (0.07 xG), Deco 71′ (0.17), Alenichev 75′ (0.24).
- Annotate: Monaco: 9 shots, 0.68 xG, 511 passes; Porto: 4 shots, 0.50 xG, 427 passes.

**Body** (110 words)

> Neither club in the final at the Arena AufSchalke on 26 May had been anyone's favourite in August, and the game was as lopsided in the score as it was even on the pitch. Monaco had more of the ball, 511 passes to 427, and more of the shots, nine to four. Porto scored with three of theirs. Carlos Alberto scored just before half-time; Deco and Dmitri Alenichev added two more in four minutes midway through the second half. By StatsBomb's model the three chances were worth half a goal between them. José Mourinho's side had won the UEFA Cup a year earlier. A week later he was Chelsea's manager.

**Caption** — Every shot in the 2004 Champions League final. Dot size is the chance's expected-goals value; filled dots are goals.

**Source line** — Source: StatsBomb open data (Champions League 2003/04 final). StatsBomb logo and credit required.

**Design notes**

- The pitch spans the gutter (chart region x 3.75–12); keep the halfway line off the gutter by offsetting the pitch half a column right.
- StatsBomb logo with the source line.

**Check before print**

- [ ] Goal minutes printed from StatsBomb's minute field + 1 (38→39, 70→71, 74→75); confirm against UEFA's report.

### 25 · U10 — Porto lost once in thirteen games. Monaco lost four times and still got there

**May 2004** · Comparison (dense) · Small multiples · kicker “May · Roads to the final”

**Beat** (europe, strength 2): Porto lost once in thirteen Champions League games; Monaco lost four times and still reached the final.

**Headline** — Porto lost once in thirteen games. Monaco lost four times and still got there

**Stat** — 1 · Porto’s defeats in the competition: 1–3 v Real Madrid, 1 October

**Chart**

- Data: [`ucl_finalists_road.csv`](data/ucl_finalists_road.csv)
- Encode: Two results strips, one per page, 13 cells each, in order, labelled by stage and opponent; score under each cell.
- Highlight: Results colours only; the final cell outlined on both.
- Notes: Neutral venue for the final (venue N).
- Annotate: Porto 7–5–1, goals 20–12. Monaco 6–3–4, goals 27–19.

**Body** (89 words)

> The two finalists took different roads to Gelsenkirchen. Porto played thirteen games and lost one, at home to Real Madrid in October; they drew five, including both legs that mattered most, 1-1 at Old Trafford and 2-2 in Lyon. They scored 20 and conceded 12. Monaco lost four times, at Deportivo, in Moscow, in Madrid and in the final itself, and scored 27, more than anyone. They went through two knockout ties on away goals. Porto's road was the steadier one, and the final went the steady side's way.

**Caption** — Every Champions League game played by Porto (left) and Monaco (right), in order.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- Two strips of identical cell size, one per page, at the same height so they read across.

### 26 · U11 — 7 days from Gelsenkirchen to Stamford Bridge

**May 2004** · Breather (breather) · Big number · kicker “June”

**Beat** (people, strength 2): Seven days after the final, Porto's José Mourinho became Chelsea manager.

**Headline** — days from Gelsenkirchen to Stamford Bridge

**Stat** — 7 · Days between the final (26 May) and Mourinho’s appointment at Chelsea (2 June)

**Chart**

- Notes: Big number only.

**Caption** — Chelsea sacked Claudio Ranieri on 31 May and appointed José Mourinho on 2 June 2004.

**Source line** — Source: events.csv (Wikipedia, club season pages).

**Design notes**

- Photo-style left page; brief an illustration of an empty dugout, no likeness.

**Check before print**

- [ ] Appointment date 2 June 2004 from events.csv; confirm.

### 30 · U12 — Portugal sent two clubs. One of them won it

**Season in numbers** · Table (dense) · Heat table · kicker “Season in numbers · Europe by country”

**Beat** (europe, strength 2): Portugal sent two clubs to the Champions League and one of them won it.

**Headline** — Portugal sent two clubs. One of them won it

**Stat** — 48 · Countries with a club in the 2003–04 Champions League

**Chart**

- Data: [`ucl_countries.csv`](data/ucl_countries.csv)
- Encode: One row per country (48), columns = the stage each club went out at (Q1 … Final, Winners); cell = number of clubs, shaded by count. Rows ordered by best stage reached.
- Highlight: Portugal’s row in accent, England’s in second.
- Notes: Countries as three-letter codes in the data; print full names.
- Annotate: Portugal: Porto won, Benfica went out in the third qualifying round.
- Annotate: Spain and England had a semi-finalist each; Spain and England both sent four.

**Body** (93 words)

> Forty-eight countries had a club in the 2003-04 Champions League, from the Faroe Islands to Russia. Portugal sent two. Benfica went out in the last qualifying round in August; Porto won the whole thing. England, Spain and Italy sent four each and Germany three; between them they supplied two of the four semi-finalists and neither finalist. France reached the final through Monaco. Most of the table is the long tail of Europe's smaller leagues, whose champions played two or three ties in July and August and were gone before the group stage began.

**Caption** — Clubs from each country by the stage at which they went out. Rows ordered by furthest stage reached.

**Source line** — Source: engsoccerdata (jalapic), club country codes.

**Design notes**

- 48 rows fills the right page at about 5mm a row; country names in Label style.

### 31 · U13 — 2 of the four semi-finalists started in August qualifying

**Season in numbers** · Breather (breather) · Big number · kicker “Season in numbers”

**Beat** (europe, strength 2): Portugal sent two clubs to the Champions League and one of them won it.

**Headline** — of the four semi-finalists started in August qualifying

**Stat** — 2 · Chelsea and Deportivo, both through the third qualifying round

**Chart**

- Notes: Big number only.

**Caption** — Chelsea beat Žilina 5–0 and Deportivo beat Rosenborg 1–0 in August; both reached the semi-finals.

**Source line** — Source: engsoccerdata (jalapic).

**Design notes**

- Photo-style left page; brief a flat illustration of floodlights on a summer evening.

### 32 · U14 — Eight of the fifteen knockout ties came down to one goal or away goals

**Season in numbers** · Timeline (dense) · Bracket · kicker “Season in numbers · The knockout rounds”

**Beat** (europe, strength 1): Eight of the fifteen knockout ties were settled by one goal or on away goals, and Monaco went through twice on away goals.

**Headline** — Eight of the fifteen knockout ties came down to one goal or away goals

**Stat** — 8 / 15 · Knockout ties decided by one goal on aggregate or on away goals

**Chart**

- Data: [`ucl_ties.csv`](data/ucl_ties.csv)
- Encode: Bracket from round of 16 to final, rounds left to right in time (R16 Feb–Mar, QF Mar–Apr, SF Apr–May, final 26 May); each tie shows both leg scores (Label) and the aggregate (Deck). Winners’ paths run on to the next round; losers’ stop.
- Highlight: Porto’s path in accent, Monaco’s in second, the other clubs in ink; ties settled by one goal on aggregate or on away goals marked with an open circle (the system marks only away goals and penalties — this spread widens it to one-goal ties, and says so in the caption).
- Notes: Uses the `bracket` chart form (system v2) on the timeline template; 16 clubs on the left page converge to the final at the right page's outer margin.
- Annotate: Monaco through on away goals twice: Lokomotiv (2–2) and Real Madrid (5–5).

**Body** (99 words)

> The knockout rounds of 2003-04 were close. Of the fifteen ties from the round of 16 to the final, eight were settled by a single goal or on away goals. Monaco survived twice on away goals, against Lokomotiv Moscow and Real Madrid, and Porto went through two by one goal, Manchester United 3-2 and Deportivo 1-0, with Lyon 4-2 the comfortable one between. Only the final was a rout. Read the bracket from left to right and the big names leave it in order: Bayern and Juventus in March, Real Madrid, Milan and Arsenal in April, Chelsea in May.

**Caption** — The knockout rounds as a bracket, read in time from left to right. Circles mark ties settled by one goal or on away goals.

**Source line** — Source: engsoccerdata (jalapic) Champions League results.

**Design notes**

- The bracket converges on the right page; the final sits at the outer margin.
- Leg scores in Label style, aggregates in Deck.
