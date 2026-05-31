# Integrate f1_backend AI pipeline, data model & visuals into vismay (vizf1 pilot)

## Context

`f1_backend/` is a standalone, mature reference implementation of an F1 content engine: a multi-stage AI pipeline (Python LangGraph + CrewAI), an Express/MongoDB backend, and a Vite/React frontend with a GraphSpec-driven chart framework and an admin curation workflow. Its **architecture** is valuable; its **stack** diverges sharply from vismay's. Separately, `apps/vizf1` is already a working vismay-native vertical (Next.js consumer app + a TS Cloudflare/worker that ingests F1 data and generates editorial segments via Gemini + its own Supabase schema + an `@vismay/eval-entities` harness).

The goal is to fuse f1_backend's pipeline architecture and viz framework into vismay's platform conventions so that (1) the AI/backend is compatible with `apps/admin` (viz-admin), (2) the pipeline structure is scalable across verticals (vizmaya-fyi, footshots, vizf1), and (3) the frontend visuals are verticalized and reusable on vizf1.

### Locked decisions (from review with the user)
1. **AI runtime = TypeScript on `@vismay/ai-gateway`.** No Python/LangGraph/CrewAI — we adopt the *stages*, replace the *frameworks*. The actual pipeline is ~70% framework glue, ~5% LLM calls, ~25% numeric; LangGraph is a linear sequence + one fan-out, CrewAI is 4–5 sequential LLM calls, and `grounding.py` is pure rule-based TS-portable logic. The LLM seam maps 1:1 onto ai-gateway, and the vizf1 worker is already TS + Gemini.
2. **F1 numeric heuristics = deferred for the pilot, ported to TS later.** vizf1 stores only per-lap positions + results today (no 3.7Hz telemetry/stints/compounds), so the ~1,400 LOC of `numpy.polyfit`/pandas-rolling/MAD-z-score has no input data yet. The pilot derives Stage-A signals from the aggregates we already have; deep telemetry numerics are an explicit later phase. (Decision diagram: https://excalidraw.com/#json=R3y9evTA3BGRRkLWHdoSF,PjO7yWQ12kDewx2Kl-MEVg)
3. **Data store = Supabase-only.** Port the data model (Story content-blocks, GraphSpec, Signal, AnalysisAngle, StoryRun) to Postgres extending vizf1's schema; `jsonb` for polymorphic spec/content. Drop MongoDB/Express/Firebase. Auth = admin HMAC cookie (apps/admin) + service-role writes + RLS public-read-where-published.
4. **Frontend = verticalize the visuals, follow existing structure.** Consumer charts → reusable f1-viz viz-engine modules rendered by `apps/vizf1/web`; admin curation panels → `apps/admin`. No standalone Vite app.
5. **Scope = pilot vizf1 first, then generalize.** Build the cross-vertical seam but wire it concretely on vizf1.

---

## Architecture

The pipeline is a vertical-agnostic stage engine with a per-vertical "domain pack":

```
Ingest (existing worker) → A. Signal detection → B. Angle discovery (LLM)
→ C. Human curation (apps/admin) → D. Story + chart generation (LLM)
→ E. Render (viz-engine on apps/vizf1/web).   A StoryRun row tracks each run.
```

- **Generic, reusable** → new package `@vismay/story-pipeline`: the run orchestrator, stage choreography, ported grounding utilities, and the LLM call patterns (all via ai-gateway). Exposes a `DomainPack` interface (signal source, personas/prompts, supported chart types, entity/roster model, persistence adapter) that footshots/vizmaya implement later.
- **F1-specific** → stays in `apps/vizf1/worker/src/pipeline/`: the Stage-A numerics over aggregates, the F1 personas/prompts, the F1 roster loader, and the `PipelineStore` impl that reads/writes the `vizf1_*` tables.

### New shared package: `packages/story-pipeline/`
```
src/index.ts            public surface
src/types.ts            Signal, AnalysisAngle, GraphSpec, ContentBlock, StoryRun, enums
src/domainPack.ts       DomainPack<TEntity, TSignalInput> — the cross-vertical seam
src/runner.ts           drives stages; writes StoryRun status/logs/outputRef
src/stages/{signalDetection,angleDiscovery,storyGeneration}.ts
src/grounding/{lapWindow,claimVerifier,entityResolver,angleInvites,sanitizeBlocks}.ts  # TS ports of grounding.py
src/llm/callPatterns.ts # wraps generateText({schema}) + recordGeneration audit + retry
```
Depends only on `@vismay/ai-gateway` and `@supabase/supabase-js` (peer). Add to `transpilePackages` in `apps/admin/next.config.ts` and `apps/vizf1/web/next.config.ts`.

---

## Data model — new migrations under `apps/vizf1/supabase/migrations/`

Continue numbering from `004_` (a `003_` already collides). Model on `001_init.sql` conventions: `vizf1_`-prefixed tables, RLS on, `notify pgrst, 'reload schema';` footer. ObjectId refs become real FKs (`driver_id`→`vizf1_drivers`, `constructor_id`→`vizf1_constructors`); Mongoose enums become `CHECK`; `Schema.Types.Mixed` becomes `jsonb`.

- **`004_ai_pipeline_core.sql`** — `vizf1_story_runs` (status queued/running/done/failed, `output_ref jsonb`, `triggered_by` = admin email), `vizf1_signals` (priority, `telemetry_fields jsonb`, scope_kind, FKs), `vizf1_analysis_angles` (status proposed/selected/rejected/generated, `lap_window int4range`, `supporting_signal_ids uuid[]`).
- **`005_ai_stories_graphs.sql`** — `vizf1_stories` (**new first-class table**; `content jsonb` = the content-block array, `status`, `scope_kind`, `needs_review`, `angle_coherence_score`, FKs to session/angle/parent), `vizf1_graph_specs` (`type` CHECK over the 12 chart types, `spec jsonb` for axes/series/dataPoints/annotations/svgPaths, FK to story), `vizf1_workflow_events` (append-only run log, replaces the `StoryRun.logs[]` array). Add the deferred `analysis_angles.story_id → stories.id` FK here.
- **`006_ai_pipeline_rls.sql`** — public read on `vizf1_stories` where `status='published'` and on `vizf1_graph_specs` whose parent story is published; **no anon policy** on runs/signals/angles/events/draft-stories → default-deny gives "service-role + admin-server-route only" for free.

**Content-model reconciliation:** do **not** overload `vizf1_articles`/`vizf1_story_segments` (RSS news / Instagram-style StoryRings — different shape; would break `buildStorySegments.ts`/`StoryViewer`). The new `vizf1_stories` table mirrors f1_backend's `Story.model.ts` and is the clean home for AI long-form narrative.

---

## Pilot data flow & entry points

Reuse the repo's established async-job pattern (admin route → `workflow_dispatch` → worker `tsx` script → Supabase status row → admin reads via realtime), proven by `packages/content-source/src/storyAudioDispatch.ts` + `.github/workflows/render-audio.yml`. No FastAPI/server is introduced.

| Stage | Trigger | File |
|---|---|---|
| Ingest | cron | `apps/vizf1/worker/src/ingestSessions.ts` (unchanged) |
| A — Signals | worker | `apps/vizf1/worker/src/pipeline/detectSignals.ts` — positions/results → overtakes, recovery drives, quali-vs-race delta, best-lap percentile (~150 LOC plain TS) |
| B — Angles | worker | `apps/vizf1/worker/src/pipeline/discoverAngles.ts` → `@vismay/story-pipeline` angleDiscovery + F1 pack, `generateText({schema})` for typed output |
| C — Curation | admin | writes `vizf1_analysis_angles.status` (§ Admin) |
| D — Stories+Charts | worker | `apps/vizf1/worker/src/pipeline/generateStories.ts` → sequential analyst→writer→chart-curator→fact-checker; charts → `vizf1_graph_specs` |
| E — Render | consumer | new native reader in `apps/vizf1/web` (§ Frontend) |

Single dispatched CLI `apps/vizf1/worker/src/pipeline/run.ts` reads `STAGE`/`SESSION_ID`/`RUN_ID`, runs the runner with the F1 DomainPack, inserts `vizf1_workflow_events`, and patches `vizf1_story_runs`. New workflow `.github/workflows/vizf1-ai-pipeline.yml`. Add `pipeline:*` scripts to `apps/vizf1/worker/package.json` mirroring the `ingest:*` convention.

---

## Admin curation UI (`apps/admin`)

Follow the existing `[appSlug]/(tabbed)` dynamic-routing + `isAuthed()` gate. Add `vizf1` as an appSlug with AI tabs. The f1_backend `Frontend/src/components/admin/*` panels are the UX reference; drop their Firebase/axios layer for service-role fetches behind the HMAC cookie.

- Pages: `app/vizf1/(tabbed)/{workflow,runs,angles,stories/[id]}/page.tsx` — trigger a run; live run status/log (Supabase realtime); review/select/reject angles; draft review + publish.
- Client components: `components/vizf1/{RunTriggerPanel,RunStatusPanel,AngleReviewList,StoryDraftReader}.tsx`.
- API routes (all `isAuthed()`-gated, all use `createServiceClient()` exactly like `app/api/vizmaya/stories/[slug]/assets/generate/route.ts`):
  - `POST /api/vizf1/runs` `{sessionId, stage, scopes}` → insert run + `dispatchPipelineRunJob()` → `{runId}`
  - `GET /api/vizf1/runs[/:id]`, `GET/PATCH /api/vizf1/angles[/:id]` (`{status}`), `GET/PATCH /api/vizf1/stories/:id` (publish → `status='published'`, `published_at=now()`).

Happy path = pick session → run signals+angles → select N angles → run stories → review drafts → publish (preserves f1_backend's human-gated two-phase flow).

---

## Frontend visuals (`verticals/f1-viz`) + render path

**Charting reconciliation:** render GraphSpecs as **ECharts** (viz-engine core charting lib — `StoryEChart`), not Recharts/Apex (avoids a third lib). One generic module `f1:graph-spec` switches on `spec.type`:
```
verticals/f1-viz/src/modules/graph-spec/{index.ts,Component.tsx,builders/{line,bar,scatter,projection,heatmap,svg}.ts}
verticals/f1-viz/src/web/GraphSpecChart.tsx   # shared React renderer (also usable by native pages)
```
Map: line/multi_line/comparison/area/sparkline → line series; bar/bar_grouped → bar; scatter → scatter; projection → dashed projected series + `markArea` band; tire_map/heat_map → heatmap; annotated_svg → raw `<svg>` passthrough. Register in `verticals/f1-viz/src/index.ts`'s `register()` (the existing `TODO(vizf1-scaffold)` extension point). Ship a `sample.ts` so it previews in `apps/catalog` at `/f1:graph-spec`.

**Consumer render (native, not the vizmaya.fyi iframe):** AI stories live in vizf1's own `vizf1_stories`, so add a native reader rather than retrofitting vizmaya.fyi's markdown/config content-source:
```
apps/vizf1/web/app/analysis/[slug]/{page.tsx,StoryReader.tsx}
apps/vizf1/web/components/StoryBlocks.tsx        # paragraph/heading/quote/stat
apps/vizf1/web/lib/useAnalysisStory.ts           # tanstack-query hook (mirror useStorySegments.ts)
```
`graph_embed` blocks carry `{graphId, meta.caption}`; the page joins the story's `vizf1_graph_specs` server-side into a `{id→spec}` map and renders `<GraphSpecChart spec={...} caption={...}/>`. RLS already ensures anon only sees charts for published stories. The existing `/editorial` iframe path stays for vizmaya.fyi-authored pieces; `/analysis` serves AI stories.

---

## Auth alignment

Drop Firebase/JWT/`User.model.ts`. The admin HMAC cookie (`apps/admin/lib/adminAuth.ts` → `@vismay/admin-core`) is the single trust boundary: every `/api/vizf1/*` route starts with `if (!(await isAuthed())) return 401`. Worker writes use the service-role key (`apps/vizf1/worker/src/supabase.ts`). Consumers read via anon key + RLS. Every LLM call writes `ai_generations` via `recordGeneration`/`hashRequest` for spend tracking + dedupe — confirm migration `043_ai_generations.sql` is applied to vizf1's (shared) Supabase project. `triggered_by` is informational audit, not a gate (no per-user RBAC in the pilot).

---

## Phased sequence

- **Phase 0** — Migrations `004/005/006`; scaffold `@vismay/story-pipeline` (`types.ts`+`domainPack.ts`); wire `transpilePackages`. *Tables live, types compile.*
- **Phase 1** — Stage A signals (`detectSignals.ts` over positions/results) + `run.ts` CLI + run/event plumbing. *`pipeline:signals` populates `vizf1_signals`.*
- **Phase 2** — Stage B angle discovery: port `grounding/*`, F1 personas, `discoverAngles.ts` with `generateText({schema})`. *Angles land as `proposed`.*
- **Phase 3** — Admin curation: `/api/vizf1/{runs,angles}`, `vizf1-ai-pipeline.yml` + `dispatchPipelineRunJob`, Workflow/Runs/Angles pages with realtime. *Operator triggers + curates from browser.*
- **Phase 4** — Stage D story+chart generation: sequential chain, chart-curation/embed reuse, claim-verifier + coherence judge set `needs_review`. *Selected angles → draft `vizf1_stories` with `graph_embed` blocks.*
- **Phase 5** — Frontend: `f1:graph-spec` module + `GraphSpecChart` + catalog sample; `/analysis/[slug]` native reader; admin draft reader + Publish. *Full A→E loop renders on vizf1.com.*
- **Phase 6** — Cross-vertical seam: push any leaked F1 specifics behind `DomainPack`; document the contract; sketch a football pack stub to prove reuse.
- **Phase 7 (DEFERRED)** — Deep telemetry numerics: ingest 3.7Hz/sectors/stints/compounds; port the numpy/pandas heuristics to TS; enable `tire_map`/telemetry-trace GraphSpecs with real data.

---

## Verification

- **Worker stages:** run a finished session through `pnpm --filter @vizf1/worker pipeline:signals` → `:angles` → `:stories`; inspect Supabase rows. Pure grounding functions (`grounding/*.ts`) get TS unit tests with fixtures lifted from f1_backend behaviour (lap-window parsing, claim-verifier mismatches).
- **f1-viz modules:** `pnpm --filter @vismay/catalog dev`, open `/f1:graph-spec`, eyeball each chart type against `sample.ts` (fast loop before real data).
- **Admin flow:** `pnpm --filter admin dev`, log in (HMAC cookie), `/vizf1/workflow` → trigger → watch `/vizf1/runs` realtime → select angles → run stories → publish in `/vizf1/stories/[id]`; confirm 401 when unauthed.
- **Consumer render:** `pnpm --filter @vizf1/web dev`, open `/analysis/[slug]` for a *published* story (content blocks + embedded charts); confirm a *draft* slug is empty/404 (RLS gate) via the anon path.
- **CI dry-run:** `workflow_dispatch` `vizf1-ai-pipeline.yml` manually (the ingest workflow already proves Actions + pnpm + Node 22 + Supabase secrets).
- **Graph-wide:** `pnpm typecheck` / `pnpm lint` at root (turbo) — validates the new package's contract against worker + admin + web.

---

## Critical files
- `packages/story-pipeline/src/domainPack.ts` (new — the cross-vertical seam) and `src/grounding/claimVerifier.ts` (new — TS port of `f1_backend/AI/app/utils/grounding.py`)
- `apps/vizf1/worker/src/pipeline/run.ts` (new — worker orchestrator, beside existing `buildStorySegments.ts`/`gemini.ts`/`supabase.ts`)
- `apps/vizf1/supabase/migrations/004_ai_pipeline_core.sql` + `005_ai_stories_graphs.sql` + `006_ai_pipeline_rls.sql` (new — modeled on `001_init.sql`)
- `verticals/f1-viz/src/modules/graph-spec/index.ts` (new — GraphSpec→ECharts module, registered in `verticals/f1-viz/src/index.ts`)
- `apps/admin/app/api/vizf1/runs/route.ts` (new — clones auth+service-role of `app/api/vizmaya/stories/[slug]/assets/generate/route.ts` + dispatch of `storyAudioDispatch.ts`)
- `apps/vizf1/web/app/analysis/[slug]/page.tsx` (new — native AI-story reader)

## Reused utilities
- `@vismay/ai-gateway`: `generateText({schema})`, `MODELS`, `recordGeneration`/`hashRequest`/`lookupCachedGeneration` (audit + dedupe).
- `@vismay/viz-engine`: `registerVizModule`, `VizModule`/slots, `StoryEChart`.
- `@vismay/content-source`: `createServiceClient()`; fs/db patterns.
- `@vismay/admin-core` via `apps/admin/lib/adminAuth.ts` (`isAuthed()`), `storyAudioDispatch.ts` (workflow_dispatch pattern).
- vizf1 worker: `supabase.ts`, `entityResolver.ts`, `eval/` (`@vismay/eval-entities`), `gemini.ts` (structured-output pattern reference).

## Risks / open questions
1. **Pilot signal quality is capped by thin data** — positions+results only; pilot proves the *pipeline*, not telemetry-grade insight (Phase 7 lifts this).
2. **Structured-output reliability** — keep `sanitizeBlocks.ts` as a guardrail even though `generateObject` constrains at provider level.
3. **Three story surfaces on vizf1** (news rings, iframed editorial, native AI analysis) — flag eventual consolidation.
4. **Realtime in deployed admin** — browser-side realtime is fine; keep `GET /api/vizf1/runs/:id` HTTP-poll fallback.
5. **Run cost/concurrency** — cap angles/stories per run (port f1_backend's `MAX_TOTAL_ANGLES`/`STORY_CONCURRENCY` as worker env); generate sequentially per job.
6. **Slug idempotency** — reuse an angle's existing `story_id` on re-runs (port `_ensure_angle_draft` behaviour).
