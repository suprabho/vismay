# OCW Desk — a daily topic-and-resource randomizer on MIT OpenCourseWare

A sixth randomizer on the existing slot machine (`packages/randomizer`), hosted
on vizmaya.fyi as a fourth tab next to Desk, Atlas and Epics. It draws one
**field → topic → kind of resource → course → resource** chain a day from MIT
OCW's catalogue, under the same 30/90-day repeat blocks, locks and re-spins
the other randomizers use, and the agent brief then carries the resource.

Status: **plan only**. Nothing in this document is built yet.

> On the count: the repo already has five randomizer ids (`desk`, `atlas`,
> `epics`, `footshorts`, `viznba`), three of them on vizmaya. The OCW one is
> the fourth vizmaya tab and the sixth id. If it should instead be a site of
> its own later (an "OCW daily" app), the package shape below does not
> change; only `RandomizerMeta.app` and the admin route do.

## 1. What was verified about the source

`https://ocw.mit.edu/search/?type=resourcefile` is a thin front end. The data
behind it is MIT Open Learning's public **MIT Learn API** at
`https://api.learn.mit.edu/api/v1/` (OpenAPI at `/api/v1/schema/?format=json`).
Checked on 2026-10-20, no auth, no API key, JSON:

| Endpoint | What it gives | Checked |
|---|---|---|
| `learning_resources/?platform=ocw` | OCW courses (id, readable_id like `11.165+fall_2011`, title, url, topics, departments, course_feature, level, runs) | 9,183 courses |
| `learning_resources/{id}/contentfiles/` | A course's files (key, title, url on ocw.mit.edu, content_type, file_type, content_feature_type, year, semester) | works, 53 files for id 3308 |
| `contentfiles/?platform=ocw&content_feature_type=` | Every OCW file of one kind, paginated, **no offset cap** | 27,462 lecture-note files; offset 20000 works |
| `content_file_search/?platform=ocw&topic=&content_feature_type=&offset=` | The same, filtered by topic, with aggregations; **offset+limit capped at 10,000** | 3,862 Physics lecture-note files |
| `learning_resources_search/?platform=ocw` | Course search with `sortby=-views`, `-last_modified`, `new`, `level`, `department`, `course_feature` filters | works |
| `topics/` | MIT Learn's taxonomy: 11 top-level fields, 99 child topics | 110 rows |
| `departments/` | 38 MIT departments (`6` EECS, `18` Mathematics, `21L` Literature…) | 38 rows |
| `course_features/` | 59 resource kinds (Lecture Notes, Problem Sets, Exams, Readings, Projects, Lecture Videos…) | 59 rows |

Facts that shape the design:

- **No random sort.** Random choice is "count, then a random offset". The
  pure draw produces the offset from its seed, so a spin is still replayable.
- **No file text.** `content` is empty on OCW files through this API; the
  agent reads the PDF or video page at the file's `url` on ocw.mit.edu.
- **Titles are often file names** (`lec15.pdf`). The brief carries the course
  title and the resource page URL; the resource page has the human title.
- **Licence**: OCW is CC BY-NC-SA 4.0. Every story must credit the course,
  the instructor(s) and link the course page. The brief says so.
- **Topic taxonomy**: MIT Learn's `topic` (two levels) is cleaner than OCW's
  own `ocw_topic` (three levels, no aggregation support). Use `topic`.
- **Counts per (child topic, kind) are all under 10,000**, so the capped
  search endpoint is safe once the draw always lands on a child topic.
- No rate-limit headers were returned. Treat it like ESPN in the NBA Desk:
  8 s timeout, a 503 `SpinError` when it fails, nothing cached across spins
  except the taxonomy (which ships in the dataset JSON).

## 2. The randomizer

