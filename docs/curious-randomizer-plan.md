# The Curious Desk — a daily randomizer on verified facts and anecdotes

An eleventh randomizer on the existing slot machine (`packages/randomizer`),
hosted on vizmaya.fyi as a ninth tab next to Desk, Atlas, Epics, the OCW
Desk, the Landmark Desk, The 100 Desk, the Evidence Desk and the Frontier
Desk. It draws one **era → theme → claim → lens** chain a day from the
claims a human approved in the provenance-first claim pipeline
(`packages/curious-pipeline`, migration 101), reads the drawn claim's cited
work, book, entities and archive copy live, and the agent brief then asks
for a claim check that **prints the grade, counts lineages instead of
articles, and splits the supported core from the embellishment**.

Status: **built** on branch `ccr-62695046-trqap3`. To go live: apply
migrations 101 and 102 and deploy vizmaya-fyi and admin (the cron entry is
in vizmaya-fyi's `vercel.json`; `CRON_SECRET` is already set). Optional env:
`CROSSREF_MAILTO` (the polite pool), `GOOGLE_BOOKS_API_KEY`,
`EUROPEANA_API_KEY` (the Europeana collector stays idle without it).

## 1. Why a pipeline, not a scrape

The design this desk comes from says the most entertaining anecdotes are
the ones most vulnerable to repetition without evidence, and that five
articles derived from one unsourced account are one evidentiary lineage,
not five confirmations. So the desk never draws from raw documents. The
pipeline runs in stages, each a CLI in `apps/vizmaya-fyi/scripts/curious/`:

1. **Collect** (`curious:collect`): broad, high-recall discovery from GDELT
   DOC 2.0 (current affairs; one request every five seconds; article text
   never stored), the Library of Congress (`?fo=json`; facet partitions
   under the deep-paging cap; OCR text kept only for public-domain items),
   Europeana (cursor paging; CC0 metadata always kept) and Gallica (SRU
   discovery, ContentSearch OCR snippets with page markers, five calls a
   minute, eighty requests a run). Every document keeps its canonical URL,
   retrieval time, rights, content hash and the request that found it. A
   source policy registry (`curious_sources`, mirrored in `policy.ts`) is
   consulted before any fetch; there are no social-media rows.
2. **Detect** (`curious:detect`): regex rules over sentence chunks
   (firsts, lasts, onlys, hearsay, years-later, twists, numbers, dates,
   records, quotations), at most three passages per document, then a
   schema-constrained model pass (Claude Haiku through the AI gateway)
   that returns atomic claims each with a **verbatim evidence quote of at
   most 300 characters**; a claim whose quote cannot be located in the
   passage is dropped. Claims are clustered lexically, every supporting
   source gets an **independence group** (DOI, ISBN, a shared sentence, a
   wire agency, an attributed speaker, else the publisher), and
   contradictions on figures, years or negation are linked both ways.
3. **Grade** (`curious:grade`): an A to E grade from explicit features, never
   prose: primary source 0.30, independent contemporaneous lineages 0.20,
   institutional quality 0.15, quotation found in print 0.10, chronology
   against the entities 0.10, geography 0.05, text confidence 0.05,
   scholarship cited 0.05; minus anonymous repetition 0.10, circular
   citation 0.15, time gap 0.10, translation 0.05, contradiction 0.25. A ≥
   0.75, B ≥ 0.55, C ≥ 0.40, D ≥ 0.25, else E, with D as a floor for the
   case the design names D (three or more sources, uncontradicted, not
   circular, chronologically possible). The features and the grader's notes
   are stored beside the grade.
4. **Verify** (`curious:verify`): Crossref for cited works and whether their
   references loop back into the cluster, Google Books for cited books and
   whether a quotation exists in print, Wikidata for entity dates, countries
   and the living-private-person signal; then a re-grade.
5. **Review**: the admin **Curious claims** tab (`/vizmaya/curious`):
   approve, send back with a note, reject, fix the wording; `j`/`k`,
   `a`/`s`/`r`, `e`, `o`, `g`. Approve is the only transition into
   `curious_claim_pool`.

The worked example from the design is a fixture
(`packages/curious-pipeline/src/fixtures/disco-dancer.json`) the tests hold
to its grades: *Disco Dancer*'s 60.9 million Soviet admissions (a
contemporaneous distribution record plus a journal article) grades A or B;
"the KGB used *Jimmy Jimmy Aaja* to catch spies" (three retellings of one
anonymous account) grades D. `pnpm curious:seed-fixture` loads both as
approved claims so the desk has a pool before the collectors have run.

