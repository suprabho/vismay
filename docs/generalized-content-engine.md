# Generalized content engine — reframing `f1_backend` as donor, not merge

**Reframes:** [`docs/vizf1-ai-pipeline-integration.md`](vizf1-ai-pipeline-integration.md) (vizf1-first port) → a generic-first engine
**Fuses with:** roadmap item ⑤ "AI research → stories" ([`docs/roadmap-june-2026.md`](roadmap-june-2026.md))
**Basis:** read of `f1_backend/AI/app/*` (pipeline + heuristics) and `f1_backend/Frontend/src/*` (render layer), verified against vismay's `packages/ai-gateway`, `packages/viz-engine`, `verticals/f1-viz`.

---

## The one-line reframe

`f1_backend` stops being a thing you **merge** and becomes two donors:

1. **A component + contract donor** for vismay's shared render layer.
2. **An architecture + heuristics blueprint** for the generalized research→render engine (roadmap ⑤).

vizf1 is then just the **first `DomainPack`** that plugs into that engine — not a parallel month-sized port. The expensive, reusable machinery is built once; each vertical is a thin pack + a skin.

```
                    ┌───────────────────────────────────────────────┐
                    │   packages/story-pipeline  (generic, built once)│
                    │                                                 │
  DomainPack ──────▶│  runner:     signal → angle → [curate] →        │
  (per vertical)    │              generate → embed → render          │
                    │  heuristics: verify-claims · filter-brief ·      │
                    │              resolve-entities · coherence-judge  │
                    │  contract:   GraphSpec + ContentBlock            │
                    │  render:     GraphSpecChart (ECharts)            │
                    └───────────────────────────────────────────────┘
                          ▲                ▲                ▲
                    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴──────┐
                    │ vizf1     │    │ vizmaya   │    │ footshots  │
                    │ pack +    │    │ pack +    │    │ pack +     │
                    │ F1 skin   │    │ Deck      │    │ match skin │
                    │ (first)   │    │ (⑤)       │    │ (parked ⑥) │
                    └───────────┘    └───────────┘    └────────────┘
```

---

## Axis 1 — Recycle the frontend (into the shared layer, not one app)

The decisive fact from the repo: **`f1_backend` renders on ApexCharts; vismay renders on ECharts** (`echarts` is a dep of `packages/viz-engine` + `apps/vizmaya-fyi`; `apexcharts` appears **nowhere** in vismay). So "recycle" splits cleanly into *recycle the contract & shells* vs *rebuild the chart leaves on ECharts*.

| `f1_backend` asset | Reuse mode | Lands in |
|---|---|---|
| **GraphSpec / ContentBlock type system** (`Frontend/src/types.ts` — 12 chart types, `paragraph / heading / quote / stat / graph_embed`) | **Recycle as-is** — render-lib-agnostic; becomes the cross-vertical render schema | `packages/story-pipeline/src/types.ts` (shared) |
| **`GraphBlock.tsx` dispatcher** (switch on `spec.type`, empty-state, AI-generated badge, caption) | **Recycle the shell**; swap the 8 `Apex*` leaves for ECharts builders | viz-engine module `graph-spec` + `GraphSpecChart.tsx` |
| **`Apex*Chart.tsx`** (line / multiline / projection / bar / scatter / heatmap / tiremap / svg) | **Rebuild on ECharts** (`StoryEChart`), reusing their series/annotation mapping logic | `verticals/f1-viz/.../builders/*` |
| **Admin panels** (`AngleReview`, `RunsPanel`, `WorkflowPanel`, `PipelineDAG`, `AuditPanel`, `GraphSimulator`, `StoriesPanel`) | **UX reference** — rebuild on service-role fetches, drop Firebase/axios | `apps/admin/components/<vertical>/` (generic, not f1-only) |
| **`StoryRenderer.tsx`** (content-block → JSX) | **Recycle the shell** for the native reader | `apps/vizf1/web/.../StoryBlocks.tsx` |
| **`race/*`** (`TrackViewport`, `Sparkline`, `PlaybackControls`, `DriverToggleList`) + `utils/trackProjection.ts` | **F1-only** — recycle into vizf1's consumer app, *not* the generic engine | `apps/vizf1/web` (vertical skin) |
| **`utils/regression.ts`** (linear/poly fit) | **Recycle** — generic projection math, any vertical | shared grounding utils |

