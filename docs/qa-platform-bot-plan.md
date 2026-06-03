# Plan: Q&A platform bot (author help assistant)

**Status: plan-only. No code yet.**

## Goal

A chat assistant in admin where authors ask how the platform works — "how do I
add a map layer?", "what does `deltaColor` accept?", "how do share overrides
work?", "what's the difference between a deck and a map story?" — and get answers
**grounded in this platform's docs + live slot schemas**, not generic LLM
guesswork. Read-only Q&A for v1 (it explains; it doesn't act on the story).

## Why grounding matters here

The accurate, non-hallucinating answers come from two sources that already exist:

1. **Curated docs** — a hand-picked subset of `docs/` + app READMEs, not the whole
   folder. Relevant: [deck-format-spec.md](../apps/vizmaya-fyi/docs/deck-format-spec.md),
   the canvas plan docs, [apps/admin/CLAUDE.md](../apps/admin/CLAUDE.md),
   [packages/ai-gateway/README.md](../packages/ai-gateway/README.md). Exclude the
   432 KB `render-templates.md` and internal migration plans.
2. **Live slot schemas** — the same source of truth the ✨ feature uses. A schema
   reference auto-generated from every layer module (`buildLayerSchemaPrompt`) +
   the override-slot schemas (`overrideSchemas.ts`) + theme/defaults. Because it's
   generated from the modules, it stays correct as the platform evolves — the bot
   never drifts from the real fields/enums.

## Architecture

```
Author question (+ chat history)
        │
        ▼
POST /api/vizmaya/assistant   { messages: [{role, content}] }
        │  system = KNOWLEDGE_PACK  (curated docs + generated schema reference)
        ▼
@vismay/ai-gateway  generateText (or streamText — see decision A)
        │  model: a strong text alias (text.claude / text.pro)
        ▼
answer (markdown), with "based on <doc/schema>" attribution
        │
        ▼
AssistantPanel (admin) — message list + input, opens from a global "Ask" affordance
```

### Knowledge pack assembly

A request-time (or cached) builder `buildKnowledgePack()`:
- concatenates the curated doc set (read from disk at build, or inlined),
- appends a **generated schema reference**: loop `allRegisteredTypes()` →
  `buildLayerSchemaPrompt(type)` for every layer, plus each override-slot schema,
  plus the theme/defaults shapes — a compact "here's every slot and its fields"
  section.
- caps total size; if it outgrows the context window later, switch to retrieval
  (embed the chunks, top-k by question) — but v1 stuffs the pack into `system`.

The schema half reuses what's already built; only the doc-curation list is new.

## Pieces

**New:**
- `app/api/vizmaya/assistant/route.ts` — multi-turn chat endpoint (auth-gated like
  the other admin routes). Builds the knowledge pack, calls the gateway, returns
  the answer. Audits via `recordGeneration` (kind `'text'`, feature `assistant`).
- `components/vizmaya/AssistantPanel.tsx` — chat drawer (message list, input,
  loading state). Markdown-renders answers.
- `lib/assistantKnowledge.ts` — `buildKnowledgePack()` (docs + generated schema
  reference).
- Maybe `streamText` in `@vismay/ai-gateway` (decision A).

**Reuse:** `@vismay/ai-gateway` `generateText`, the schema builders
(`buildLayerSchemaPrompt`, `overrideSchemas`), the admin auth + audit plumbing.

## Build order

1. `buildKnowledgePack()` + the assistant route (non-streaming `generateText`) —
   testable with curl before any UI.
2. `AssistantPanel` + a global "Ask" entry point in admin chrome.
3. (Optional) streaming for a live-typing feel.

## Open decisions

- **A. Streaming** — the gateway has no `streamText` yet. v1 can be a single
  non-streaming `generateText` call (simplest); add streaming later for UX. Adding
  it means a thin `streamText` wrapper in the gateway (the `ai` SDK supports it).
- **B. Where the "Ask" button lives** — global admin header (available everywhere)
  vs scoped to the canvas. Recommend global.
- **C. Answer-only vs actionable** — v1 answers questions only. A later version
  could let the bot *do* things ("add a bigStat to this section") by emitting a
  tool call into the existing slot save path — explicitly out of scope for v1.
- **D. Retrieval vs stuffing** — start by stuffing the pack into `system`. Move to
  embeddings/top-k only if the pack exceeds a comfortable token budget.