## 2. The dataset (`data/curious.json`)

Hand-kept. The source (the pool view, the CLIs, the admin tab, a note the
brief quotes), nine eras (eight dated ones whose ids match
`curious-pipeline`'s `taxonomy.ts`, plus `undated`), nine regions, twelve
themes, the five grades with what each lets the page say, and seven lenses:
Trace the lineage, Core vs embellishment, The number behind it, Where it
happened, Then and now, Who says so, Explain like I'm 5.

## 3. The pool (`loadCuriousPool` in `spins.ts`, `curiousPool.ts`)

Read before the draw: every row of `curious_claim_pool` (approved claims
joined to their document, with source, lineage, primary, derived and
contradiction counts and the entity names), paged past PostgREST's
1,000-row cap, plus each claim's `doi:`, `isbn:`, `qid:` and `url:`
references from `curious_claim_sources`. `curiousPoolFromRows` is the pure
half: newest approval first, the id as tie-break, so a seed replays.

## 4. The draw (`draw.ts`, `drawCurious`)

Pure and deterministic per seed, like every desk:

1. **Era** first, weighted by the square root of its claim count, so a busy
   era does not crowd out a quiet one; the same era twice in a row is
   re-drawn once.
2. **Theme**, one the era has claims in, weighted the same way.
3. **Claim** in the cell, minus anything spun in the history the draw sees
   (lifted to the one spun longest ago when the cell empties), weighted by
   grade (A 5, B 4, C 3, D 1, E 1) plus one when two independent lineages
   agree; the same region as the previous spin is re-drawn once.
4. **Lens**; (claim, lens) is blocked for 90 days.
5. **Rules:** the grade rule on every spin (A/B good, C info, D/E warn:
   "widely repeated is not verified"), the lineage rule when three or more
   sources collapse to one lineage, a primary rule, a contradiction block, a
   personal-data warning, a sensitive warning, an attribution note for
   hearsay or an unnamed source, circular and time-gap notes.

**Pull the thread** (sequence mode): a claim sharing a named entity with
the previous spin's, weighted by how much they share; an era, theme or
claim lock wins over it. Locks: era, theme (takes era), claim (takes theme
and era), lens.

The desk is **gated**: the hero insight waits for a human before anything
public is built from it, because the page asserts something about the
world even when the grade is good.

## 5. The record (`curiousPool.ts`, `loadCuriousRecord`)

Read in `spins.ts` after the draw, never thrown: the cited work on Crossref
by the claim's first DOI reference (title, venue, year, type, citations),
the cited book on Google Books by its first ISBN, up to three entities on
Wikidata (life dates, a work's date), and the Wayback Machine's nearest
snapshot of the evidence document when the pool has none. Each source's
state is kept on the record; a failed source becomes a `record` rule, a
found work a `cited` rule, a missing snapshot an `archive` rule.

## 6. The brief

`GET vizmaya.fyi/api/html-stories/brief?spin=<id>` (`&format=deck` is the
suggested format). The assignment carries the claim, its grade with the
features behind it and the rule the grade allows, the evidence quote and
its document with the archive copy, the attribution, the flags, the
entities, the lens, the record, the related claims and read-first steps
(read the evidence document; find a primary source; count lineages not
articles; split core from embellishment; state your own grade; credit). The
research protocol adds: verify at the level of the claim; two sources are
independent only when neither descends from the other; print the desk's
grade and yours; a grade D or E claim is reported as repeated, never as
having happened; the evidence quote is the only verbatim copyrighted text.
The format is a claim check (the claim card with the grade badge, the
evidence, the lineage chart as a tree, core and embellishment, the lens
chart and read, who says so, what would settle it, credit). The content
rules (`CURIOUS_SPIN_RULES` in html-stories `brief.ts`) repeat the grade,
lineage, quotation and privacy rules. An "Explain like I'm 5" spin gets the
picture-story format like the other desks.

## 7. Steps (all done)

1. Migration 101 (the claim store), `packages/curious-pipeline`, the four
   collectors, detection, extraction, dedupe, contradictions, the grader,
   verification, the CLIs and the Disco Dancer fixture (P1 to P3).
2. The admin Curious claims tab and its two routes (P3).
3. Types (`curious` in `RandomizerId`, `RANDOMIZER_META.curious`, gated),
   the dataset and its helpers, reel strips.
4. The draw, its rules and sequence mode.
5. The pool mapping, the record loader and their wiring in `createSpin`.
6. Brief sections, the research stub, the html-stories content rules, ELI5.
7. Migration 102 (widens the `randomizer` check).
8. vizmaya-fyi: `GET /api/randomizer/curious[?claim=]` and the daily cron at
   06:10 UTC (`GET /api/randomizer/cron/curious`, `CRON_SECRET`).
9. Admin: the Curious Desk tab with the **Curious claim** panel.
10. MCP: `spin_randomizer` takes `curious`; `get_curious_pool`.
11. Tests in `packages/randomizer/src/draw.test.ts` (the dataset against the
    pipeline's taxonomy, the pool mapping, determinism, era and grade
    weighting, locks, the claim block and its lift, the era re-draw,
    sequence mode, the lens block, the flag rules, the record on a fake
    fetch, the credit line and brief) and in
    `packages/html-stories/src/brief.test.ts` (the grade in the brief, the
    lineage rule, the ELI5 check), and `packages/curious-pipeline/src/pipeline.test.ts`
    for the pipeline itself.

## 8. Nightly runs, the composer and the evaluation (done)

- `.github/workflows/curious-collect.yml` (one source per run; GDELT and the
  Library of Congress nightly, Europeana and Gallica by hand) and
  `curious-detect.yml` (detect → grade → verify as one job, each stage under
  its cap and a 25-minute deadline), dispatched by Vercel cron through
  `apps/vizmaya-fyi/app/api/curious/cron/[job]` at 02:20, 02:40 and 03:50
  UTC, since GitHub's own scheduler drifts. Roughly 2,000 documents and 200
  to 400 candidate claims a night, so the pilot's 10k to 50k documents and
  1k to 5k claims land in two to four weeks plus a few manual dispatches.
- The composer's **Curious claims** library (`curiousClaimsProvider` in
  `apps/admin/lib/libraryProviders.ts`): approved claims as text sources
  carrying the grade, the notes, the evidence quote, the document and the
  lineage counts.
- `pnpm curious:evaluate -- --sample 100` queues a stratified batch across
  the grades and prints the review table; `-- --report latest` prints
  approval rate per grade, the grade's agreement with the verdicts, and
  claims (and verified claims) per reviewer-hour from the review timestamps.

## 9. Open risks

- Live reachability from a shared egress: GDELT throttles by IP, counted
  from its last response, and the first nightly run on the GitHub runner
  was refused on its second request. The limiter now measures the gap from
  the response, keeps six seconds, backs off for up to ten minutes, reads
  only the last two days by default, and treats a persistent throttle as a
  warning rather than a failure when at least one request got through.
  GitHub's runners share egress IPs with other tenants, so a throttled
  night can still happen; if it happens nightly, the next step is a Google
  News RSS discovery collector, the pattern `scrape-news.ts` already uses
  from Actions. Gallica sits behind a Cloudflare rule that blocks datacenter IP ranges
  outright, GitHub's runners included, so it is disabled in the policy
  registry until it can be run from a network BnF allows (or BnF grants
  API access); a bot wall is not something to spoof past. The Library of Congress serves a query
  cold the first time, streaming slowly or answering a 503 page until its
  cache warms, so its collector uses a 90-second timeout, waits of 15 to
  120 seconds across five attempts and 50 results a page, and treats a
  search that stays down like a throttle: keep what was collected, warn,
  and leave the rest for the next night.
- `EUROPEANA_API_KEY` is not yet issued: the collector fails closed with the
  message, and the registry row stays enabled for when it arrives.
- The grade is only as good as the sources found: a claim graded D for want
  of a primary source is the research's first job, and the brief says so.
- The pipeline's tests run on fixtures and a fake fetch; the end-to-end path
  against Supabase and the live APIs needs `.env.local` and a first
  `curious:seed-fixture` run, which this session could not do.
