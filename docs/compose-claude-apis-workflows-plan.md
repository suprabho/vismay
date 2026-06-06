# Plan: Claude APIs + agentic workflows for compose mode

**Status: plan-only. No code yet.** A decision record + phased roadmap for making
compose mode lean on Claude-native capabilities (server-side web search,
agentic tool-use loops, rubric-graded outcomes) rather than the current fixed
linear pipeline. Covers all three phases; we execute one at a time.

## Why now

Compose today is a **fixed linear pipeline**, every step a single-shot
`generateText({ schema })` call routed through `@vismay/ai-gateway`:

```
ingest sources → research (brief + clarifying Qs) → outline → sections (batched 3, streamed, resumable) → write .md + .config.yaml + charts + imageprompts
```

- `packages/story-pipeline/src/research.ts` — `research()` → one structured call.
- `packages/story-pipeline/src/generate.ts` — `generateOutline()` + `generateSection()`, one call each.
- `apps/admin/app/api/vizmaya/compose/generate/route.ts` — the SSE driver + `ComposeSession` persistence.
- `packages/story-pipeline/src/ai.ts` — `generateStructured()`: single shot, with a one-retry fallback to a tool-calling model when Gemini's JSON mode chokes on the section `body` discriminated unions.

Claude is **already the default** (`DEFAULT_TEXT_MODEL = 'text.claude'`,
`text.opus` available) — so we use Claude *the model* but not Claude *the agent
platform*. The capabilities that would move the needle for compose —
**server-side web search/fetch with citations**, **agentic tool-use loops**,
**rubric-graded outcomes (iterate→grade→revise)**, extended thinking,
compaction — are exactly the things a single structured call can't do.

## The architectural decision: a scoped carve-out from the gateway

This is the load-bearing decision, so it goes first.