Id `ocw`, name **OCW Desk**, hint "Fields · courses · resources", app
`vizmaya-fyi`, format "Study note with charts", `gated: false` (nothing
sensitive; the Desk's rules).

### Reels (in `RANDOMIZER_META.ocw.reels`)

| Key | Label | Pool | Lockable | Parents |
|---|---|---|---|---|
| `field` | Field | the 11 top-level topics (dataset) | yes | |
| `topic` | Topic | the field's child topics (dataset) | yes | `field` |
| `kind` | Resource kind | 6 kinds (dataset): Lecture Notes, Readings, Problem Sets, Exams, Projects, Lecture Videos | yes | |
| `course` | Course | live, from the API pool for (topic, kind) | yes | `topic`, `field` |
| `resource` | Resource | live, one file in the course | yes | `course`, `topic`, `field` |
| `lens` | Lens | 6 lenses (dataset), see below | yes | |

Option toggle: `{ key: 'sequence', label: 'Continue the course (next resource)' }`.
With it on, the draw keeps yesterday's course and walks to its next file of
the same kind in `key` order (the Epics sequence mode, on a course instead of
a route). That is the "study one course for a week" mode.

Lenses (what the story does with the resource), in `data/ocw.json`:

| Lens | The story |
|---|---|
| The one idea | Explain the single idea the resource turns on, for a reader who has not taken the course. |
| Work the problem | Pick one problem (or the exam's hardest question) and solve it on the page, step by step. |
| Chart it | Find the quantity the resource is about and chart it from a real dataset (8+ points). |
| Where it came from | The history: who found this, when, what it replaced. |
| Why it matters now | Tie the idea to something in this month's news. |
| Across the river | The same idea as another field sees it (a physics note read by an economist). |

### The draw (`drawOcw` in `draw.ts`)

Pure and deterministic like the others, in two stages that share one seeded
rng, because the course and resource pools come from the API and depend on
the first stage:

1. **Plan** (pure, `ocwPlan(ctx, data, prev, locks)`):
   - `field`: uniform over the 11, re-drawn once when it equals the last
     kept spin's field (the Atlas "same region twice" rule).
   - `topic`: uniform inside the field, minus topics spun in the last 30 days
     (`eligible()` with heat 0, so no exemption; the block lifts to the
     oldest third when everything is blocked, as it does today).
   - `kind`: uniform over the 6, with a **one-in-three hands-on quota**:
     if the last two kept spins were both reading kinds (Lecture Notes,
     Readings, Lecture Videos), this one is Problem Sets, Exams or Projects
     (the Epics philosophical quota, on a different axis).
   - `lens`: uniform.
   - `u`: one rng draw in [0, 1) that picks the offset into the pool.
   - Locks keep the previous spin's value for any of these (parents implied).
2. **Pool** (server, `loadOcwPool(plan)` in `spins.ts`): one `limit=0` call
   for the count of `content_file_search/?platform=ocw&topic=<topic>&content_feature_type=<kind>`,
   then one call at `offset=floor(u * min(count, 10000 - 30))&limit=30`.
   Then one `learning_resources/{id}/` call for the drawn course (title,
   instructors, url, level, year, departments). In sequence mode the pool is
   instead the previous course's `contentfiles/` of that kind.
3. **Pick** (pure, the rest of `drawOcw`): from the 30-file page, drop files
   whose course was spun in the last 30 days (the `course` primary block),
   drop combos (`topic|kind|course|lens`) spun in the last 90 days, then
   `pick()` one. The 30-day block keys on the course's readable id, the
   90-day one on the combo.

`draw()` takes the pool as `ocwPool?: OcwPool | null` the way it takes
`nbaNews`, and throws when it is missing, so `createSpin` becomes: draw the
plan (the first call with no pool returns it), fetch the pool, draw again
with the same seed and the pool. Because the rng is re-seeded, the plan
comes out identical the second time; `drawOcw` asserts the pool's query
matches the plan and throws otherwise. The pool page is frozen into
`subject`, so a logged spin replays from the log alone, like the NBA Desk.

Rules fired (shown under the reels, kept in the log): the field re-draw, the
30-day topic and course blocks, the quota, the 90-day combo re-draw, the
pool size ("Physics lecture notes: 3,862 files on OCW, page 27 of 129"), the
sequence step, the licence reminder.

### Types (`types.ts`)

```ts
export type RandomizerId = 'desk' | 'atlas' | 'epics' | 'footshorts' | 'viznba' | 'ocw'

export interface OcwField { id: number; name: string }           // MIT Learn top-level topic
export interface OcwTopic { id: number; field: number; name: string }
export interface OcwKind { name: string; hands_on: boolean }      // content_feature_type
export interface OcwDataset { fields: OcwField[]; topics: OcwTopic[]; kinds: OcwKind[]; lenses: NamedOption[] }

export interface OcwFile {   // one content_file_search hit, trimmed
  id: number; key: string; url: string; title: string
  contentType: string; fileType: string | null; year: number | null; semester: string | null
  courseId: number; courseReadableId: string; courseTitle: string; courseSlug: string
}
export interface OcwCourse {  // learning_resources/{id}
  id: number; readableId: string; title: string; url: string
  instructors: string[]; departments: string[]; level: string[]; year: number | null; semester: string | null
  courseFeatures: string[]; fileCount: number
}
export interface OcwPool { asOf: string; topic: string; kind: string; count: number; offset: number; files: OcwFile[]; course: OcwCourse | null }

export interface OcwPicks { field: number; topic: number; kind: string; lens: string; courseId: number; fileId: number; u: number }
export interface OcwSubject {
  randomizer: 'ocw'; field: OcwField; topic: OcwTopic; kind: OcwKind; lens: NamedOption
  course: OcwCourse; file: OcwFile; siblings: OcwFile[]   // the same course's other files of this kind, for sequence mode and the brief
  poolCount: number; poolAsOf: string; sequence: boolean
}
```

`SpinMeta` gains `field?: number` and `kind?: string` for the balancing
rules. `primary` is the course readable id; `combo` is
`${topic}|${kind}|${course}|${lens}`.

### Dataset (`data/ocw.json`)

Generated once by a script (`scripts/randomizer/ocw-taxonomy.mts`) from
`topics/` and `course_features/`, committed, so the slot machine's reel
strips and the plan never need the network. About 120 rows. Re-run the
script when MIT changes its taxonomy; the draw tolerates a topic that has no
files (empty pool → one re-plan with a different topic, then 503).

## 3. Picking a topic and a resource every day

Three layers, from fully automatic to fully manual. They share one spin log,
so the repeat blocks hold whoever spun.

**A. The morning spin (automatic).** A Vercel cron on vizmaya-fyi,
`apps/vizmaya-fyi/vercel.json`, at `30 5 * * *` UTC (11:00 IST), calls
`/api/randomizer/cron/ocw`. The route follows the AI Data Centers cron route:
fails closed without `Authorization: Bearer $CRON_SECRET`, then
`createSpin({ randomizer: 'ocw', createdBy: 'cron' })` **only if no kept
`ocw` spin exists for today** (UTC), so a manual spin earlier in the morning
is respected. It answers with the spin id and summary. No GitHub Action is
needed: a spin is two API calls and an insert.

**B. The look (manual, two minutes).** `/vizmaya/randomizer`, OCW Desk tab.
Today's spin is on screen with its six reels and the rules that shaped it.
Under it, the **pool panel** (the OCW Desk's version of the NBA news table):
the topic and kind, the pool size, the 30 files on the page with the one
drawn marked, and the course card (title, instructors, term, level, file
count, OCW link). From here:

- **Re-spin** with a one-tap reason (`boring`, `too recent`, `no data`,
  `too sensitive`, `other`): the old spin is logged rejected and does not
  block its replacement.
- **Lock** a reel and re-spin: keep the topic but draw another course, keep
  the course but draw another resource, keep the resource but try another
  lens.
- **Continue the course**: flip the sequence toggle; the next spin walks to
  the next file of the same kind in the same course. Flip it off when the
  course is done.

**C. The story (agent).** The brief for the spin is
`GET /api/html-stories/brief?spin=<id>` on vizmaya.fyi (`&format=deck` by
default; `suggestedFormatFor('ocw')` returns `deck`, `book` in sequence
mode). The MCP flow is the existing one: `spin_randomizer` with
`randomizer: "ocw"` (or `get_randomizer_spin` for the cron's spin),
`get_html_story_brief` with the `spinId`, research, `save_spin_research`,
`publish_html_story` with the `spinId`. Ungated, so a story can go public
without the insight review.

What a day looks like: the cron spins at 11:00 IST; you glance at the tab
over coffee and re-spin or lock if it is dull; the agent (or you) works the
brief; the story publishes with the spin tied to it; tomorrow's draw cannot
repeat that course for 30 days or that topic-kind-course-lens for 90.

## 4. The brief and the research stub

`spinBrief.ts` gains `ocwAssignment(s)` and `ocwFormat(s)`:

```
- Field: Science & Math › Topic: Physics
- Course: 8.03SC Physics III: Vibrations and Waves (Fall 2016), Prof. Yen-Jie Lee. Undergraduate. 41 lecture-note files.
- Resource: Lecture 21: Phased Radar, Single Electron Interference (Lecture Notes, pdf)
  https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/resources/mit8_03scf16_lec21/
- Lens: The one idea. Explain the single idea the resource turns on...

### Do this first
1. Read the resource at its OCW URL end to end (the PDF, or the video and its transcript). It is the only source for what the page explains.
2. Read the course's syllabus page for where this sits in the course.
3. Apply the lens to the resource, not to the course or the field in general.
4. Credit: "Source: MIT OpenCourseWare, <course number> <course title>, <instructors>, <term>. CC BY-NC-SA 4.0", with the course link. Non-commercial applies: no sponsor placement on the page.

Other files of this kind in the course (for context, not to cover): lec20, lec22...
Chart these if the data exists: <per lens>.
```

`stub.ts` gains `ocwTemplate(s)`: **The one idea** (two sentences), **What
the resource says** (its own structure, section by section), **Where it sits
in the course** (the syllabus), **Data pull** (per lens), **Worked example**
(for Work the problem), **Counter-case / where it breaks**, **Credit line**.
`researchFileName` uses the course number and the file key.

`formats.ts`'s `suggestedFormatFor` and `brief.ts`'s context rules (the
place where the Football Desk adds its match-context rules) each get an
`ocw` branch; the rule is "the page must stand without the PDF, and must link
it".

## 5. Admin, API, MCP

- **Admin**: `apps/admin/app/vizmaya/(tabbed)/randomizer/page.tsx` loads
  nothing extra up front (the pool is per spin, frozen in `subject`), so the
  OCW tab appears from `randomizersFor('vizmaya-fyi')` alone. `RandomizerClient`
  gets an `OcwPool` panel (reads `current.subject`) under the reels when
  `tab === 'ocw'`, and the header copy for the new tab. The reel strips'
  blur for `course` and `resource` comes from the current spin's pool
  (`reelPool('ocw', 'course', names)`, the way the Football Desk passes
  team names).
- **Agent API** (`randomizerApi.ts`, vizmaya-fyi): the spin routes already
  accept any `RandomizerId`; add `GET /api/randomizer/ocw?topic=&kind=` that
  returns a pool page read-only (for an agent that wants to browse before
  locking), and the cron route above.
- **MCP** (`packages/mcp/src/tools/randomizer.ts`): widen the `randomizer`
  enum and the `locks` doc; add `get_ocw_pool` mirroring `get_nba_news`.
- **Migration** `093_randomizer_ocw.sql`: widen the `randomizer` check to
  include `ocw`. Nothing else: no heat table, no new rows.

## 6. Files, in build order

| Step | Files | Notes |
|---|---|---|
| 1. Taxonomy | `scripts/randomizer/ocw-taxonomy.mts`, `packages/randomizer/src/data/ocw.json` | Script fetches `topics/` and `course_features/`, writes the JSON; commit the output. |
| 2. Types and dataset | `types.ts`, `datasets.ts` | `RandomizerId`, `RANDOMIZERS`, `RANDOMIZER_META.ocw`, the `Ocw*` types, `OCW` export, `reelPool` branch. |
| 3. Draw | `draw.ts`, `draw.test.ts` | `ocwPlan`, `drawOcw`, `DRAW_RULES.ocwPageSize = 30`, `ocwSearchCap = 10000`; tests with a fixture pool (no network): determinism, locks, the 30/90 blocks, the quota, sequence mode, the plan/pool mismatch throw. |
| 4. Server | `spins.ts` | `OCW_RULES` (timeouts, page size), `loadOcwPool(plan)`, `createSpin` two-pass for `ocw`, the "already spun today" helper for the cron. |
| 5. Brief | `spinBrief.ts`, `stub.ts`, `packages/html-stories/src/formats.ts`, `brief.ts` | Assignment, format, chart rules, stub, credit line. |
| 6. Migration | `supabase/vizmaya-fyi/migrations/093_randomizer_ocw.sql` | Widen the check. |
| 7. Admin | `apps/admin/components/randomizer/RandomizerClient.tsx`, `apps/admin/app/vizmaya/(tabbed)/randomizer/page.tsx` | Tab copy, pool panel, reel strips, the migration hint. |
| 8. API and cron | `packages/html-stories/src/randomizerApi.ts`, `apps/vizmaya-fyi/app/api/randomizer/ocw/route.ts`, `apps/vizmaya-fyi/app/api/randomizer/cron/ocw/route.ts`, `apps/vizmaya-fyi/vercel.json` | `CRON_SECRET` is already set on the project for the DC crons. |
| 9. MCP and docs | `packages/mcp/src/tools/randomizer.ts`, `packages/mcp/README.md`, `apps/vizmaya-fyi/CLAUDE.md`, `apps/admin/CLAUDE.md`, `README.md` | The "sixth randomizer" paragraph in each, as 090 and 092 added theirs. |

Steps 1–3 are pure and testable offline (`npx tsx src/draw.test.ts`); 4–9
need the deployed site. Each step is one commit; the whole thing is one PR.

## 7. Decisions to confirm, and defaults taken

| Question | Default in this plan | Alternative |
|---|---|---|
| Where it lives | A fourth tab on `/vizmaya/randomizer`, stories on vizmaya.fyi | Its own site later; `app` is one field. |
| Daily trigger | Vercel cron at 05:30 UTC, skipped if already spun today | A GitHub Action, or no cron: spin by hand each morning. |
| Resource kinds | The six that make a story (Lecture Notes, Readings, Problem Sets, Exams, Projects, Lecture Videos) | All 59 course features; most are too thin (Tools, Editable Files). |
| Weighting | Uniform with balancing rules; no heat | A "popularity" branch from `sortby=-views` on courses, 60/40 like the Desk, once there is a reason to prefer famous courses. |
| Taxonomy | MIT Learn `topic` (11 fields, 99 topics) | OCW's own three-level `ocw_topic`; richer, but no counts and inconsistent spelling. |
| Gate | Ungated | Gate it if the "Why it matters now" lens starts producing takes that need a second pair of eyes. |

## 8. Risks

- **The API is public but undocumented as a commitment.** Anything that
  fails returns a 503 spin error, the admin says so, and the cron retries
  the next day. The taxonomy is committed, so the slot machine still renders.
- **Resource quality varies.** A "Readings" file is often a one-line list of
  book chapters, and some lecture-note files are a single slide. The reject
  reason `no data` is for these; after a month the log says which kinds to
  drop or weight down.
- **Licence.** NC means no sponsored placements on OCW-sourced pages, and SA
  means the page's own text is shareable under the same terms. The brief's
  credit line and the quality checklist both carry it.
- **Sequence mode and the 30-day course block disagree by design.** In
  sequence mode the block is skipped for the kept course and a rule says so,
  as the Epics sequence mode does.
