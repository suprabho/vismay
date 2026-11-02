# The Evidence Desk — a daily social-media-research randomizer

A ninth randomizer on the existing slot machine (`packages/randomizer`),
hosted on vizmaya.fyi as a seventh tab next to Desk, Atlas, Epics, the OCW
Desk, the Landmark Desk and The 100 Desk. It draws one **theme → design →
study → lens** chain a day from *Social Media and Its Effects on People and
Society: An Annotated Research Collection* (2026 edition: 83 papers and
reports in 7 themes), reads the drawn study's citation record from OpenAlex,
and the agent brief then asks for an evidence explainer that **holds the
finding to what its design can show** and puts the other side on the page.

Status: **built** on branch `claude/elegant-dirac-r82l39`. To go live: apply
migration 098 and deploy vizmaya-fyi (the cron entry is in its
`vercel.json`; `CRON_SECRET` is already set). No new env; the optional
`OPENALEX_API_KEY` and `UNPAYWALL_EMAIL` the Landmark Desk uses are read
here too.

## 1. The collection and the sources

**The collection** is committed at
`scripts/randomizer/sources/social-media-research-2026.md` and is the source
of truth: every study's citation, DOI or link, access mark (`[OA]`,
`[Free copy]`), type and sample, findings and footnoted sources are parsed
from it. Its overview table gives each theme a strength-of-evidence verdict
and a bottom line; its key findings, caveats and "gaps to watch" are kept for
the brief.