**Dividing line:** the GraphSpec contract + the dispatcher pattern + the admin curation UX are **generic** and go in the shared layer; the F1 chart styling and race components are the **vertical skin** and stay in vizf1.

---

## Axis 2 — Generalize the pipeline architecture + heuristics

Reading the actual pipeline, the F1-specific parts are thinner than the integration doc implied — the **shape** is already generic. Two LangGraph flows + one CrewAI chain, mapping 1:1 onto roadmap ⑤'s `research → outline → sections`:

```
f1_backend                          generalized ⑤ engine
──────────                          ─────────────────────
telemetry → signals          ≡      research / ingest → signals
angle discovery (per scope)  ≡      outline / angle discovery
[admin selects angles]       ≡      [admin curation]      ← same human gate
story_crew (5 agents)        ≡      section / story generation
story_graph_pipeline (embed) ≡      chart embed + render
StoryRun status / logs       ≡      run tracking
```

### The `DomainPack` seam is the whole game — promote it to day 1
The integration doc made this Phase 6. In this reframe it's the **organizing principle**: a vertical supplies its Stage-A signal source, personas/prompts, entity roster, and chart types; the runner is vertical-agnostic. F1's lap-windows, drivers/teams, and telemetry channels are just *one pack's* values.

- **vizf1 pack** → Stage-A = race signals; entities = drivers/teams; slice = lap-window
- **vizmaya pack** (roadmap ⑤) → Stage-A = web/news/docs research; entities = topic-dependent; slice = research-chunk window
- **footshots pack** (parked ⑥) → Stage-A = match data; entities = players/clubs

### The heuristics are the crown jewels — port them generically first
`AI/app/utils/grounding.py` (448 LOC) and `judge.py` are **pure, framework-free, TS-portable rule logic** — and every vertical wants them. This is the highest-leverage extraction: it's what makes an AI content engine *trustworthy*, not just functional.

| Heuristic | What it does | Generalized form |
|---|---|---|
| `verify_claims_against_slice` | Post-gen check: every cited number/lap is consistent with the data the model actually saw (±0.10s tol) | **Generic claim-verifier** — "did the model invent a figure not in the source slice?" The anti-hallucination spine for *all* verticals |
| `filter_brief_for_angle` | Keep only brief sentences mentioning the focus entities | **Generic context-narrowing** — stops the model latching onto unrelated storylines |
| `resolve_angle_entities` + `lap_window_from_angle` | Parse angle text → which entities + data window it's about | **Generic "resolve entities + slice"** — lap-window is F1's notion of slice; vizmaya's is a date/chunk range |
| `judge_angle_coherence` (`judge.py`) | LLM-as-judge → sets `needs_review` | **Generic coherence gate** before publish |

### The embed sub-pipeline *is* the "render" half
`AI/app/pipelines/story_graph_pipeline.py` is a gem worth lifting wholesale (as TS):

```
load available charts → LLM picks which + where → materialize net-new
→ embed with a guaranteed fallback (a story is NEVER chart-less)
```

It generalizes directly to "given content blocks + a chart pool, decide embeds" for any vertical, and it already ships robustness worth keeping: graph-type alias normalization, caption→title token-overlap resolution, and ranked fallback embedding.

### Keep vismay's runtime, drop `f1_backend`'s
`AI/app/main.py` is FastAPI + Mongo + ThreadPoolExecutor. **Don't port the runtime** — port the *patterns* onto vismay's proven async-job lane (admin route → `workflow_dispatch` → worker `tsx` → Supabase status → realtime), exactly as the integration doc already decided. Patterns worth keeping:

- **Human-gated two-phase**: propose → curate → generate
- **Bounded concurrency caps**: `MAX_TOTAL_ANGLES` / `STORY_CONCURRENCY` / `ANGLES_PER_SCOPE`
- **Idempotent draft reuse**: `_ensure_angle_draft` reuses `storyId` on re-run
- **`StoryRun` status/log tracking** (→ `vizf1_workflow_events` / a generic `*_story_runs`)

---

## What this changes vs. the integration doc & the roadmap

- **Order flips, cost drops.** Integration doc = vizf1-specific → generalize at the end (build twice). Reframe = build the generic engine + guardrails + render layer **once**; vizf1 is the first thin pack. No vizf1→refactor tax.
- **It IS roadmap ⑤, supercharged.** ⑤'s "research→outline→section loop on ai-gateway" gets `f1_backend`'s stage choreography, the claim-verifier guardrail, and the never-chart-less embed flow for free. ⑤ stops being a from-scratch loop and becomes "wire the vizmaya `DomainPack` into the shared engine."
- **vizf1 leaves the critical path.** No longer a month-sized parallel port — it's "write the F1 `DomainPack` + ECharts chart builders + race skin" on top of an engine that already exists. Days, not weeks; it becomes the *demo* that proves the seam.
- **Shared investment, thin verticals.** The expensive reusable stuff (runner, heuristics, GraphSpec contract, `GraphSpecChart`, curation UI) is built once in `packages/story-pipeline` + viz-engine; footshots/vizmaya/vizf1 each become a pack + a skin.

**New mental model:** one generic content engine (roadmap ⑤), three donors from `f1_backend` (contract, components, heuristics), N thin packs (vizf1 first).

---

## Reframed phased sequence (generic-first)

| Phase | Build | Why first |
|---|---|---|
| **G0** | `packages/story-pipeline`: GraphSpec/ContentBlock contract (recycled from `types.ts`) + `DomainPack` interface + run/event types | Everything downstream depends on the contract + seam |
| **G1** | Port the **heuristics** as pure TS (`grounding/*`, `judge`) with unit tests lifted from `f1_backend` behaviour | Framework-free, no external deps, immediately testable — the trust spine |
| **G2** | Generic **runner** on vismay's async-job lane (admin route → `workflow_dispatch` → worker `tsx` → Supabase → realtime); port the embed sub-pipeline | The choreography that every vertical reuses |
| **G3** | **Render layer**: `GraphSpecChart` (ECharts) + `graph-spec` viz module + catalog sample; recycle `GraphBlock`/`StoryRenderer` shells | The "render" half; previews in `apps/catalog` before real data |
| **G4** | Generic **admin curation UI** (recycle the f1_backend panels' UX on service-role fetches) | Human gate, reused across verticals |
| **V1** | **vizf1 `DomainPack`**: F1 signal source, personas, roster, lap-window slice + F1 ECharts builders + race skin | First consumer — proves the seam end-to-end |
| **V2** | **vizmaya `DomainPack`** (= roadmap ⑤): research source, Deck output | Second consumer — proves cross-vertical with a *different* Stage-A input |
| later | footshots pack; deep F1 telemetry numerics (integration doc Phase 7) | Deferred — needs richer data |

---

## Bottom line

The integration doc and roadmap ⑤ describe the **same engine** seen from two ends. Reframing `f1_backend` as a **donor** (contract + components + heuristics) rather than a **merge target** resolves the tension: build the generic research→render engine once, recycle f1_backend's frontend contract + curation UX into the shared layer (rebuilding chart leaves on ECharts), port its heuristics as the trust spine, and ship verticals as thin `DomainPack`s — vizf1 first as the proof, vizmaya (⑤) second.

---

*Generated June 3, 2026 · reframe basis: `f1_backend` as donor for a generic content engine; all repo claims verified.*