`@vismay/ai-gateway` exists **specifically to stay provider-agnostic** ("swap
Gemini Flash → Claude Sonnet in one line") and `apps/admin/CLAUDE.md` codifies
the rule: *don't import provider SDKs directly — add a model alias and call
`generateText`/`generateImage`*. That rule is right for plain text/image gen and
should stay.

But the Claude-native features above are **not exposed through the Vercel AI
Gateway** — they need the Anthropic SDK (`@anthropic-ai/sdk`) directly, against
the first-party API. So this work requires a **deliberate, scoped exception**,
not a drift:

- **Keep the gateway** for all provider-swappable text/image gen (the bulk of the repo).
- **Add one new Claude-specific seam** — a `@vismay/claude-agent` package (or a
  `story-pipeline/src/claude/` subpath) that owns the direct Anthropic SDK
  calls. Everything Claude-agentic flows through this one file, mirroring how the
  gateway is "one client, one seam."
- **Amend `apps/admin/CLAUDE.md`** to name the exception explicitly: provider SDKs
  stay banned *except* the Claude-agent seam, which is allowed to import
  `@anthropic-ai/sdk` for capabilities the gateway can't proxy.

### New surface this introduces

- **Auth.** Gateway calls use Vercel OIDC in prod (no key) / `AI_GATEWAY_API_KEY`
  in dev. Claude-native features are first-party Anthropic API → a separate
  `ANTHROPIC_API_KEY` (and, for Managed Agents, beta access). New secret to
  provision in `apps/admin/.env.local` + Vercel.
- **Models.** First-party model IDs are bare (`claude-opus-4-8`,
  `claude-sonnet-4-6`) — *not* the gateway's `anthropic/claude-*.*` strings.
  Don't reuse `MODELS.text` aliases here; the seam has its own constant.
- **Defaults.** Opus 4.8 with `thinking: {type: "adaptive"}`; adaptive thinking
  is **off unless set explicitly**. Stream anything with large `max_tokens`.

## Phase 1 — web search in research (smallest, highest leverage)

**Goal.** Research briefs grounded in live, cited sources instead of only the
docs the editor pasted in.

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

- **Where:** new `researchWithClaude()` in the Claude seam; `research()` gains a
  `live?: boolean` option that routes to it. Falls back to the existing
  gateway path when off.
- **Output:** keep returning `ResearchBrief`, but thread the **citations**
  through to `SourceDoc`/the brief so story sourcing reflects what Claude found.
- **Server-side loop:** handle `stop_reason: "pause_turn"` (re-send to resume)
  since the search loop can exceed its iteration cap.
- **De-risks the seam:** this is one tool declaration and a structured final
  output — the cheapest way to stand up auth + the new package + the CLAUDE.md
  carve-out and prove the path end-to-end.

## Phase 2 — agentic section generation (self-correcting YAML)

**Goal.** Sections that fix their own config before we ever persist — directly
attacking the section-schema failures (`9c25a5b`, `deca…`) the fallback-retry
currently papers over.

Today `generateSection()` emits a section, and `validateStory()` runs *after*
assembly (`validate.ts` re-parses every foreground layer through viz-engine's
real `parseConfig`). The model never sees its own validation errors.

Recast section gen as a **Claude tool-use loop** (manual loop or SDK tool
runner) where the validator is a *tool*:

- **`validate_section(body)`** — wraps the existing `collectLayers` +
  `mod.parseConfig` + layout/region/chart-id checks from `validate.ts`; returns
  the `ValidationIssue[]` to Claude so it revises until clean.
- Optionally **`append_section` / `list_layer_types`** so Claude works against
  the real insertion primitives and the live layer-type menu rather than a
  prompt snapshot.
- **Outcome framing:** wrap the whole section batch as a `user.define_outcome`
  with a rubric ("every section: valid `foreground`, anchor `text` matches the
  `## heading`, no fabricated asset `src`, references only emitted chart ids")
  → the harness runs iterate→grade→revise. This replaces the blunt one-retry in
  `generateStructured` with targeted, criterion-level repair.
- **Where:** `generateSectionAgentic()` in the seam, selected per-run; the SSE
  route streams its tool-use/validation events into the existing progress UI
  (`ComposePanel.tsx`). The `ComposeSession` store already persists per-section,
  so resume semantics carry over.

## Phase 3 — compose as a Managed Agent + Outcome (the ambitious one)

**Goal.** Hand the whole "turn these sources into a story" job to a Claude
**Managed Agent**: Anthropic runs the agent loop in a per-session sandbox; we
stream its events into the UI and collect the finished files.

The fit is strong because compose's shape already mirrors Managed Agents:

| Compose today | Managed Agents |
|---|---|
| `ComposeSession` (`shared.ts`) — persisted per-step, resumable | Session object + event stream, resumable |
| SSE `outline`/`section`/`done` events → `ComposePanel` | SSE session event stream (`agent.message`, `agent.tool_use`, `session.status_idle`) |
| `validateStory` after the fact | Outcome rubric grades each iteration |
| writes `.md` + `.config.yaml` + charts to `storyContentDir()` | agent writes to `/mnt/session/outputs/`, downloaded via Files API |

- **Agent (once):** `model: claude-opus-4-8`, system = the story-format spec,
  `tools: [agent_toolset_20260401]` (bash/read/write/web_search/web_fetch),
  skills for the deck/map schema docs. Created once, referenced by ID — *not*
  per request (the #1 anti-pattern).
- **Session (per run):** mount the source docs as file resources; kick off with
  a `user.define_outcome` carrying the same rubric as Phase 2 (a story is "done"
  when it validates + every anchor matches).
- **Bridge:** the agent writes story files into the sandbox; we pull them via
  `files.list({ scope_id, betas: [...] })` and drop them through the existing
  `writeStoryFiles()` so the canvas rebuilds exactly as today.
- **Heavier lift:** new env config, beta access, the full session-event client
  (stream-first, reconnect-with-consolidation, idle-gate on terminal
  `stop_reason`). Phases 1–2 stand up the auth + seam that make this tractable.

## Build order

1. **Phase 1** — stands up the Claude seam, `ANTHROPIC_API_KEY`, the CLAUDE.md
   carve-out, and the `pause_turn` loop, behind a `live` flag on research.
2. **Phase 2** — reuses the seam; turns `validate.ts` into a tool + rubric.
3. **Phase 3** — reuses everything; promotes the loop to a Managed Agent.

Each phase is independently shippable behind a per-run toggle, so the existing
gateway pipeline stays the default until each Claude path proves out.

## Open decisions

- **A. Package boundary** — a new `@vismay/claude-agent` package (cleaner reuse
  across admin + scripts) vs a `story-pipeline/src/claude/` subpath (less
  ceremony). Lean: subpath for Phase 1, extract to a package when Phase 3 needs it.
- **B. Citations model** — how much of Claude's web-search citation payload to
  surface in the story (footnotes? a sources section? frontmatter?). Needs a
  product call, not just plumbing.
- **C. Self-hosted vs cloud sandbox (Phase 3)** — cloud is simplest; self-hosted
  keeps source docs on our infra. Default cloud unless sourcing is sensitive.
- **D. Cost/latency** — agentic loops and `max`/`xhigh` effort cost more than the
  current one-shot calls. Keep the gateway path as the cheap default; make the
  Claude path opt-in per run (model picker already exists in `ComposePanel`).
