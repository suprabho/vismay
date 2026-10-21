# Landmark Desk — a daily prize-winning-research randomizer

A seventh randomizer on the existing slot machine (`packages/randomizer`),
hosted on vizmaya.fyi as a fifth tab next to Desk, Atlas, Epics and the OCW
Desk. It draws one **field → prize → era → laureate → work → lens** chain a
day from the official prize lists (the Nobel science prizes and the prizes
that stand in for a Nobel elsewhere), resolves the paper or book the award
rewarded through open scholarly infrastructure (Wikidata → OpenAlex →
Unpaywall, Open Library for the book prizes), and the agent brief then
carries the award, its motivation verbatim, and the work.

Status: **built** (steps 1 to 9 of section 6, on branch
`ccr-cc90d5c5-qmg606`). To go live: apply migration 094 and deploy
vizmaya-fyi (the cron entry is in its `vercel.json`; `CRON_SECRET` is
already set). Two optional env vars on vizmaya-fyi make the works stage
complete: `OPENALEX_API_KEY` (free; without it OpenAlex list calls, and so
the "most-cited work before the prize", are skipped and the spin says so)
and `UNPAYWALL_EMAIL` (the contact Unpaywall requires; without it the
free-to-read link comes from OpenAlex alone, or not at all).

> On the count: the repo has six randomizer ids (`desk`, `atlas`, `epics`,
> `ocw`, `footshorts`, `viznba`), four of them on vizmaya. The Landmark one
> is the fifth vizmaya tab and the seventh id.

## 1. Where the prize-winning papers live (what was verified)

The foundation is a two-layer system: **official prize lists** decide what
counts as landmark work; **open scholarly infrastructure** resolves and
links each item. For the Nobel science prizes there is a curated map from
laureates to their prize-winning papers (Li, Yin, Fortunato and Wang, "A
dataset of publication records for Nobel laureates", *Scientific Data*
2019, Harvard Dataverse doi:10.7910/DVN/6NJ5RN: 874 prize-winning papers for
545 laureates in Physics, Chemistry and Medicine to 2016, keyed on retired
Microsoft Academic Graph ids). Outside the Nobels most prizes honour a
person or a discovery rather than a paper, so the app mostly has to *infer*
"the paper" and say so. The exceptions are the book prizes (Bancroft,
Pulitzer History, Wolfson) and the paper prize (Gödel).

Checked on 2026-10-21 through the deployment's proxy, no auth, JSON:

