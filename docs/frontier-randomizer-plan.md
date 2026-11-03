# Frontier Desk: a daily randomizer on AI Daily's arXiv papers

Status: built (draw, pool, record, brief, admin tab, API, MCP, cron). Deploy
needs migration 099 applied; no new env.

## Why

AI Daily (the Doom v Boom edition at `/ai-daily/doom-v-boom`) already scrapes
and gates arXiv every morning: `ingest-papers.ts` reads cs.AI, cs.CL, cs.LG,
cs.CV, cs.AR and cs.DC, keeps 6 to 10 papers a day with a data-center-scale or
frontier-AI bearing, and files each one's area, headline benchmark (baseline
and result), compute bucket, scale, what was released, a why-it-matters line
and a 1 to 5 importance in `dc_papers`. The edition shows the top 8 for a day
and moves on. The Frontier Desk turns that growing archive into one deeper
story a day: one paper, read properly.

## Shape

`frontier`: **area** (the gate's 6), **window** (This week / This month /
Back catalogue, by age), **paper** (live from `dc_papers`), **lens** (7).
Ungated. Sequence mode, "Follow the thread": a pool paper that shares tags or
the benchmark with the previous spin's.

Unlike the Evidence or 100 Desks there is no committed list: the pool is
read at spin time, like the Football Desk's news snapshot.

1. `loadFrontierPool` (spins.ts): kept papers from the last 365 days, plus
   published editions' `paper_ids` for the featured marks.
2. `drawFrontier` (draw.ts, pure): area by the square root of its count
   (re-drawn once on a repeat), window by weight 3/2/1 among those the area
   has, paper by importance (+1 if featured), 90-day paper block, lens,
   90-day (paper, lens) block.
3. `loadFrontierRecord` (frontierPool.ts): arXiv `id_list` (version, journal
   reference, DOI, comment) and OpenAlex by `10.48550/arxiv.<id>` (citations).
   Never throws.

The spin freezes the paper, up to 5 related pool papers, 40 titles for the
reel blur and the record, so a logged spin replays without the database.

## Editorial rules the brief carries

- The gate's fields are a model's reading of the abstract: leads, never
  sources. Every number comes from the paper's table or figure.
- arXiv is a preprint: labelled wherever its result appears, its claims
  reported as the authors' until replicated or peer-reviewed.
- A benchmark number goes with its baseline and setting; contamination is
  checked.
- Compute, energy and money figures not in the paper name a public source and
  every assumption (the "What it costs" lens ties papers to the build-out AI
  Daily tracks).

## Open questions

- The pool is only as good as the gate. If `ingest-dc-papers` stops, the desk
  503s with a pointer to it (the cron logs the failure).
- Papers rejected by the gate (`relevant = false`) are never drawn. A
  "wildcard" window over them would need its own rules.
- 365 days is a guess; widen `DRAW_RULES.frontierPoolDays` once the archive
  is deep enough to make the back catalogue interesting.
