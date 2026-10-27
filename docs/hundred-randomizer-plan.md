# The 100 Desk — a daily influential-person randomizer

An eighth randomizer on the existing slot machine (`packages/randomizer`),
hosted on vizmaya.fyi as a sixth tab next to Desk, Atlas, Epics, the OCW Desk
and the Landmark Desk. It draws one **domain → era → person → lens** chain a
day from Michael H. Hart's *The 100: A Ranking of the Most Influential
Persons in History* (revised edition, "Revised and updated for the
nineties", Citadel Press, 1992), reads the drawn person's profile from open
sources (Wikidata, Wikipedia, Wikimedia pageviews), and the agent brief then
asks for an influence profile that **tests Hart's rank against the record**
rather than repeating it.

Status: **built** on branch `claude/compassionate-hopper-y5mo9t`. To go live:
apply migration 096 and deploy vizmaya-fyi (the cron entry is in its
`vercel.json`; `CRON_SECRET` is already set). No new env.

## 1. The book and the sources (what was verified)

**The ranking.** Hart ranks people "by how much they changed the course of
history", not by greatness or goodness. The 1992 revision differs from the
1978 first edition: Lenin and Mao moved down after 1989, Gorbachev was added,
Ernest Rutherford replaced Niels Bohr and Henri Becquerel, Henry Ford was
promoted from the honourable mentions (replacing Picasso), and #31 credits
the works of Shakespeare to Edward de Vere, Earl of Oxford. The desk uses
the 1992 order, checked on 2026-10-27 against a reproduction of the
edition's table and Wikipedia's article on the book (which lists the top
ten and the revision's changes). #28 is one entry for two people (Orville
and Wilbur Wright). The dataset keeps the rank, Hart's spelling of each
name ("Ts'ai Lun", "Shih Huang Ti", "Asoka") and nothing of his text: the
book is copyrighted, so the brief has the agent paraphrase it, quote a
phrase at most and cite the page.

Checked on 2026-10-27 through the deployment's proxy, no auth, JSON:

| Source | What it gives | Checked |
|---|---|---|
| **Wikidata SPARQL** (`query.wikidata.org/sparql`) | English Wikipedia title → item (`schema:about`); `P569`/`P570` birth and death with `wikibase:timePrecision` (11 day, 9 year, 7 century…); `P19`/`P20` places with `P625` coordinates; `P18` portrait; `wikibase:sitelinks`. CC0. | All 100 titles resolve in one query (one fix: Pincus's article is "Gregory G. Pincus"). Disputed dates sit side by side (the Buddha: 623 or 563 BCE). Unknown places come back as blank nodes. |
| **Wikipedia REST** (`en.wikipedia.org/api/rest_v1/page/summary/{title}`) | The first paragraph and the canonical URL. Text is CC BY-SA, so it is agent context only, never on the page. | Works with a user agent; the action API (`w/api.php`) answers 429 from the shared proxy IP, so the desk never uses it. |
| **Wikimedia pageviews** (`wikimedia.org/api/rest_v1/metrics/pageviews/per-article/…/monthly`) | English Wikipedia views by month, user agents. CC0. | Works. The newest month sometimes comes back far short (September 2026 at 2 to 4% of the other months on 2026-10-27), so the loader drops a last month below a quarter of the median and says so. |

Facts that shape the design:

- **The list is small and fixed**, so unlike the OCW and Landmark Desks the
  whole pool is committed and the draw is pure in one pass. Only the profile
  is live, and it is read after the draw, so a source being down never
  stops a spin.
- **The rank is an opinion.** Every spin fires a rule saying so; the format
  puts the rank, the neighbours and "the counter-case" on the page.
- **The list is sensitive.** It runs from the founders of world religions to
  Hitler, Stalin and Mao, so the desk is **gated** like Atlas and Epics (a
  human approves the hero insight before anything goes public), and the
  dataset flags what each brief must handle first.

## 2. The dataset (`data/hundred.json`)

Written by `pnpm randomizer:hundred-taxonomy`
(`scripts/randomizer/hundred-taxonomy.mts`; `--check` for CI). The ranking,
domains, eras and regions are hand-set in the script; each run resolves
every English Wikipedia title to its Wikidata item and earliest birth and
death years (astronomical: -383 is 384 BCE) and fails if a title no longer
resolves.

- **Domains** (what the person is ranked for): Religion and ethics (15),
  Science and mathematics (19), Medicine (8), Invention and industry (10),
  Exploration and conquest (4), Rulers and statesmen (28), Philosophy and
  society (11), Arts and letters (5).
- **Eras** (when the act Hart ranks them for happened): Ancient world (to
  500 CE, 24 people), Middle Ages (500 to 1450, 8), Early modern (1450 to
  1750, 26), Age of revolutions (1750 to 1900, 25), Twentieth century (1900
  on, 17). Not every domain has every era (Religion and ethics has no one
  after 1750); the draw only offers an era its domain has.
- **Region** (where they were based): Europe, Middle East and North Africa,
  South Asia, East Asia, Americas. Kept for the map and the reel label, not
  balanced: the list is about 70% European, and balancing would distort it.
  The "Who is missing" lens takes that on instead.
- **Flags:** `no-portrait` (Muhammad, Umar: no likeness on the page, and the
  loader withholds the Wikidata portrait), `legendary` (Moses, Laozi,
  Zoroaster, Menes, Homer: historicity debated), `duo` (the Wright
  brothers), `authorship` (Shakespeare: Hart's de Vere attribution is a
  minority view), `harm` (Columbus, Qin Shi Huang, Genghis Khan, Hitler,
  Pizarro, Cortés, Stalin, Lenin, Mao: the human cost is part of the story,
  no admiring tone). A flag that needs words carries a `note` the brief
  puts up front.
- **Lenses (7):** The case for the rank, Without them (Hart's own
  counterfactual test), Reach in numbers, Map of a life, Myth and record,
  Who is missing, Explain like I'm 5. The file keeps its own lenses on
  refresh (they are editorial).

## 3. The draw (`draw.ts`, `drawHundred`)

Pure and deterministic per seed, like every desk:

1. **Domain** first, 1 in 8 (stratified, so the 28 rulers do not crowd out
   the 5 artists); the same domain twice in a row is re-drawn once.
2. **Era**, one its domain has people in.
3. **Person** in the domain and era, minus anyone spun in the last 30 days;
   when that empties the cell, the block lifts to whoever was spun longest
   ago (the shared `eligible()` helper).
4. **Lens**; the combination (person, lens) is blocked for 90 days by
   drawing from the lenses that have not run with that person.
5. **Rules:** the rank rule on every spin; a faith rule for Religion and
   ethics; one rule per flag.

**Walk the ranking** (sequence mode): the rank after the previous spin's,
100 wrapping to 1; the domain balance and the 30-day block pause. A domain
or person lock wins over it. Locks: domain, era (takes domain), person
(takes era and domain), lens.

## 4. The profile (`hundredPool.ts`)

Read in `spins.ts` after the draw, in parallel, never thrown:

- Wikidata: the one-line description, birth and death at their own
  precision ("4 January 1643", "c. 6th century BCE"), each year on record
  once when sources differ ("623 BCE or 2 April 563 BCE (sources differ)"),
  places (blank nodes and unlabelled items left out) with coordinates, the
  portrait as a Commons `Special:FilePath` URL plus its file page for the
  licence (withheld for `no-portrait`), and the number of Wikipedia
  editions.
- Wikipedia: the summary paragraph and the canonical URL.
- Pageviews: twelve full months, the incomplete newest month dropped.

Each source's state (`ok`, `failed`) and errors are kept on the profile; a
failure also adds a `profile` rule to the spin. The profile is frozen into
the spin's subject, so a logged spin replays without the network.

## 5. The brief

`GET vizmaya.fyi/api/html-stories/brief?spin=<id>` (`&format=deck` is the
suggested format). The assignment carries the person (Hart's spelling, the
life, the rank and its neighbours, the domain, era and region, the lens),
the record links, the life with places and coordinates, the book's note,
the read-first steps (Hart's chapter as the argument to test; primary and
scholarly sources for the life, Wikipedia only to find them), the credit
line, the portrait rule, the pageviews and the lens metrics. The research
protocol adds: the rank is Hart's opinion, attributed and tested; tradition
and record labelled apart; a religious claim stated as what a tradition
holds. The format is an influence profile (headline, the rank, a timeline,
a map, the reach chart, the comparison chart, the lens read, the
counter-case, go further, the credit). The content rules: Hart paraphrased,
never copied; the Wikipedia text never on the page; a portrait only under
its Commons licence; no depiction where the flag says so.

## 6. Steps (all done)

1. Dataset and taxonomy script.
2. Types (`hundred` in `RandomizerId`, `RANDOMIZER_META.hundred`, gated),
   dataset helpers and reel strips.
3. The draw, its rules and sequence mode.
4. The profile loader and its wiring in `createSpin`.
5. Brief sections, the research stub, the html-stories content rules.
6. Migration 096 (widens the `randomizer` check).
7. vizmaya-fyi: `GET /api/randomizer/hundred[?rank=]` and the daily cron at
   05:50 UTC (`GET /api/randomizer/cron/hundred`, `CRON_SECRET`).
8. Admin: The 100 Desk tab with **The 100 profile** panel.
9. MCP: `spin_randomizer` takes `hundred`; `get_hundred_pool`.
10. Tests in `packages/randomizer/src/draw.test.ts` (the dataset, the draw's
    determinism, locks, the domain re-draw, the 30-day lift, sequence mode
    and its wrap, the 90-day lens block, the flag rules, the date, place and
    pageview mappings on recorded shapes, the loader on a fake API, the brief
    and stub); the live path was smoke-tested against Wikidata, Wikipedia and
    the pageviews API.
