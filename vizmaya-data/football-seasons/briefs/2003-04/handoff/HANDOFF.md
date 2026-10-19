# Handoff: 2003–04 season book — league and cup spreads

For a design agent. Everything needed to design the 32 Premier League (league-level) and Champions League (cup-level) spreads of the 2003–04 book is in this folder: this file, `spreads.csv`, `beats.csv`, `system/` and `data/`. Nothing outside it is needed.

## The job

Design 32 print spreads, each 420 × 270 mm (two 210 × 270 mm pages) plus 3 mm bleed, one claim per spread proved by one visual. Unless told otherwise, deliver one file per spread named by `file_name` in `spreads.csv` (e.g. `03-L02.svg` or `.pdf`) at 1:1 with bleed, and one contact sheet of all spreads in order.

**Rules**

1. The design system below is locked. Use its grid, template regions, type roles, palette and chart style; don’t add colours or move regions.
2. The copy (kicker, headline, stat, body, caption, source line) is written and fact-checked. Set it as given. If something won’t fit its region, say which spread and by how much rather than rewriting it.
3. Draw every chart from the CSV named in its brief, never from the numbers in the copy; if the two disagree, flag it.
4. At most two coloured series per chart (accent, then second); everything else muted. Direct labels, no legends. A source line under every chart.
5. Results are always W ink, D draw-grey, L accent.
6. No club crests, logos, kit or photographs of real people. Breather and cover image regions get illustrations as briefed (objects and places, no likenesses).
7. StatsBomb data needs the StatsBomb logo and credit on the spread: L12, L13, U09.
8. Type faces are roles (Headline, Text, Numerals), not fonts. Pick one family per role, use it on every spread and say which you picked. Numerals need tabular figures.

## Files