| Source | What it gives | Checked |
|---|---|---|
| **Nobel Prize API v2.1** (`api.nobelprize.org/2.1`) | `nobelPrizes?nobelPrizeCategory=phy&nobelPrizeYear=&yearTo=&limit=500`: every prize of a category with its laureates, share and the official motivation (CC0; terms: do not alter or censor the data, cache rather than hammer). `laureate/{id}`: the Wikidata item, the Wikipedia article, the `fileName` the lecture page uses. | 126 physics prizes, 231 laureates, 1901 to 2026, one call |
| **Wikidata SPARQL** (`query.wikidata.org/sparql`) | `P166` "award received" on the laureate with `P585` for the year; `P1686` "for work" where the award names the work; on the laureate `P496` ORCID, `P10283` OpenAlex id, `P648` Open Library id, `P800` notable works. CC0. The search API (`wbsearchentities`) is rate-limited from shared IPs; label lookups through SPARQL are not. | 42 prizes resolved by label; e.g. Gödel 88 awards (7 naming the work), Bancroft 187 (15), Pulitzer History 108 (21), Abel 29 (1). `P1686` is patchy everywhere, and sometimes names a theory, not a paper |
| **OpenAlex** (`api.openalex.org`) | `works/doi:…` (citations, FWCI, top-1% flag, open access, retraction, counts by year): a single-record lookup, free. `authors?search=` and `works?filter=` are list calls, metered: without a key they draw on a budget shared by every caller on the IP, which was already spent. A free key (`OPENALEX_API_KEY`) has its own $1 a day. Data CC0. | DOI lookup works keyless; list calls answer 429 without a key |
| **Unpaywall** (`api.unpaywall.org/v2/{doi}?email=`) | `best_oa_location` (prefers the publisher's version of record, then repositories), `oa_status`. Needs a real contact email; 100,000 calls a day. | 422 without an email, as documented |
| **Open Library** (`openlibrary.org/search.json?author=`) | Books by author with `first_publish_year`, publishers, ISBNs and the work key, no key. | 31 works for Lyndal Roper |
| **Crossref** | DOI metadata, free. Not used: OpenAlex's DOI lookup carries what the brief needs. | works |

Facts that shape the design:

- **Awards hang on people, not papers.** On Wikidata the award statement is
  on the laureate; the work is a qualifier that is usually missing. So the
  draw picks a laureate first and resolves the work second, and the brief
  labels any work the award record does not name as a **representative
  work**, never "the prize-winning paper".
- **Nobel motivations are verbatim, CC0 and must not be altered.** The brief
  quotes them in quotation marks and links to nobelprize.org; the
  "Advanced information / Scientific background" page for each prize year
  (`/prizes/{field}/{year}/advanced-information/`) is linked, never parsed
  or rehosted: it is Nobel Prize Outreach's copyright, and it is where the
  reference list lives.
- **OpenAlex's list endpoints need a key since February 2026.** The loader
  does the free DOI lookups without one, skips the author search and the
  top-cited works without one, and says so in a rule, so a spin never fails
  for lack of a key.
- **Citation counts favour methods papers**, not discoveries (Nature's top
  100: the Lowry protein assay, not the double helix). The draw prefers what
  the award record names, then a notable work, then the most-cited work
  before the prize, and labels each tier.
- Semantic Scholar's API licence restricts some uses to non-commercial, so
  it is not used; Papers With Code shut down in July 2025, so it is not
  planned around.

## 2. The randomizer

Id `landmark`, name **Landmark Desk**, hint "Prizes · laureates · papers",
app `vizmaya-fyi`, format "Landmark paper explainer with charts",
`gated: false` (prize data and published papers; nothing the Atlas rules
cover).

### Reels (in `RANDOMIZER_META.landmark.reels`)

| Key | Label | Pool | Lockable | Parents |
|---|---|---|---|---|
| `field` | Field | 10 fields (dataset) | yes | |
| `prize` | Prize | 42 prizes (dataset), those in the field with awards | yes | `field` |
| `era` | Era | 5 bands (dataset), those the prize has awards in | yes | `prize`, `field` |
| `laureate` | Laureate | live: the prize's awards in the era (Nobel API or Wikidata) | yes | `era`, `prize`, `field` |
| `work` | Work | live: the laureate's works (Wikidata, OpenAlex, Open Library, Unpaywall) | yes | `laureate`, … |
| `lens` | Lens | 7 lenses (dataset) | yes | |

Option toggle: `{ key: 'sequence', label: 'Follow the prize (the year before)' }`.
With it on, the draw keeps the previous spin's prize and walks to its
previous award year (the Epics sequence mode, on a prize instead of a
route): "study one prize's history for a week".

Fields and prizes (`data/landmark.json`, written by
`scripts/randomizer/landmark-taxonomy.mts`): Physics & astronomy (Nobel
Physics, Wolf Physics, Breakthrough Fundamental Physics, Kavli
Astrophysics, Shaw Astronomy), Chemistry (Nobel Chemistry, Wolf Chemistry),
Medicine & life sciences (Nobel Medicine, Lasker Basic, Lasker-DeBakey
Clinical, Wolf Medicine, Kavli Neuroscience, Shaw Life Science,
Breakthrough Life Sciences), Economics (the Nobel economics prize, John
Bates Clark Medal), Mathematics (Abel, Fields, Wolf Mathematics,
Breakthrough Mathematics, Schock Mathematics, Shaw Mathematical Sciences),
Computer science (Gödel, Knuth, Turing), Humanities & philosophy (Holberg,
Kluge, Balzan, Berggruen, Kyoto Arts and Philosophy, Schock Logic and
Philosophy, Erasmus), History (Wolfson, Pulitzer History, Bancroft), Social
sciences (Johan Skytte), Science & technology cross-field (Crafoord, Japan
Prize, Tyler, Kyoto Basic Sciences, Kyoto Advanced Technology, Kavli
Nanoscience). Each prize carries its award source (`nobel` with the API
category, or `wikidata` with the item), what its citation names (`works`:
paper, book, result, body), whether it is **work-level** (the Nobels through
their background documents, the Gödel Prize, the book prizes), the official
list URL, and its awards per era at the last refresh (3,069 dated awards;
92 of 210 prize-and-era pairs are empty, so the plan never asks for one).
The Stockholm Prize in Criminology is left out: Wikidata dates one of its
nine awards. Pritzker (buildings), Dan David (early-career since 2022) and
the Peace and Literature Nobels (not research) are out by design.

Eras: 1901 to 1945, 1946 to 1969, 1970 to 1989, 1990 to 2009, 2010 onward.

Lenses (what the story does with the work):

| Lens | The story |
|---|---|
| Why it won | The official motivation beside the work: what exactly was rewarded, where in the work it is, what the motivation leaves out. |
| One figure | The work's central figure, table or theorem, rebuilt as one chart from its own numbers. |
| What it replaced | What the field believed before, the evidence that turned it over, who held the old view. |
| Read it today | A reader's guide to the work itself, and where to read it free of charge. |
| Citation trail | Citations by year, the lag from publication to prize, who built on it (OpenAlex). |
| Missing names | The co-authors, rivals and predecessors the citation does not name, from the record. |
| Explain like I'm 5 | The result for a five-year-old: one everyday stand-in, then where it stops being true. |

### The draw (`drawLandmark` in `draw.ts`)

Pure and deterministic like the others, in three stages that share one
seeded rng, because the laureate and work pools come from live sources and
each depends on the stage before:

1. **Plan** (pure, `planLandmark(input)`):
   - `field`: uniform over the fields with a stocked prize, re-drawn once
     when it equals the last kept spin's field (the Atlas region rule).
   - `prize`: uniform inside the field, minus prizes spun in the last 30
     days (the block lifts when every prize in the field is blocked).
   - the **work-level quota**: if the last two kept spins were both on
     prizes that do not name the work, this one draws only from prizes that
     do (the OCW hands-on quota, on a different axis).
   - `era`: uniform over the eras the prize has awards in.
   - `lens`: uniform. One rng draw `u` is kept so the sequence is fixed.
   - Locks keep the previous spin's value for any of these (parents implied).
2. **Awards** (server, `loadLandmarkAwards(plan)` in `landmarkPool.ts`):
   one call to the Nobel API or one SPARQL query for every award of the
   prize in the era, one row per laureate and year, oldest first. Then
   `planLandmark(input, awards)` runs the plan again (same rng) and picks
   the **laureate**: laureates spun in the last 30 days are left out, no
   award is spun twice, the block lifts when everything is blocked; in
   sequence mode, the latest award year before the previous spin's.
3. **Works** (server, `enrichLandmarkAward` then `loadLandmarkWorks`): a
   Nobel laureate's record gives the Wikidata item and the lecture page;
   then Wikidata for the laureate's ids and named or notable publications,
   OpenAlex by DOI for each (free) and for the top-cited works before the
   prize (with a key), Open Library for the book prizes (or when nothing
   else was found), Unpaywall for the free copy (with an email). Each
   source's state (ok, failed, no key, no email, skipped) is recorded.
4. **Pick** (pure, the rest of `drawLandmark`): drop retracted works; take
   the first non-empty tier (what the award names, then a notable work,
   then the top-cited work, then a book; for a book prize the book before
   the top-cited paper; a named *subject* such as a theory only when no
   publication was found), weighting free-to-read copies 3 to 1; the
   combination (prize, laureate, lens) is blocked for 90 days, so the lens
   is re-drawn.

`draw()` takes the pool as `landmarkPool` the way it takes `ocwPool`, and
throws when it is missing, when the awards are for another query, or when
the works are for another laureate. The award, the work, the other works
(related reading), the laureate names of the era and the sources' states
are frozen into `subject`, so a logged spin replays from the log alone.

Rules fired: the field re-draw, the 30-day prize and laureate blocks, the
quota, the era note, the work's basis (good when the award record names a
publication; warn when it is representative, a subject, or missing), open
access, the sources that were skipped or failed, the 90-day combination
re-draw, the pool size, the read-first step, the licence reminder.