**OpenAlex** (`api.openalex.org`): one free singleton lookup per spin, by the
work id the taxonomy script resolved (else by DOI): title, venue, year,
citations and citations by year, field-weighted citation impact, the top-1%
flag, retraction, a free-to-read link. CC0. List calls (search, filters) need
`OPENALEX_API_KEY` since February 2026, so neither the script nor the loader
uses them. Checked on 2026-11-02: 78 of the 83 entries resolve; #8 (Surgeon
General), #10 (APA), #26 (listed without a DOI), #68 (Media Ecosystem
Observatory) and #73 (eSafety) have no DOI, so their record is `skipped`.
Four link-only entries got DOIs checked on OpenAlex (#19 and #65 NBER, #62
The Lancet, #81 arXiv); their link stays their URL.

**Unpaywall**, with `UNPAYWALL_EMAIL`: the best free copy.

Facts that shape the design:

- **The collection is small and fixed**, so like The 100 Desk the whole pool
  is committed and the draw is pure in one pass. Only the citation record is
  live, read after the draw, so OpenAlex being down never stops a spin.
- **The collection's summaries are leads, not sources.** Every number on the
  page comes from the paper itself. Every spin fires a rule saying so.
- **Designs differ in what they can show.** The design reel exists so the
  page's causal language matches it: "caused" only for a randomized or
  natural experiment, "is linked to" for the rest.
- **Not gated.** These are published studies, like the Landmark Desk's; the
  sensitive material (suicide, contested findings) is handled by flag rules
  instead.

## 2. The dataset (`data/evidence.json`)

Written by `pnpm randomizer:evidence-taxonomy`
(`scripts/randomizer/evidence-taxonomy.mts`; `--offline` skips OpenAlex,
`--check` for CI). Hand-set in the script, because the markdown does not say
it in a machine-readable way:

- **Designs (6)**, one per study: Randomized experiment (25), Natural
  experiment (5), Cohort and longitudinal (13), Observational and platform
  data (17), Meta-analysis and review (17), Report and commentary (6). Each
  carries what a study of that design can show.
- **Themes (7)**, from the collection: Mental health & wellbeing (25),
  Attention, cognition & behavior (8), Politics & democracy (22), Social
  relationships & society (8), Economic & information ecosystem (5),
  Positive and beneficial effects (3), Policy & interventions (12). Not every
  theme has every design; the draw only offers a design its theme has.
- **Flags:** `contested` (#1, #2, #3, #5, #21, #22, #23, #40), `preprint`
  (#19, #23, #65, #81), `replication` (#31 did not replicate, #56 dissipated
  at follow-up), `platform` (run with or by Meta or Twitter: #19, #38, #40 to
  #45, #50), `small-sample` (#7, #16, #20, #29, #30, #56), `suicide` (#1, #14,
  #60: safe-messaging rules), `correction` (#44). A flag that needs words
  carries a `note` the brief puts up front.
- **Related:** each entry's own `#N` references, the references that point
  at it, and the debates the collection pairs (#2 against #3; #21 against #22
  and #23; the 2020 Meta studies against the X experiments…), linked both
  ways.
- **Labels:** "Orben & Przybylski 2019", with a/b where two collide
  ("Guess et al. 2023a"); short labels for institutional authors.
- **Lenses (7):** Read the number, Cause or correlation, The other side, Who
  was studied, Since then, What policy should take, Explain like I'm 5. The
  file keeps its own lenses on refresh (they are editorial).

## 3. The draw (`draw.ts`, `drawEvidence`)

Pure and deterministic per seed, like every desk:

1. **Theme** first, weighted by the square root of its study count, so the
   25 mental-health studies do not crowd out the 3 on benefits; the same
   theme twice in a row is re-drawn once.
2. **Design**, one the theme has studies of.
3. **Study** in the theme and design, minus anything spun in the last 30
   days (lifted to the oldest when the cell empties: the shared `eligible()`).
4. **Lens**; (study, lens) is blocked for 90 days.
5. **Rules:** the evidence rule on every spin, the design rule (what the
   page may say), one rule per flag, and a record rule for a study with no
   DOI.

**Follow the debate** (sequence mode): a study the collection links to the
previous spin's, minus those spun in 30 days; the theme balance pauses. A
theme, design or study lock wins over it. Locks: theme, design (takes theme),
study (takes design and theme), lens.

## 4. The record (`evidencePool.ts`)

Read in `spins.ts` after the draw, never thrown: the OpenAlex record (a note
when its title does not match the collection's, when its year differs, when
the newest year's citations are partial, and when it is retracted, which also
adds a `block` rule), then Unpaywall when an email is set. The record is
frozen into the spin's subject.

## 5. The brief

`GET vizmaya.fyi/api/html-stories/brief?spin=<id>` (`&format=deck` is the
suggested format). The assignment carries the study (citation, link, access),
the theme with the collection's verdict, the design and what it can show, the
collection's summary marked "to check, never to cite", the lens, the note, the
collection's key findings that cite it, the citation record, the studies it is
in conversation with, and read-first steps (read the paper; check every
number; credit). The research protocol adds: the paper is the primary source;
causal words only for experimental designs; effect sizes with unit, sample and
benchmark; preprints labelled. The format is an evidence explainer (headline
at the design's strength, the study card, the finding in a number, the effect
in context, what the design can show, the lens chart and read, the other side,
where it stands, go further, the credit). The content rules add safe messaging
for suicide content and OpenAlex credit. An "Explain like I'm 5" spin gets the
picture-story format like the other desks.

## 6. Steps (all done)

1. The collection committed; dataset and taxonomy script.
2. Types (`evidence` in `RandomizerId`, `RANDOMIZER_META.evidence`), dataset
   helpers and reel strips.
3. The draw, its rules and sequence mode.
4. The record loader and its wiring in `createSpin`.
5. Brief sections, the research stub, the html-stories content rules, ELI5.
6. Migration 098 (widens the `randomizer` check).
7. vizmaya-fyi: `GET /api/randomizer/evidence[?study=]` and the daily cron at
   05:55 UTC (`GET /api/randomizer/cron/evidence`, `CRON_SECRET`).
8. Admin: the Evidence Desk tab with the **Evidence study** panel.
9. MCP: `spin_randomizer` takes `evidence`; `get_evidence_pool`.
10. Tests in `packages/randomizer/src/draw.test.ts` (the dataset, links both
    ways, determinism, theme weighting, locks, the theme re-draw, sequence
    mode, the 90-day lens block, the flag and design rules, the OpenAlex
    mapping, the loader on a fake API, the stub and brief) and the ELI5 check
    in `packages/html-stories/src/brief.test.ts`; the live path was
    smoke-tested against OpenAlex.
