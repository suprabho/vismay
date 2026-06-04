# vizf1 AI-pipeline plan vs. June 2026 roadmap — scoping comparison

**Compares:** [`docs/vizf1-ai-pipeline-integration.md`](vizf1-ai-pipeline-integration.md) ⇄ [`docs/roadmap-june-2026.md`](roadmap-june-2026.md) (≡ `.html`)
**Generated:** June 3, 2026 · all claims verified against the repo on branch `rohit/test`

---

## TL;DR

These two documents are **not two views of the same work**. They describe **different AI pipelines, for different verticals, at different altitudes** — and they contradict each other on one load-bearing fact (`f1_backend/`). The June roadmap does **not** schedule the vizf1 integration; that integration is a separate initiative roughly the size of the entire roadmap.

Three headline findings:

1. **The roadmap's "AI engine" (⑤) ≠ the integration doc's pipeline.** ⑤ is a generic *research→outline→section→Deck* loop for vizmaya-fyi (~12–20h). The integration doc is a vizf1-specific *signals→angles→curation→stories+charts→render* pipeline ported from `f1_backend` (~20–28 working days, 7 phases).
2. **The roadmap mis-reads `rohit/test`** on three counts (LOC, "empty" `f1_backend`, "removed footshorts deps") — all verified false below. Its decision-3 advice to *drop* `f1_backend` would delete the reference implementation the integration doc ports from.
3. **vizf1 integration is a peer of the whole roadmap, not a sub-task** — it can't be added to June without re-scoping the month.

---

## 1. What each document is

| | vizf1-ai-pipeline-integration.md | roadmap-june-2026 (.md ≡ .html) |
|---|---|---|
| **Altitude** | Deep technical spec for **one** initiative | Month-level plan across **7** tracks |
| **Vertical** | **vizf1** (F1 racing) | Platform + **vizmaya-fyi** Deck stories |
| **The AI pipeline** | signals → angles → human curation → stories+charts → render (ported from `f1_backend`) | research → outline → multi-section → Deck story |
| **Output** | `vizf1_stories` + GraphSpec→ECharts charts | a Deck-format vizmaya story |
| **Size** | New package + 3 migrations + admin UI + charts + native reader = multi-month, 7 phases | Item ⑤ is one of 7 tracks, scoped at **12–20h** over W1–W3 |

> The `.md` and `.html` roadmaps are the same content in two formats.

---

## 2. Core finding: the roadmap does not contain this work

The integration doc reads like it should map onto roadmap item ⑤ ("AI research → stories"). It doesn't — they're two different engines:

- **Roadmap ⑤** — a *generic, source-driven* loop (web/news/docs → outline → sections) producing a **Deck** story for vizmaya-fyi, built on [`packages/ai-gateway`](../packages/ai-gateway/src/text.ts)'s `generateText`. Light, ~25% done.
- **Integration doc** — a *vizf1-specific, data-driven* pipeline (race signals → analysis angles → curation → narrative + GraphSpec charts) requiring a new [`packages/story-pipeline`](../packages/) package, three Supabase migrations, an admin curation UI, an f1-viz chart module, and a native `/analysis` reader.

Different inputs (research sources vs. race data), different outputs (Deck vs. GraphSpec charts), different verticals, order-of-magnitude difference in size. **vizf1 does not appear anywhere in the roadmap's 7 items.**

---

## 3. The `rohit/test` / `f1_backend` correction

The roadmap's read of `rohit/test` is wrong on three counts, and all three feed decision 3. Here is `main...rohit/test` as it actually is:

| Roadmap claims | Repo reality (verified) |
|---|---|
| "3 commits / **~2,000 LOC**" | 3 commits, but **36,264 insertions across 210 files** (~18×) |
| "adds an **empty** `f1_backend/` scaffold" | `f1_backend/` is **fully populated — 203 tracked files, ~35K LOC**: working Python AI pipeline (`grounding.py`, LangGraph/CrewAI agents), Express backend, Vite frontend (`RacePage.tsx` 440 LOC, `trackProjection.ts`, `regression.ts`…) |
| "silently **removes 2 footshorts deps**" | **Zero deletions** on the branch — `36,264 insertions(+)`, no `(-)`. No deps removed, no footshorts files touched |

Commit breakdown:

- `ffe0a80 Add f1_backend folder structure` → the entire ~35K-LOC `f1_backend/` tree
- `f091fac future-plan` → [`docs/vizf1-ai-pipeline-integration.md`](vizf1-ai-pipeline-integration.md) + `paris-road-to-budapest.config.yaml` (551) + 3 **empty junk files** (`_probe_copy.txt`, `_snip.txt`, `vismay_tc.log`)
- `ccd7bc0 future-plan` → two migration docs (`fly-compute-migration.md`, `gcp-render-migration.md`)

The branch touches **nothing** under `apps/`, `packages/`, or `verticals/` — there is **no landing or canvas work in it**. (The modified [canvas-frame page](../apps/vizmaya-fyi/app/story/[slug]/canvas-frame/[id]/page.tsx) is an *uncommitted* working-tree edit, not part of these commits.) So the roadmap's premise that ② "unblocks the canvas for ③/④" isn't supported by the diff.

### Recommendation — keep `f1_backend/`, don't drop it

1. It's the **reference implementation the integration doc ports from**. Dropping it deletes `grounding.py`, `Story.model.ts`, and the staged-pipeline source the entire vizf1 plan is built on.
2. It's **zero-cost to keep**: not a pnpm-workspace member (globs are `apps/*`, `apps/footshorts/*`, `apps/vizf1/*`, `packages/*`, `verticals/*` — `f1_backend/` matches none), so turbo/CI never builds it. Inert reference tree.
3. The merge is **trivial and risk-free** — purely additive, no conflicts.

Only real cleanup in this branch: **drop the 3 empty junk files** and decide where `paris-road-to-budapest.config.yaml` belongs (root is odd). The roadmap's "6–12h integrate" estimate is misleading — the *merge* is ~10 minutes; the *35K LOC* is reference material you port from later (section 6), not integrate.

---

## 4. Where the docs actually touch (verified)

| Roadmap item | Relationship to integration doc | Repo check |
|---|---|---|
| **② rohit/test** | **Direct conflict** — drops the `f1_backend/` the doc ports from | `f1_backend/` is real (203 files), not empty |
| **① Supabase Auth** | **Compatible but coupled** — doc relies on the *current* HMAC `isAuthed()` for every `/api/vizf1/*` route; ① swaps HMAC→Supabase session. Fine *as long as `isAuthed()` stays the boundary* | [`apps/admin/lib/adminAuth.ts`](../apps/admin/lib/adminAuth.ts), [`apps/admin/middleware.ts`](../apps/admin/middleware.ts) exist |
| **⑤ AI research→stories** | **Conceptual cousin, not the same** — same `generateText` base, different pipeline/vertical/output | — |
| **⑥ Footshorts (parked)** | Loosely related to the doc's Phase 6 `DomainPack` "football pack stub" | — |
| ③ Rete, ④ Deck, ⑦ Ovo | Unrelated to the integration doc | — |

---

## 5. Open items — verified

| Item | Result |
|---|---|
| **`003_` collision** (doc: "a `003_` already collides") | ✅ **Real** — [`apps/vizf1/supabase/migrations/`](../apps/vizf1/supabase/migrations/) has two `002_` *and* two `003_` files. Doc's "continue from `004_`" is correct. |
| **`043_ai_generations.sql`** (auth-alignment dependency) | ⚠️ **Exists, but under [`apps/vizmaya-fyi/supabase/migrations/043_ai_generations.sql`](../apps/vizmaya-fyi/supabase/migrations/043_ai_generations.sql) — NOT under vizf1.** Three separate migration dirs exist (vizmaya-fyi / vizf1 / footshorts). The doc assumes vizf1 shares vizmaya-fyi's Supabase project. **If they're separate projects, `ai_generations` won't exist in vizf1's DB** and every `recordGeneration` call breaks. Confirm the shared-project assumption before Phase 0. |
| **Roadmap ⑤'s `section-generate` route + `appendStorySection`** | ❌ **Neither exists by name.** The real per-asset generation route is [`apps/admin/app/api/vizmaya/stories/[slug]/assets/generate/route.ts`](../apps/admin/app/api/vizmaya/stories/) — exactly what the *integration doc* cites (precisely), not what the roadmap cites (loosely). No `appendStorySection` in [`packages/content-source/src/`](../packages/content-source/src/). |