### Types (`types.ts`)

`RandomizerId` gains `landmark`; `LandmarkField`, `LandmarkEra`,
`LandmarkPrize` (with `LandmarkPrizeSource`), `LandmarkDataset`,
`LandmarkNamedWork`, `LandmarkAward`, `LandmarkWork` (with `basis` and
`representative`), `LandmarkSources`, `LandmarkQuery`, `LandmarkPlan`,
`LandmarkPool`, `LandmarkPicks`, `LandmarkSubject`. `SpinMeta` gains
`fieldId`, `prize` and `workLevel`. `primary` is the laureate id
(`nobel:988`, `wd:Q193803`); `combo` is `prize|laureateId|lens`.

## 3. Picking a laureate and a work every day

Three layers, from fully automatic to fully manual; one spin log.

**A. The morning spin (automatic).** A Vercel cron on vizmaya-fyi
(`apps/vizmaya-fyi/vercel.json`) at `45 5 * * *` UTC (11:15 IST) calls
`/api/randomizer/cron/landmark`: fails closed without `Authorization:
Bearer $CRON_SECRET`, then `createSpin({ randomizer: 'landmark',
createdBy: 'cron' })` only if no kept Landmark spin exists for today (UTC).
About six to twelve HTTP calls, one to two seconds.

**B. The look (manual, two minutes).** `/vizmaya/randomizer`, Landmark Desk
tab: today's spin with its six reels and the rules, and under it the
**Landmark pool** panel: the award card (year, laureate, share,
co-laureates, the motivation verbatim, links to the laureate page, the
prize summary, the background document, the lecture, Wikipedia), the work
card (title, year, venue, authors, DOI, free-to-read link and status,
citations, FWCI, top-1% badge, retraction flag, and its label: named by the
award, representative, or a subject), the other works the loader found, the
other laureates of the era, and the four sources' states with any notes and
errors. Re-spin with a reason, lock a reel and re-spin (keep the prize but
draw another era; keep the laureate but try another work; keep the work but
try another lens), or flip **Follow the prize**.