| file | what |
|---|---|
| HANDOFF.md | This file: the job, rules, system, flatplan, every brief, the data dictionary, open checks |
| spreads.csv | 32 rows, one per spread: copy, chart spec, design notes, checks |
| beats.csv | 25 story beats the spreads hang on |
| system/page.csv | Trim, bleed, margins, grid, baseline |
| system/type_scale.csv | Type roles, sizes, leading, weights |
| system/palette.csv | Colour tokens and result colours |
| system/chart_style.csv | How every chart is drawn |
| system/chart_forms.csv | Allowed chart forms and the templates that take them |
| system/templates.csv | The seven spread templates |
| system/template_regions.csv | Every template region in grid units and millimetres |
| system/system.json | The same system as one JSON object |
| data/*.csv | 25 data files the charts are drawn from |
| data/data_dictionary.csv | Every data column described, with source and the spreads that use it |

## Design system (v2)

**Page and grid.** Spread 420 × 270 mm, bleed 3 mm. Margins: top 15, bottom 20, outer 15, inner (gutter side) 18 mm. 12 columns across the spread (6 per page) × 8 rows, 4 mm gutters, 4 mm baseline. Region positions below are in grid units (x/w in columns, the page break at x = 6; y/h in rows) and in millimetres from the spread’s top-left trim corner (left, top · width × height). A block ending on x = 6 stops at the inner margin; one crossing it runs across the gutter.

**Type scale**

| role | face | size pt | leading pt | weight | use |
|---|---|---|---|---|---|
| display | Numerals | 96.0 | 88.0 | 800 | Cover season, breather numbers |
| headline | Headline | 34.0 | 38.0 | 700 | The claim: one per spread |
| stat | Numerals | 54.0 | 54.0 | 700 | The one supporting number |
| deck | Text | 16.0 | 21.0 | 500 | Stat label, intro standfirst |
| body | Text | 9.5 | 13.5 | 400 | 80–150 words, never more |
| caption | Text | 7.5 | 10.0 | 400 | What the chart shows, how to read it |
| label | Text | 6.5 | 8.0 | 600 | Kickers, axis labels, sources, folios |

**Palette**

| token | hex |
|---|---|
| paper | `#F4F1EA` |
| ink | `#141414` |
| muted | `#8A8780` |
| rule | `#CFCAC0` |
| accent | `#D7372B` |
| second | `#1F5AA6` |
| draw | `#B5B0A6` |

Results: W `#141414` (ink), D `#B5B0A6` (draw), L `#D7372B` (accent).

**Chart style**

| rule | value |
|---|---|
| Highlight | At most two coloured series: accent, then second. Everything else is context in muted. |
| Lines | Highlight 1.5pt, context 0.75pt, round joins. No markers except the last point. |
| Labels | Direct labels at the line end or on the bar. No legends. |
| Axes | One 0.5pt baseline in ink. Light 0.25pt rules only where a reader must read a value across. |
| Numbers | Tabular numerals, Label style on axes; the chart’s key value may be set in Stat. |
| Results | Win ink, draw draw-grey, loss accent: the same three everywhere a result appears. |
| Brackets | Rounds left to right in time, converging on the final. Winners’ paths continue in ink, losers’ stop at the round they went out. At most two paths coloured. Leg scores in Label, the aggregate in Deck; an open circle marks a tie settled on away goals or penalties. |
| Annotation | A 0.5pt leader and a Caption-style note at the moment that proves the headline. |
| Source | Every chart ends with a Label-style source line. StatsBomb data carries its credit. |

**Chart forms**

| form | label | reads |
|---|---|---|
| line-race | Line race | who was ahead, and when it changed |
| bar | Bars | how much, ranked |
| slope | Slope | before and after, for several teams |
| strip | Results strip | a run of results, game by game |
| scatter | Scatter | two measures, every team or player |
| small-multiples | Small multiples | the same chart for each team, side by side |
| pitch | Pitch map | where on the pitch (shots, passes, pressing) |
| timeline | Timeline | what happened in what order |
| bracket | Bracket | a knockout, tie by tie, round by round to the final |
| table | Table | the standings, or exact values to look up |
| heat-table | Heat table | a grid of values, coloured by size |
| big-number | Big number | one figure, set very large |
| image | Photo-style | a picture or illustration, little text |

**Rhythm.** Spreads alternate hero (one big chart) → dense (comparison, timeline, table) → breather (one big number and an illustration). Frames (cover, intro) sit outside the rhythm.

**Templates**

**Cover** (`cover`, frame) — Back cover blurb on the left, the season set as a Display number on the front. Once, first. Body 0–80 words. Charts: photo-style, big number.

| region | grid | mm |
|---|---|---|
| body | x 0.5 y 4.5 w 4 h 2.5 | 29.8, 147.2 · 118.0 × 73.4 |
| image | x 6 y 0 w 6 h 8 | full page, bleeds |
| title | x 6.5 y 0.5 w 5 h 3 | 242.8, 29.7 · 147.5 × 88.1 |
| kicker | x 6.5 y 7 w 5 h 0.5 | 242.8, 220.6 · 147.5 × 14.7 |

**Season intro** (`intro`, frame) — The season’s argument on the left; the whole season at a glance on the right. Once, after the cover: the chart every later spread zooms into. Body 80–150 words. Charts: line race, table, bars, results strip, small multiples, bracket.

| region | grid | mm |
|---|---|---|
| kicker | x 0 y 0 w 5 h 0.5 | 15.0, 15.0 · 147.5 × 14.7 |
| headline | x 0 y 0.75 w 5 h 2.5 | 15.0, 37.0 · 147.5 × 73.4 |
| body | x 0 y 3.75 w 4 h 3.5 | 15.0, 125.2 · 118.0 × 102.8 |
| chart | x 6.5 y 0 w 5.5 h 6.75 | 242.8, 15.0 · 162.2 × 198.3 |
| caption | x 6.5 y 7 w 4 h 1 | 242.8, 220.6 · 118.0 × 29.4 |

**Hero** (`hero`, hero) — One big chart across the gutter; the headline makes the claim it proves. A month’s biggest beat. Opens each month-chapter. Body 80–150 words. Charts: line race, bars, slope, results strip, scatter, pitch map, bracket.

| region | grid | mm |
|---|---|---|
| kicker | x 0 y 0 w 4 h 0.5 | 15.0, 15.0 · 118.0 × 14.7 |
| headline | x 0 y 0.75 w 4.5 h 2 | 15.0, 37.0 · 132.8 × 58.8 |
| stat | x 0 y 3 w 3 h 1.5 | 15.0, 103.1 · 88.5 × 44.1 |
| body | x 0 y 4.75 w 3 h 3.25 | 15.0, 154.5 · 88.5 × 95.5 |
| chart | x 3.75 y 1 w 8.25 h 6 | 125.6, 44.4 · 279.4 × 176.2 |
| caption | x 8 y 7.25 w 4 h 0.75 | 287.0, 228.0 · 118.0 × 22.0 |

**Comparison** (`comparison`, dense) — One visual in two halves, one per page: this team against that, this month against last. A head-to-head or a before/after. Body 80–150 words. Charts: small multiples, bars, slope, line race, pitch map, scatter.

| region | grid | mm |
|---|---|---|
| kicker | x 0 y 0 w 5 h 0.5 | 15.0, 15.0 · 147.5 × 14.7 |
| headline | x 0 y 0.75 w 7 h 1.25 | 15.0, 37.0 · 242.5 × 36.7 |
| chart | x 0 y 2.25 w 12 h 3.75 | 15.0, 81.1 · 390.0 × 110.2 |
| stat | x 0 y 6.25 w 2.5 h 1.5 | 15.0, 198.6 · 73.8 × 44.1 |
| body | x 2.75 y 6.25 w 5.25 h 1.75 | 96.1, 198.6 · 190.9 × 51.4 |
| caption | x 8.5 y 6.25 w 3.5 h 1 | 301.8, 198.6 · 103.2 × 29.4 |

**Timeline** (`timeline`, dense) — A horizontal run across both pages: results, events or a lead that changed hands. A month told in order, or a streak. Body 80–150 words. Charts: timeline, bracket, results strip, line race.

| region | grid | mm |
|---|---|---|
| kicker | x 0 y 0 w 5 h 0.5 | 15.0, 15.0 · 147.5 × 14.7 |
| headline | x 0 y 0.75 w 6.5 h 1.5 | 15.0, 37.0 · 227.8 × 44.1 |
| chart | x 0 y 2.75 w 12 h 2.75 | 15.0, 95.8 · 390.0 × 80.8 |
| body | x 0 y 5.75 w 4.5 h 2.25 | 15.0, 183.9 · 132.8 × 66.1 |
| stat | x 6.5 y 5.75 w 2.5 h 1.5 | 242.8, 183.9 · 73.8 × 44.1 |
| caption | x 9.25 y 5.75 w 2.75 h 1 | 323.9, 183.9 · 81.1 × 29.4 |

**Table** (`table`, dense) — The words on the left page, a full-height table or heat table on the right. Standings at the month’s end, or a ranking to look things up in. Body 80–150 words. Charts: table, heat table.

| region | grid | mm |
|---|---|---|
| kicker | x 0 y 0 w 5 h 0.5 | 15.0, 15.0 · 147.5 × 14.7 |
| headline | x 0 y 0.75 w 5 h 2 | 15.0, 37.0 · 147.5 × 58.8 |
| stat | x 0 y 3 w 3 h 1.5 | 15.0, 103.1 · 88.5 × 44.1 |
| body | x 0 y 4.75 w 4.5 h 2.5 | 15.0, 154.5 · 132.8 × 73.4 |
| chart | x 6.5 y 0 w 5.5 h 7.25 | 242.8, 15.0 · 162.2 × 213.0 |
| caption | x 0 y 7.4 w 4.5 h 0.6 | 15.0, 232.4 · 132.8 × 17.6 |

**Breather** (`breather`, breather) — A photo-style page and a single number: room to turn the page. After a dense spread. Never two in a row. Body 0–60 words. Charts: big number, photo-style.

| region | grid | mm |
|---|---|---|
| image | x 0 y 0 w 6 h 8 | full page, bleeds |
| number | x 6.5 y 1.5 w 5.5 h 3 | 242.8, 59.1 · 162.2 × 88.1 |
| headline | x 6.5 y 4.75 w 5 h 1.25 | 242.8, 154.5 · 147.5 × 36.7 |
| caption | x 6.5 y 6.5 w 4 h 1 | 242.8, 205.9 · 118.0 × 29.4 |

## Flatplan

Reading order, rhythm `FFHDHDHDHBHDHDHDHBHDDHDHDBDBDDBD` (F frame, H hero, D dense, B breather). Club- and match-level spreads and other leagues will slot in between later.

| no | file | chapter | template | role | chart | headline |
|---|---|---|---|---|---|---|
| 1 | 01-C00 | Cover | cover | frame | big-number | 2003–04 |
| 2 | 02-L01 | Season intro | intro | frame | line-race | Nobody beat Arsenal. Thirty-eight games, ninety points, eleven clear |
| 3 | 03-L02 | August 2003 | hero | hero | bar | Chelsea spent two and a half times what the rest of the league did |
| 4 | 04-U01 | August 2003 | timeline | dense | timeline | Forty ties to fill sixteen places, and Newcastle lost theirs on penalties |
| 5 | 05-U02 | September 2003 | hero | hero | bar | Seventy-two clubs from 48 countries started. By September, 32 were left |
| 6 | 06-L03 | September 2003 | comparison | dense | bar | Old Trafford held four Loftus Roads |
| 7 | 07-L04 | October 2003 | hero | hero | line-race | Until Christmas, first and third were never more than five points apart |
| 8 | 08-L05 | October 2003 | comparison | dense | scatter | Liverpool shot more than anyone and finished 30 points behind |
| 9 | 09-U03 | November 2003 | hero | hero | bar | The group stage averaged two and a half goals a game. In Monaco one night there were eleven |
| 10 | 10-U04 | November 2003 | breather | breather | big-number | Dado Pršo’s goals in the 8–3 |
| 11 | 11-L06 | December 2003 | hero | hero | slope | At halfway four points covered the top three. By May it was fifteen |
| 12 | 12-U05 | December 2003 | comparison | dense | small-multiples | The champions came through their group second |
| 13 | 13-L07 | January 2004 | hero | hero | strip | United took 2.27 points a game before Ferdinand's ban and 1.56 after it |
| 14 | 14-L08 | January 2004 | table | dense | table | United went into February top, a point ahead of Arsenal with a game more played |
| 15 | 15-L09 | February 2004 | hero | hero | strip | Six clubs led the table. After 1 February, only Arsenal did |
| 16 | 16-L10 | February 2004 | comparison | dense | bar | February was the season's highest-scoring month; March was the home sides' |
| 17 | 17-U06 | March 2004 | hero | hero | strip | English clubs won three of the eight groups. None reached the final |
| 18 | 18-L11 | March 2004 | breather | breather | big-number | league games unbeaten from the start of a season, a record |
| 19 | 19-L12 | April 2004 | hero | hero | pitch | Henry scored 30 league goals from 23.9 expected, seven of them in eight April days |
| 20 | 20-U07 | April 2004 | comparison | dense | slope | Two quarter-finals turned round in the second leg, and the holders went out |
| 21 | 21-U08 | April 2004 | comparison | dense | bar | Monaco had the competition’s two top scorers |
| 22 | 22-L13 | May 2004 | hero | hero | strip | Twenty-six wins, twelve draws, and no defeats |
| 23 | 23-L14 | May 2004 | comparison | dense | line-race | Three clubs went down on 33 points. Everton stayed up on 39 |
| 24 | 24-U09 | May 2004 | hero | hero | pitch | Porto won the final 3–0 with four shots |
| 25 | 25-U10 | May 2004 | comparison | dense | small-multiples | Porto lost once in thirteen games. Monaco lost four times and still got there |
| 26 | 26-U11 | May 2004 | breather | breather | big-number | days from Gelsenkirchen to Stamford Bridge |
| 27 | 27-L15 | Season in numbers | table | dense | heat-table | Home sides won 167 of 380 games. Nobody beat Arsenal anywhere |
| 28 | 28-L16 | Season in numbers | breather | breather | big-number | league goals, 2.66 a game |
| 29 | 29-L17 | Season in numbers | comparison | dense | scatter | Arsenal beat the bookmakers' prices by fourteen points |
| 30 | 30-U12 | Season in numbers | table | dense | heat-table | Portugal sent two clubs. One of them won it |
| 31 | 31-U13 | Season in numbers | breather | breather | big-number | of the four semi-finalists started in August qualifying |
| 32 | 32-U14 | Season in numbers | timeline | dense | bracket | Eight of the fifteen knockout ties came down to one goal or away goals |

## Spread briefs

### 01 · C00 — 2003–04

**Cover** · Cover (frame) · Big number · kicker “Football seasons · Book 2”

**Headline** — 2003–04

**Stat** — 2003–04 · Season, set in Display

**Chart**

- Notes: The season set as one Display numeral across the front cover; no chart.

**Body** (52 words)

> The season nobody beat Arsenal. Thirty-eight league games, twenty-six wins, twelve draws, no defeats. The season a Russian billionaire bought Chelsea and spent more in one summer than the rest of the league together. And the season a club from Porto, coached by a 41-year-old called José Mourinho, won the Champions League.

**Design notes**

- Front (right page) carries only the season numeral and the series line. Back (left) carries the blurb.
- Image region is a flat paper field with the numeral in ink; no club crests (licensing) and no photography.

**Check before print**

- [ ] Mourinho's age at the final (41) — born 26 January 1963; confirm before print.

### 02 · L01 — Nobody beat Arsenal. Thirty-eight games, ninety points, eleven clear

**Season intro** · Season intro (frame) · Line race · kicker “Season intro · Premier League”

**Beat** (record, strength 3): Arsenal went the whole league season unbeaten, 26 wins and 12 draws, and won it by 11 points.

**Headline** — Nobody beat Arsenal. Thirty-eight games, ninety points, eleven clear

**Stat** — 26–12–0 · Arsenal’s league record: won, drawn, lost

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
- Encode: x = game number 1–38; y = cumulative points 0–90. One line per club.
- Highlight: Arsenal in accent, Chelsea in second; Manchester United and Liverpool labelled in muted; the other 16 clubs as 0.5pt muted context lines, unlabelled.
- Notes: The chart every later league spread zooms into; keep its scale (0–90) wherever the race returns.
- Annotate: Game 30, 28 March: “30 unbeaten from the start, a record” (1–1 v Manchester United).
- Annotate: Game 34, 25 April: title won at White Hart Lane, four games left.
- Annotate: Final point labels at the line end: Arsenal 90, Chelsea 79, Man United 75, Liverpool 60.

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

### 13 · L07 — United took 2.27 points a game before Ferdinand's ban and 1.56 after it

**January 2004** · Hero (hero) · Results strip · kicker “January · Manchester United”

**Beat** (collapse, strength 3): United took 2.27 points a game before Rio Ferdinand's eight-month ban began on 20 January and 1.56 after it.

**Headline** — United took 2.27 points a game before Ferdinand's ban and 1.56 after it

**Stat** — 1.56 · United’s points per game from 20 January, down from 2.27

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
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

### 22 · L13 — Twenty-six wins, twelve draws, and no defeats

**May 2004** · Hero (hero) · Results strip · kicker “May · The Invincibles”

**Beat** (record, strength 3): Arsenal went the whole league season unbeaten, 26 wins and 12 draws, and won it by 11 points.

**Headline** — Twenty-six wins, twelve draws, and no defeats

**Stat** — 0 · League defeats, Arsenal 2003–04

**Chart**

- Data: [`epl_champion_games.csv`](data/epl_champion_games.csv)
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

- [ ] The parade figure (250,000) is from events.csv, not yet hand-verified; confirm.

### 23 · L14 — Three clubs went down on 33 points. Everton stayed up on 39

**May 2004** · Comparison (dense) · Line race · kicker “May · Relegation”

**Beat** (survival, strength 2): Leicester, Leeds and Wolves all went down on 33 points while Everton survived on 39.

**Headline** — Three clubs went down on 33 points. Everton stayed up on 39

**Stat** — 33 · Points for Leicester, Leeds and Wolves, all relegated

**Chart**

- Data: [`epl_race.csv`](data/epl_race.csv)
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

## Data dictionary

Dates are ISO (YYYY-MM-DD). Scores are "a-b" with the side named in the column description first. Team names are as they should be printed. StatsBomb open data: 120 × 80 pitch, x along the length, y across; every event from the acting team’s view, attacking left → right (x = 120 is the goal being attacked). `minute` is elapsed minutes (print minute + 1).

### `data/epl_champion_games.csv`

The champions’ (Arsenal’s) 38 league games, with StatsBomb match stats. 38 rows. Source: football-data.co.uk; StatsBomb open data. Used by: L13.

| column | meaning |
|---|---|
| `game` | Game number |
| `date` | Match date |
| `opponent` | Opponent |
| `venue` | H / A |
| `score` | Arsenal first |
| `result` | W / D |
| `ht` | Half-time score, Arsenal first |
| `behind_at_ht` | True if behind at half-time |
| `implied_win_pct` | Arsenal’s win chance from Bet365 odds (%) |
| `xg_for` | StatsBomb expected goals for |
| `xg_against` | StatsBomb expected goals against |
| `shots` | Arsenal shots (StatsBomb) |
| `ppda` | Passes allowed per defensive action (lower = more pressing) |

### `data/epl_goals_by_month.csv`

Goals and results by calendar month. 10 rows. Source: football-data.co.uk. Used by: L10.

| column | meaning |
|---|---|
| `month` | YYYY-MM |
| `matches` | Games played |
| `goals` | Goals |
| `home_wins` | Home wins |
| `draws` | Draws |
| `away_wins` | Away wins |
| `goals_per_game` | Goals ÷ matches |
| `home_win_pct` | Home wins as % of matches |

### `data/epl_leader_by_date.csv`

Who was top after every match date, and every change at the top. 97 rows. Source: football-data.co.uk. Used by: L04, L09.

| column | meaning |
|---|---|
| `date` | Match date |
| `leader` | Club top that night |
| `leader_pts` | Its points |
| `leader_played` | Its games played |
| `second` | Club second |
| `second_pts` | Its points |
| `second_played` | Its games played |
| `margin` | Points gap first to second |
| `changed` | True if the leader changed that date |

### `data/epl_month_tables.csv`

The full table at the end of each month. 200 rows. Source: football-data.co.uk. Used by: L08.

| column | meaning |
|---|---|
| `month` | YYYY-MM (table as at the last match date of the month) |
| `pos` | Position |
| `team` | Club |
| `P` | Played |
| `W` | Won |
| `D` | Drawn |
| `L` | Lost |
| `GF` | Goals for |
| `GA` | Goals against |
| `Pts` | Points |
| `GD` | Goal difference |

### `data/epl_monthly_awards.csv`

Premier League Manager and Player of the Month. 9 rows. Source: Wikipedia, 2003–04 FA Premier League. Used by: — (reference).

| column | meaning |
|---|---|
| `month` | Month (no award in May) |
| `manager` | Manager of the Month |
| `manager_club` | His club |
| `player` | Player of the Month (shared in February) |
| `player_club` | Club |

### `data/epl_race.csv`

Every club’s league season game by game: the line race, the slope and the results strips come from here. 760 rows. Source: football-data.co.uk. Used by: L01, L04, L06, L07, L14.

| column | meaning |
|---|---|
| `team` | Club |
| `team_id` | Crosswalk id (internal) |
| `game` | The club’s game number, 1–38 |
| `date` | Match date |
| `month` | YYYY-MM |
| `opponent` | Opponent |
| `venue` | H home / A away |
| `score` | Score from this club’s side, "for-against" |
| `result` | W / D / L for this club |
| `points` | Points from this game |
| `cum_points` | Running points total |
| `cum_gd` | Running goal difference |
| `position` | Table position at the end of that match date |

### `data/epl_results_grid.csv`

All 380 league results, for the 20 × 20 grid. 380 rows. Source: football-data.co.uk. Used by: L15.

| column | meaning |
|---|---|
| `home` | Home club |
| `away` | Away club |
| `date` | Match date |
| `hg` | Home goals |
| `ag` | Away goals |
| `result` | H home win / D draw / A away win |

### `data/epl_scorers.csv`

Premier League top scorers. 12 rows. Source: Wikipedia, 2003–04 FA Premier League. Used by: — (reference).

| column | meaning |
|---|---|
| `rank` | Rank (ties share one) |
| `player` | Player |
| `club` | Club (Saha: both clubs that season) |
| `goals` | League goals |

### `data/epl_summer_signings.csv`

Every £5m-plus signing by a Premier League club, 1 June – 1 September 2003. 15 rows. Source: Wikipedia, List of English football transfers summer 2003 (via events.csv). Used by: L02.

| column | meaning |
|---|---|
| `date` | Date of the move |
| `player` | Player |
| `from_club` | Selling club |
| `to_club` | Buying club |
| `fee_m_gbp` | Reported fee, £ millions |
| `source_url` | Source link where one was recorded |

### `data/epl_table_final.csv`

Premier League final table with everything the league spreads compare clubs on. 20 rows. Source: football-data.co.uk; attendance from worldfootball.net via Wikipedia. Used by: L03, L05, L17.

| column | meaning |
|---|---|
| `pos` | Final position (3/1/0, then goal difference, goals scored) |
| `team` | Club, as printed |
| `team_id` | Crosswalk id (internal) |
| `P` | Played |
| `W` | Won |
| `D` | Drawn |
| `L` | Lost |
| `GF` | Goals for |
| `GA` | Goals against |
| `GD` | Goal difference |
| `Pts` | Points |
| `home_pts` | Points from home games |
| `away_pts` | Points from away games |
| `prev_season_pts` | Points in 2002-03 (blank = promoted) |
| `prev_season_pos` | Position in 2002-03, or "promoted" |
| `shots` | Shots, season total |
| `shots_on_target` | Shots on target, season total |
| `goals_per_shot_on_target` | GF ÷ shots on target |
| `yellows` | Yellow cards |
| `reds` | Red cards |
| `xpts_from_odds` | Points the Bet365 pre-match odds implied (3 × P(win) + P(draw) per game, bookmaker margin removed) |
| `pts_minus_xpts` | Pts − xpts_from_odds: above zero = beat the market |
| `trailed_at_ht` | Games behind at half-time |
| `pts_from_ht_deficit` | Points won from those games |
| `avg_attendance` | Average home league attendance |
| `status` | Champions / Champions League / UEFA Cup / Relegated (blank = none) |

### `data/epl_top_scorer_shots.csv`

Every Premier League shot by Thierry Henry, 2003-04. StatsBomb open data: 120 × 80 pitch, x along the length, y across; every event from the acting team’s view, attacking left → right (x = 120 is the goal being attacked). `minute` is elapsed minutes (print minute + 1). 194 rows. Source: StatsBomb open data — logo and credit required. Used by: L12.

| column | meaning |
|---|---|
| `match_id` | StatsBomb match id |
| `date` | Match date |
| `player` | StatsBomb full name |
| `player_known_as` | Name to print |
| `period` | 1 or 2 |
| `minute` | Elapsed minute (print + 1) |
| `second` | Second |
| `x` | Shot location x (0–120) |
| `y` | Shot location y (0–80) |
| `end_x` | Where the shot ended, x |
| `end_y` | Where the shot ended, y |
| `xg` | Expected goals value of the chance |
| `outcome` | Goal / Saved / Off T / Blocked / Post / Wayward |
| `body_part` | Foot / head |
| `shot_type` | Open Play / Penalty / Free Kick |
| `technique` | Volley, half volley, … |
| `under_pressure` | True if pressed |
| `first_time` | True if first-time |
| `assisted_by` | StatsBomb full name of the passer |
| `assisted_by_known_as` | Passer, name to print |

### `data/epl_upsets.csv`

The 15 least likely wins of the season by the bookmakers’ prices. 15 rows. Source: football-data.co.uk (Bet365 odds). Used by: L17.

| column | meaning |
|---|---|
| `date` | Match date |
| `winner` | Winning club |
| `loser` | Losing club |
| `venue` | Winner’s venue, H / A |
| `score` | Winner’s side first |
| `odds` | Bet365 decimal odds on the winner |
| `implied_win_pct` | Win chance those odds implied, margin removed (%) |

### `data/ucl_clubs.csv`

All 72 clubs: where each entered and how far it got. 72 rows. Source: engsoccerdata (jalapic). Used by: U02.

| column | meaning |
|---|---|
| `team` | Club |
| `team_id` | Crosswalk id (internal) |
| `country` | Country code |
| `country_name` | Country |
| `entered` | Stage it entered at |
| `reached` | Furthest stage (Winners for the champions) |
| `matches` | Matches played |

### `data/ucl_countries.csv`

Each country’s clubs by the stage they went out at (heat table). 48 rows. Source: engsoccerdata (jalapic). Used by: U12.

| column | meaning |
|---|---|
| `country` | Country code |
| `country_name` | Country |
| `clubs` | Clubs entered |
| `First qualifying round` | Clubs out here |
| `Second qualifying round` | Clubs out here |
| `Third qualifying round` | Clubs out here |
| `Group stage` | Clubs out here |
| `Round of 16` | Clubs out here |
| `Quarter-finals` | Clubs out here |
| `Semi-finals` | Clubs out here |
| `Final` | Clubs that lost the final |
| `Winners` | Clubs that won it |
| `best` | Furthest stage any of its clubs reached |

### `data/ucl_english_clubs.csv`

Every Champions League game by the four English clubs. 34 rows. Source: engsoccerdata (jalapic). Used by: U06.

| column | meaning |
|---|---|
| `team` | Club |
| `n` | Game number |
| `date` | Match date |
| `stage` | Stage |
| `opponent` | Opponent |
| `venue` | H / A |
| `score` | English club first |
| `result` | W / D / L |

### `data/ucl_final_pass_network.csv`

Final pass network links: completed passes between pairs, same cut-off. 122 rows. Source: StatsBomb open data — logo and credit required. Used by: — (reference).

| column | meaning |
|---|---|
| `match_id` | StatsBomb match id |
| `team` | Team |
| `passer` | StatsBomb full name |
| `passer_known_as` | Name to print |
| `recipient` | StatsBomb full name |
| `recipient_known_as` | Name to print |
| `passes` | Completed passes passer → recipient |

### `data/ucl_final_pass_nodes.csv`

Final pass network: each player’s average position and passes, up to his team’s first substitution. StatsBomb open data: 120 × 80 pitch, x along the length, y across; every event from the acting team’s view, attacking left → right (x = 120 is the goal being attacked). `minute` is elapsed minutes (print minute + 1). 22 rows. Source: StatsBomb open data — logo and credit required. Used by: — (reference).

| column | meaning |
|---|---|
| `match_id` | StatsBomb match id |
| `team` | Team |
| `player` | StatsBomb full name |
| `player_known_as` | Name to print |
| `avg_x` | Average x of his passes |
| `avg_y` | Average y |
| `passes_made` | Completed passes |
| `until_minute` | Network cut-off minute (first substitution) |

### `data/ucl_final_shots.csv`

Every shot in the 2004 final, Porto 3–0 Monaco. StatsBomb open data: 120 × 80 pitch, x along the length, y across; every event from the acting team’s view, attacking left → right (x = 120 is the goal being attacked). `minute` is elapsed minutes (print minute + 1). 13 rows. Source: StatsBomb open data — logo and credit required. Used by: U09.

| column | meaning |
|---|---|
| `match_id` | StatsBomb match id |
| `date` | Match date |
| `team` | Porto / Monaco |
| `player` | StatsBomb full name |
| `player_known_as` | Name to print |
| `period` | 1 or 2 |
| `minute` | Elapsed minute (print + 1) |
| `second` | Second |
| `x` | Location x (0–120) |
| `y` | Location y (0–80) |
| `end_x` | End x |
| `end_y` | End y |
| `xg` | Expected goals value |
| `outcome` | Goal / Saved / Off T / Blocked / Wayward |
| `body_part` | Foot / head |
| `shot_type` | Open Play / … |
| `technique` | Technique |
| `under_pressure` | True if pressed |
| `first_time` | True if first-time |
| `assisted_by` | StatsBomb full name of the passer |
| `assisted_by_known_as` | Passer, name to print |

### `data/ucl_final_team.csv`

Team match stats for the final. 2 rows. Source: StatsBomb open data — logo and credit required. Used by: U09.

| column | meaning |
|---|---|
| `match_id` | StatsBomb match id |
| `date` | Match date |
| `team` | Team |
| `opponent` | Opponent |
| `passes` | Passes attempted |
| `pass_pct` | Pass completion % |
| `shots` | Shots |
| `xg` | Expected goals |
| `pressures` | Pressure events |
| `pressures_final_third` | In the attacking third |
| `pressures_middle_third` | In the middle third |
| `pressures_defensive_third` | In its own third |
| `counterpresses` | Counter-presses |
| `ppda` | Passes allowed per defensive action |

### `data/ucl_finalists_road.csv`

Porto’s and Monaco’s 13 games each, in order. 26 rows. Source: engsoccerdata (jalapic). Used by: U10.

| column | meaning |
|---|---|
| `team` | Finalist |
| `n` | Game number |
| `date` | Match date |
| `stage` | Stage |
| `opponent` | Opponent |
| `opponent_country` | Its country code |
| `venue` | H / A / N (neutral, the final) |
| `score` | Finalist first |
| `result` | W / D / L |

### `data/ucl_groups.csv`

The eight final group tables, ordered by UEFA 2003-04 rules (head-to-head first). 32 rows. Source: engsoccerdata (jalapic). Used by: U05.

| column | meaning |
|---|---|
| `group` | A–H |
| `team` | Club |
| `pos` | Position |
| `P` | Played |
| `W` | Won |
| `D` | Drawn |
| `L` | Lost |
| `GF` | Goals for |
| `GA` | Goals against |
| `Pts` | Points |
| `GD` | Goal difference |
| `country` | Country code |
| `country_name` | Country |
| `result` | Round of 16 / UEFA Cup (3rd) / Out |

### `data/ucl_matches.csv`

Every Champions League match, first qualifying round to final. 205 rows. Source: engsoccerdata (jalapic). Used by: U01, U03.

| column | meaning |
|---|---|
| `date` | Match date |
| `stage` | Q-1 / Q-2 / Q-3 / Group / R16 / QF / SF / final |
| `group` | Group letter (group stage only) |
| `leg` | 1 or 2 (two-legged ties) |
| `home` | Home club |
| `home_country` | Home club’s country code |
| `away` | Away club |
| `away_country` | Away club’s country code |
| `hg` | Home goals (after extra time where played) |
| `ag` | Away goals (after extra time) |
| `ht` | Half-time score |
| `tie_winner` | Who went through (knockouts) |
| `decided_by` | Blank, "extra time", "away goals" or "penalties h-a" |

### `data/ucl_scorers.csv`

Champions League top scorers (four goals or more), including qualifying. 19 rows. Source: UEFA via Wikipedia, 2003–04 UEFA Champions League. Used by: U08.

| column | meaning |
|---|---|
| `rank` | Rank (ties share one) |
| `player` | Player |
| `club` | Club |
| `goals` | Goals |
| `minutes` | Minutes played |
| `minutes_per_goal` | Minutes ÷ goals |

### `data/ucl_stages.csv`

The funnel: clubs, matches and goals at each stage. 8 rows. Source: engsoccerdata (jalapic). Used by: U02.

| column | meaning |
|---|---|
| `stage` | Stage |
| `clubs` | Clubs that played in it |
| `matches` | Matches |
| `goals` | Goals |
| `goals_per_game` | Goals ÷ matches |
| `home_win_pct` | Home wins as % of matches (the final was at a neutral ground; Porto were listed home) |

### `data/ucl_ties.csv`

Every two-legged tie and the final, with aggregates. 55 rows. Source: engsoccerdata (jalapic). Used by: U01, U07, U14.

| column | meaning |
|---|---|
| `stage` | Q-1 … final |
| `team_a` | Home club in leg 1 |
| `country_a` | Its country code |
| `team_b` | Away club in leg 1 |
| `country_b` | Its country code |
| `leg1` | Leg 1, team_a first |
| `leg1_date` | Leg 1 date |
| `leg2` | Leg 2, team_a first |
| `leg2_date` | Leg 2 date |
| `agg` | Aggregate, team_a first |
| `winner` | Who went through |
| `decided_by` | aggregate / away goals / penalties w-l (winner first) / aggregate after extra time / single match |

## Open checks before print

Claims in the copy that rest on sources outside these data files. They don’t block layout; keep the copy as given and leave these to the editor.

- [ ] **C00** — Mourinho's age at the final (41) — born 26 January 1963; confirm before print.
- [ ] **L01** — “First unbeaten top-flight season since Preston 1888–89” is not in our data: confirm wording against a published source.
- [ ] **L02** — Fees are as reported at the time and Wikipedia's list only holds deals at or above about £5m; say “£5m-plus signings” every time, never “spending”.
- [ ] **L02** — Abramovich's purchase date (July 2003) comes from events.csv, which is not hand-verified yet.
- [ ] **U01** — Partizan's away-goals win over Djurgården (3–3) and the shoot-outs are from engsoccerdata's pens column; spot-check against UEFA.
- [ ] **U02** — Porto as UEFA Cup holders (won May 2003) is outside this season's data; confirm.
- [ ] **L03** — Fulham's ground share at Loftus Road (2002–04) and City's first season at the new stadium are not in our data; confirm.
- [ ] **L03** — The 13.3 million total is avg_attendance × 19 summed over the Wikipedia table (13,297,359).
- [ ] **L04** — The £175,000 fine is from events.csv (not yet hand-verified).
- [ ] **L05** — Houllier's sacking (24 May 2004) is from events.csv.
- [ ] **U03** — “Highest-scoring game the Champions League had seen”, Pršo’s four goals and Deschamps as Monaco coach are not in our data: confirm against UEFA records.
- [ ] **U04** — The four goals in one game are not in our data (match scorers aren't loaded); confirm.
- [ ] **L07** — Ban start date 20 January 2004 is from contemporary reports, not our data; events.csv only has the 19 December hearing.
- [ ] **L07** — Correlation, not cause — the body says so; keep it.
- [ ] **L08** — Reyes fee (£10.5m) from events.csv.
- [ ] **L11** — The record claim (30 from the start of a season) is from events.csv; confirm the previous best before print.
- [ ] **L12** — Arsenal's FA Cup semi-final defeat (3 Apr, Manchester United) is not in our data; the Champions League exit (6 Apr) is.
- [ ] **U07** — Morientes on loan from Real Madrid, and scoring in that tie, is not in our data; confirm.
- [ ] **U07** — Porto's 1987 European Cup and the 1992 rename are outside our data; confirm.
- [ ] **L13** — The parade figure (250,000) is from events.csv, not yet hand-verified; confirm.
- [ ] **L14** — Leeds' 2001 Champions League semi-final is outside this season's data; confirm.
- [ ] **U09** — Goal minutes printed from StatsBomb's minute field + 1 (38→39, 70→71, 74→75); confirm against UEFA's report.
- [ ] **U11** — Appointment date 2 June 2004 from events.csv; confirm.