---

## 6. Slotting vizf1 into the June roadmap

Blunt finding: **the integration doc is itself ~a full month for one engineer — a peer of the entire roadmap, not a sub-task.** Rough sizing:

| Phase | Work | Est. | Earliest fit / dependency |
|---|---|---|---|
| **0** | Migrations 004/005/006 + scaffold `story-pipeline` types + `transpilePackages` | ~1–2d | Needs the **043 shared-project** check (§5) resolved first |
| **1** | Stage A signals over positions/results + `run.ts` CLI + event plumbing | ~2–3d | After 0 |
| **2** | Stage B angles: port `grounding/*`, F1 personas, `generateText({schema})` | ~3–4d | After 1; ports from `f1_backend` (§3 — must keep it) |
| **3** | Admin curation UI + `vizf1-ai-pipeline.yml` + dispatch + realtime pages | ~4–5d | **Couples to roadmap ①** — relies on `isAuthed()` as the boundary |
| **4** | Stage D stories+charts: sequential chain, claim-verifier, coherence judge | ~4–5d | After 2+3 |
| **5** | `f1:graph-spec` ECharts module + catalog sample + `/analysis` native reader | ~3–4d | After 4 |
| **6** | Cross-vertical `DomainPack` seam + football-pack stub | ~2–3d | After 5; **conceptual kin to parked ⑥ footshorts** |
| 7 | Deep telemetry numerics | deferred | Needs 3.7Hz ingest (not in vizf1 today) |

**Total ≈ 20–28 working days, one engineer** — consumes or overflows the entire June window on its own. It **cannot** run alongside ②→①→⑤→④ with current staffing. Three honest placements:

### Option 1 — Swap, don't add (make June about vizf1)
Replace the vizmaya-oriented ⑤+④ convergence with vizf1 Phases 0–5. Still do ① (Phase 3 needs it); ② becomes trivial (just keep `f1_backend`). The month's payoff changes from "AI→Deck story" to "AI→GraphSpec analysis on vizf1.com." Cleanest fit if vizf1 is the priority — but it's a **re-scope of the month**, not an addition.

### Option 2 — Keep June as-is; vizf1 is the July initiative (recommended)
The roadmap already has a "July tail." vizf1 integration is a better-defined July block than the parked ⑥/⑦. June's ⑤ (generic research→Deck) ships first and de-risks the `story-pipeline` patterns vizf1 later reuses.

### Option 3 — Thin vizf1 spike inside June (Phases 0–2 only)
Tables + Stage A signals + Stage B angles landing as `proposed` — no admin UI, no frontend. ~6–9 days, provable via the worker CLI (`pipeline:signals`→`:angles`) + Supabase rows. Proves the pipeline against real data without UI/render cost; defers Phases 3–6. Fits beside a reduced roadmap.

### Two hard dependencies regardless of placement
- **Keep `isAuthed()` as the trust boundary** when doing roadmap ① (HMAC→Supabase). Every `/api/vizf1/*` route opens with `if (!(await isAuthed())) return 401` — swap the *implementation* behind `isAuthed()`, not the *contract*, or Phase 3 breaks.
- **Resolve the 043 / shared-Supabase-project question** (§5) before Phase 0, or spend-tracking is dead on arrival.

---

## Bottom line

1. **Two scopes, not one.** Roadmap ⑤ = generic vizmaya Deck pipeline; integration doc = vizf1 F1 pipeline ported from `f1_backend`. The latter is month-sized.
2. **Keep `f1_backend/` before the rohit/test cherry-pick** (roadmap ②) — the roadmap's "empty scaffold / drop it" note is wrong; the integration plan ports from it.
3. **Keep `isAuthed()` as the boundary** when doing roadmap ① (HMAC→Supabase), or every `/api/vizf1/*` route breaks.
4. **Verify 043 / shared-Supabase-project** before any vizf1 pipeline work.

**Recommended placement: Option 2** (June ships the generic engine; vizf1 integration is the July initiative) or **Option 3** if a vizf1 proof is wanted sooner. Option 1 is viable only as a deliberate re-scope of the month.

---

*Generated June 3, 2026 · scope basis: comparison of the vizf1 integration spec against the 1-month foundation-first roadmap, all repo claims verified on `rohit/test`.*