**C. The story (agent).** `GET /api/html-stories/brief?spin=<id>` on
vizmaya.fyi (`&format=deck` suggested). MCP: `spin_randomizer` with
`randomizer: "landmark"`, `get_landmark_pool` to look first,
`get_html_story_brief`, research, `save_spin_research`,
`publish_html_story` with the `spinId`. Ungated.

## 4. The brief and the research stub

`spinBrief.ts`'s `landmarkAssignment` writes the field and prize (what its
citation names), the award with its motivation verbatim, the work with its
links and label, the lens, the "do this first" steps (read the work; read
the award's own account; confirm a representative work against it; apply
the lens to the work, not the career; the credit line), the other works,
the other laureates of the era, OpenAlex's citations by year, the loader's
notes, the chart metrics per lens and where to start. `landmarkFormat` is
the journal-club page: headline and dek, the award with the motivation
quoted, the work with its label, the one result, chart 1 (the work's own
figure), chart 2 (the citation trail or the comparison), the lens read,
where it breaks, go further, credit, sources. The research protocol adds
rule 8: the work is the primary source for what it says; the motivation is
never paraphrased inside quotation marks; which paper won is a claim like
any other, Verified only when the award's account names it. `stub.ts`'s
`landmarkTemplate`: the award, the work, the one result, what the work
says, what the award rewarded, the lens read, the data pull (with the
citation record), where it breaks, credit. `brief.ts` adds the content
rules (link the work and the laureate page; motivation verbatim;
"representative work" wording; CC0 credits; never rehost).

## 5. Admin, API, MCP

- **Admin**: the tab appears from `randomizersFor('vizmaya-fyi')`;
  `RandomizerClient` gets the `LandmarkPool` panel and blurs the laureate
  and work reels through the spin's own pool.
- **Agent API** (vizmaya-fyi): `GET /api/randomizer/landmark?prize=&era=&laureate=`
  (the awards as a spin reads them; with `laureate`, that laureate's works;
  without a query, the taxonomy) and the cron route.
- **MCP**: `spin_randomizer` takes `landmark` (with `sequence` and the locks
  `field, prize, era, laureate, work, lens`); `get_landmark_pool`.
- **Migration** `094_randomizer_landmark.sql`: widen the `randomizer` check.

## 6. Files, in build order

