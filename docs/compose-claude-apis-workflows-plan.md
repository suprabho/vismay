# Plan: Claude APIs + agentic workflows for compose mode

**Status: plan-only. No code yet.** A decision record + phased roadmap for making
compose mode lean on Claude-native capabilities (server-side web search,
agentic tool-use loops, rubric-graded outcomes) rather than single-shot
structured calls. Covers all three phases; we execute one at a time.

*Refreshed 2026-06-11 against main @ `508514f`. The first draft (`293f30c`) was
written against the #172 scaffold; compose has since been rebuilt canvas-native
and DB-backed (#175–#188), and one piece of this plan — the direct Anthropic
SDK seam — has partially landed for a different reason. Everything below
reflects current main.*

## Why now

Compose today is a **per-step, client-orchestrated pipeline** — every step a
single-shot `generateStructured({ schema })` call routed through
`@vismay/ai-gateway`:

```
route 0 (new story) or start (attach to existing story)
  → sources (pasted text · PDF vision · URLs)
  → research (brief + clarifying Qs) → angles
  → outline (per-section stubs: kind + visual/content expectations)
  → per section: CONTENT pass → VISUAL pass (+ regions pass for choropleths)
  → two-pass charts → materialize → finish
```

- **State:** `compose_state` JSONB on the Supabase `stories` row
  (`@vismay/content-source/composeState`) — persisted per step, resumable,
  DB-only.
- **Routes:** `apps/admin/app/api/stories/[slug]/canvas/compose/{start,sources,angles,outline,section,charts,materialize,finish}/route.ts`
  plus route 0 at `apps/admin/app/api/stories/compose/route.ts`. Each is plain
  request/response (`maxDuration 120`); orchestration lives client-side in
  `ComposeFlowPanel.tsx`. (The first draft's single SSE driver at
  `api/vizmaya/compose/generate` no longer exists.)
- `packages/story-pipeline/src/research.ts` — `research()` → one structured
  call over the uploaded `SourceDoc[]`. No live retrieval.
- `packages/story-pipeline/src/generate.ts` — two-pass section gen
  (`generateSectionContent` / `generateSectionVisual`), subsection passes, and
  `generateRegions` for choropleths. Every pass takes an optional
  `refine: { feedback, previous }` — but that feedback is **typed by the
  author** in the UI. The model never sees `validateStory` output
  automatically.
- `packages/story-pipeline/src/ai.ts` — `generateStructured()`: single shot,
  one-retry fallback to a tool-calling model when Gemini's JSON mode chokes on
  the section `body` discriminated unions.
- **Quality loop today:** `validateStory` (`validate.ts`) runs post-assembly;
  `lintLayout.ts` and the `eval:outline` harness drive *prompt* iteration
  offline. Neither feeds generation at run time.

Claude is **already the default** (`DEFAULT_TEXT_MODEL = 'text.claude'` →
Sonnet 4.6; `text.opus` → Opus 4.8 in the model picker) — so we use Claude
*the model* but not Claude *the agent platform*. The capabilities that would
move the needle for compose — **server-side web search/fetch with citations**,
**agentic tool-use loops**, **rubric-graded outcomes (iterate→grade→revise)**,
extended thinking, compaction — are exactly the things a single structured
call can't do.

## The architectural decision: a scoped carve-out from the gateway

This is the load-bearing decision, so it goes first — and **half of it has
already happened, undocumented**.

`@vismay/ai-gateway` exists **specifically to stay provider-agnostic** ("swap
Gemini Flash → Claude Sonnet in one line") and `apps/admin/CLAUDE.md` codifies
the rule: *don't import provider SDKs directly — add a model alias and call
`generateText`/`generateImage`*. That rule is right for plain text/image gen
and should stay — compose's PDF-vision ingest, for instance, correctly rides
the gateway (`text.claude` + Gemini fallback).

But `packages/story-pipeline/src/ai.ts` **already imports `@anthropic-ai/sdk`
directly**, behind `STORY_PIPELINE_ANTHROPIC_DIRECT=1` — added as a quota
bypass for eval runs (the gateway's ~$2 cap blocks the harness). So the
carve-out is no longer hypothetical; the work is to *legitimize and shape* it
rather than introduce it:

- **Keep the gateway** for all provider-swappable text/image gen (the bulk of
  the repo).
- **Name the seam.** All direct-SDK surface lives in one place —
  `story-pipeline/src/claude/` (extract to a `@vismay/claude-agent` package
  when Phase 3 needs it). Fold the existing `STORY_PIPELINE_ANTHROPIC_DIRECT`
  path in as the seam's "plain structured" mode so there is exactly one
  Anthropic client in the codebase.
- **Amend `apps/admin/CLAUDE.md` now**, not at Phase 1 — the exception already
  exists in code with no doc trail. Provider SDKs stay banned *except* the
  Claude seam, which may import `@anthropic-ai/sdk` for capabilities the
  gateway can't proxy.
- **Two modes, two configs.** The existing eval-parity mode deliberately keeps
  thinking OFF and forces a single tool so comparisons against the gateway stay
  apples-to-apples — keep it that way. The new agentic mode is the opposite:
  `thinking: {type: "adaptive"}`, streaming for large `max_tokens`, server
  tools. They share the client, never the defaults.

### New surface this introduces

- **Auth.** Gateway calls use Vercel OIDC in prod (no key) /
  `AI_GATEWAY_API_KEY` in dev. The seam uses `ANTHROPIC_API_KEY` — already
  provisioned locally for the eval path; add it to Vercel when the first
  run-time feature (Phase 1) ships. Managed Agents (Phase 3) additionally need
  beta access.
- **Models.** First-party IDs are bare (`claude-opus-4-8`,
  `claude-sonnet-4-6`) — *not* the gateway's `anthropic/claude-*.*` strings.
  `ai.ts` already maps `text.opus` → `claude-opus-4-8` and everything else →
  `claude-sonnet-4-6`; the seam owns that mapping. Don't reuse `MODELS.text`
  aliases beyond this translation.

## Phase 1 — web search in research (smallest, highest leverage)

**Goal.** Research briefs grounded in live, cited sources instead of only what
the editor uploaded.

The roadmap resolved compose sourcing as **uploaded sources** (pasted text +
PDF vision + URLs) — which makes live search *complementary*, not redundant:
the editor's documents anchor the story; Claude's search fills gaps, checks
recency, and brings citations the uploads can't.

Today `research()` reads `SourceDoc[]` and returns a `ResearchBrief`. Add an
optional Claude path that declares the server-side web tools and lets Claude
search/fetch before composing the brief:

```ts
tools: [
  { type: 'web_search_20260209', name: 'web_search' },
  { type: 'web_fetch_20260209',  name: 'web_fetch' },
]
```

(`_20260209` versions do dynamic filtering automatically — no extra
`code_execution` declaration.)

- **Where:** new `researchWithClaude()` in the Claude seam; `research()` gains
  a `live?: boolean` option that routes to it. Falls back to the existing
  gateway path when off. The flag surfaces as a toggle wherever the research
  step is triggered (`ComposeFlowPanel` research stage).
- **Output:** keep returning `ResearchBrief`, but thread the **citations**
  through to `SourceDoc`/the brief so story sourcing reflects what Claude
  found.
- **Server-side loop:** handle `stop_reason: "pause_turn"` (re-send to resume)
  since the search loop can exceed its iteration cap.
- **De-risks the seam:** one tool declaration and a structured final output.
  And it's cheaper than the first draft assumed — the SDK dependency, client,
  and `ANTHROPIC_API_KEY` already exist via the eval path; what's new is the
  seam module, the CLAUDE.md amendment, and the `pause_turn` loop.

## Phase 2 — agentic section generation (re-measure, then close the loop)

**Goal.** Sections that fix their own config before we ever persist.

**The premise needs re-measuring first.** The first draft cited section-schema
failures (`9c25a5b`) that the one-retry fallback papers over — but those
predate the two-pass split. Since then, the VISUAL pass is constrained by
viz-engine's own layer schemas ("valid by construction"), formats narrow their
`kind` enums, and map bodies get regions/pins through dedicated passes. The
residual failure classes are the ones schemas *can't* express: region-accepts
mismatches, layout overflow (`lintLayout`), fabricated asset `src`, invented
chart ids.

- **Step 0 — measure.** Run the existing `eval:outline` harness
  (`EVAL_DIRECT=1`) and tally residual `validateStory` + `lintLayout` issue
  rates per section. If they're negligible, Phase 2 shrinks to a backlog item
  and Phase 3 becomes the next move. If material, proceed:
- **Close the loop we already have.** `generateSection*` already accepts
  `refine: { feedback, previous }` — today only humans feed it. The cheapest
  agentic version is *machine-fed refine*: run `validateStory`/`lintLayout` on
  the draft, and if issues exist, re-call the pass with the issue list as
  `feedback`. No new seam required; works through the gateway path too.
- **The full version — validator as a tool.** Recast section gen in the Claude
  seam as a tool-use loop: **`validate_section(body)`** wraps the existing
  `collectLayers` + `mod.parseConfig` + layout/region/chart-id checks and
  returns `ValidationIssue[]` until clean. Optionally `list_layer_types` so
  Claude works against the live layer menu rather than a prompt snapshot.
- **Outcome framing:** wrap a section batch as a `user.define_outcome` with a
  rubric ("every section: valid `foreground`, anchor `text` matches the
  `## heading`, no fabricated asset `src`, references only emitted chart ids")
  → iterate→grade→revise, replacing the blunt one-retry in
  `generateStructured` with criterion-level repair.
- **Where:** `generateSectionAgentic()` in the seam, selected per run from the
  section route; tool-use/validation events surface as progress in
  `ComposeFlowPanel`. `compose_state` already persists per step, so resume
  semantics carry over.

## Phase 3 — compose as a Managed Agent + Outcome (the ambitious one)

**Goal.** Hand the whole "turn these sources into a story" job to a Claude
**Managed Agent**: Anthropic runs the agent loop in a per-session sandbox; we
stream its events into the UI and collect the finished files.

The fit is still strong — compose's shape mirrors Managed Agents, now even
more cleanly since state became a DB row:

| Compose today | Managed Agents |
|---|---|
| `compose_state` JSONB on the `stories` row — per-step, resumable | Session object + event stream, resumable |
| Per-step routes + `ComposeFlowPanel` progress stages | SSE session event stream (`agent.message`, `agent.tool_use`, `session.status_idle`) |
| `validateStory` after the fact | Outcome rubric grades each iteration |
| `materialize` writes via `appendStorySection` / `@vismay/content-source` | agent writes to `/mnt/session/outputs/`, downloaded via Files API |

- **Agent (once):** `model: claude-opus-4-8`, system = the story-format spec,
  `tools: [agent_toolset_20260401]` (bash/read/write/web_search/web_fetch),
  **skills** for the section/deck/map schema docs — the
  `compose-section-schema` skill in this branch and
  `apps/vizmaya-fyi/docs/map-story-authoring.md` are exactly the payload.
  Created once, referenced by ID — *not* per request (the #1 anti-pattern).
- **Session (per run):** mount the story's uploaded sources as file resources;
  kick off with a `user.define_outcome` carrying the Phase 2 rubric (a story is
  "done" when it validates + every anchor matches).
- **Bridge:** the agent writes story files into the sandbox; we pull them via
  `files.list({ scope_id, betas: [...] })` and land them through the existing
  `@vismay/content-source` write path (`appendStorySection` / config replace —
  the same primitives `materialize` uses) so the canvas rebuilds exactly as
  today.
- **Heavier lift:** beta access, the full session-event client (stream-first,
  reconnect-with-consolidation, idle-gate on terminal `stop_reason`), and a
  decision about how agent events map onto `ComposeFlowPanel`'s per-stage UI.
  Phases 1–2 stand up the auth + seam that make this tractable.

## Build order

1. **Document the carve-out** — amend `apps/admin/CLAUDE.md`, create the seam
   module, fold the existing `STORY_PIPELINE_ANTHROPIC_DIRECT` path into it.
   Pure refactor + docs; no behavior change.
2. **Phase 1** — `researchWithClaude()` behind a `live` flag; `pause_turn`
   loop; citations threading. First run-time use of the seam.
3. **Phase 2, step 0** — eval-harness measurement of residual failure rates;
   go/no-go on the rest of Phase 2. If go: machine-fed refine first, the
   tool-use loop second.
4. **Phase 3** — promotes the loop to a Managed Agent, reusing everything.

Each phase is independently shippable behind a per-run toggle, so the existing
gateway pipeline stays the default until each Claude path proves out.

## Open decisions

- **A. Package boundary** — `@vismay/claude-agent` package vs
  `story-pipeline/src/claude/` subpath. Lean: subpath through Phases 1–2,
  extract to a package when Phase 3 needs it from outside the pipeline.
- **B. Citations model** — how much of Claude's web-search citation payload to
  surface in the story (footnotes? a sources section? frontmatter?). Needs a
  product call, not just plumbing.
- **C. Phase 2 go/no-go threshold** — what residual failure rate justifies the
  agentic loop over the (cheap) machine-fed refine? Decide after step 0's
  numbers exist.
- **D. Self-hosted vs cloud sandbox (Phase 3)** — cloud is simplest;
  self-hosted keeps source docs on our infra. Default cloud unless sourcing is
  sensitive.
- **E. Cost/latency** — agentic loops and `max`/`xhigh` effort cost more than
  one-shot calls. Keep the gateway path as the cheap default; make the Claude
  path opt-in per run (the model picker in `ComposeFlowPanel` already sets the
  precedent for per-run choice).