| Step | Files | Notes |
|---|---|---|
| 1. Taxonomy | `scripts/randomizer/landmark-taxonomy.mts`, `packages/randomizer/src/data/landmark.json` | The prize list is hand-picked in the script; counts per era from the Nobel API (one call per category) and one SPARQL query. `--check` for CI. |
| 2. Types and dataset | `types.ts`, `datasets.ts` | `RandomizerId`, `RANDOMIZER_META.landmark`, the `Landmark*` types, `LANDMARK`, `isWorkLevel`, `landmarkStocked`, `reelPool`. |
| 3. Draw | `draw.ts`, `draw.test.ts` | `planLandmark`, `drawLandmark`, `DRAW_RULES.landmarkOaWeight = 3`; tests on synthetic awards and works: determinism across the stages, the mismatch throws, locks, the quota, the blocks, sequence mode, the work tiers. |
| 4. Pool and server | `landmarkPool.ts`, `spins.ts` | The mappings (tested on recorded Nobel, SPARQL, OpenAlex, Open Library and Unpaywall responses), the loaders (tested on a fake API), `createSpin`'s three passes, `LANDMARK_SPIN_RULES`. |
| 5. Brief | `spinBrief.ts`, `stub.ts`, `packages/html-stories/src/brief.ts`, `formats.ts` | Assignment, format, protocol rule, chart rules, checklist, template, credit line. |
| 6. Migration | `supabase/vizmaya-fyi/migrations/094_randomizer_landmark.sql` | Widen the check. |
| 7. Admin | `apps/admin/components/randomizer/RandomizerClient.tsx`, the page | Tab copy, the pool panel, reel strips, the migration hint. |
| 8. API and cron | `packages/html-stories/src/randomizerApi.ts`, `apps/vizmaya-fyi/app/api/randomizer/landmark/route.ts`, `…/cron/landmark/route.ts`, `vercel.json` | |
| 9. MCP and docs | `packages/mcp/src/tools/randomizer.ts`, `packages/mcp/README.md`, `apps/vizmaya-fyi/CLAUDE.md`, `apps/admin/CLAUDE.md`, `README.md` | |

Steps 1 to 5 are testable offline (`npx tsx src/draw.test.ts`); the live
path was smoke-tested against the real Nobel, Wikidata and Open Library APIs
for a Nobel, a Wikidata, a book and a result-level prize.

## 7. Decisions taken, and the alternatives

| Question | Default | Alternative |
|---|---|---|
| Awards: committed or live | Live (one call per spin), with the taxonomy and per-era counts committed, as the OCW Desk does | Commit all 3,069 awards (about 600 KB of JSON the admin bundle would carry) for an offline laureate reel. |
| Li et al.'s 874 Nobel papers | Not imported: its ids are retired MAG ids that need remapping, and OpenAlex's top-cited-before-the-prize rule with the background document linked covers the same ground | A one-off remap into a `nobel_papers` table, marked `citation` basis. |
| Which work wins | Named by the award record, then notable, then top-cited (book first for the book prizes); OA weighted 3 to 1 | Highest FWCI; or always ask the agent to reconstruct it. |
| Weighting across prizes | Field first, then prize, then era: uniform, so Nobel Physics (231 laureates) and Berggruen (7) are equally likely once their field comes up | Weight by award count, which the report warns against. |
| OpenAlex and Unpaywall credentials | Optional env vars; the spin degrades and says so | Required: fail the spin without them. |
| Gate | Ungated | Gate if the "Missing names" lens starts producing takes that need a second pair of eyes. |

## 8. Risks

- **Wikidata SPARQL is public but not a commitment**, and can be slow. Every
  call carries a 12 s timeout; a failed awards read is a 503 the admin shows
  and the cron retries next day; a failed works read is recorded on the
  spin and the brief says what is missing.
- **"Prize-winning paper" is a reconstruction** for most prizes. The UI, the
  rules and the brief label every tier; the research protocol makes "which
  paper won" a claim to verify against the award's own account.
- **Wikidata's "for work" sometimes names a theory**, not a paper (the
  Weinberg-Salam theory for Salam's Nobel). Such items are kept as subjects
  and lose to any publication; the rule asks for the paper that established
  it.
- **Open Library's author match is by name** when the laureate has no Open
  Library id: every part of the name must appear in one author name, and
  the note says to check the title against the prize's list.
- **Citation metrics work poorly for books and the humanities**, so the
  book prizes draw from Open Library by year, not from FWCI, and the brief
  points at the prize's own list.
- **Licensing**: metadata from Nobel Prize Outreach, Wikidata and OpenAlex is
  CC0; papers, books, the background documents and the lectures are not.
  The brief links; it never rehosts.
