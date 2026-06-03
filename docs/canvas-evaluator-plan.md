# Plan: Evaluator node for the Vizmaya Canvas (Feature 3)

**Status: plan-only. No code yet.**

## Goal

An **Evaluator node** fed by the Frame render that screenshots the rendered
section, sends the image + section config to a vision LLM with a **structured,
aspect-keyed critique schema**, and routes each critique back to the matching
input slot so the author can **Apply** a suggested value or **Send to prompt**
(prefill that slot's ✨ PromptBar). This is the "evaluate → break down → route to
the respective inputs" loop from
[canvas-ai-integration-plan.md](canvas-ai-integration-plan.md) Feature 3.

It builds directly on what now exists: schema-aware prompts, the slot save path
(`handleSave`/`mergeSlice`/`saveSlice`), and the on-node ✨ `promptOnly` PromptBar.

## Build order (user priority 1 > 3 > 2)

1. **critique → route** (the loop), 2. lean on the judge pattern for the
structured call, 3. **scoring last** (display-only, deferred = Feature 2).

---

## What exists to reuse (verified)

| Need | Reuse | Ref |
|---|---|---|
| Structured-output call | `generateText({ schema })` — Zod, routes to `aiGenerateObject` | [ai-gateway/src/text.ts:38-77](../packages/ai-gateway/src/text.ts) |
| Judge pattern (schema + 429 backoff) | `createJudge` shape — adapt, but call through the gateway, not `@google/genai` | [packages/eval-entities/src/judge.ts](../packages/eval-entities/src/judge.ts) |
| Headless single-section render | `/story/[slug]/canvas-frame/[id]` (no chrome, one section) | canvasOutputs.ts |
| Server screenshot | Playwright (already a prod dep) — PDF render does `page.pdf()`; we add `page.screenshot()` | [apps/vizmaya-fyi/lib/storyPdfRender.ts](../apps/vizmaya-fyi/lib/storyPdfRender.ts) |
| Per-aspect prefilled prompt | ✨ `promptOnly` editorTarget + `makeGenerateClick(kind)` | CanvasClient.tsx (Feature 1) |
| Slot persistence | `handleSave` / `mergeSlice` / `saveSlice` | CanvasClient.tsx:2332 |
| Aspect taxonomy | `EditableKind` = the critique `aspect` keys | canvasEditing.ts:31-70 |

**Two real gaps:** the gateway can't take an image, and there's no screenshot
route. Both are foundational — step 1.

---

## Architecture

```
FrameNode.render ──► EvaluatorNode (new)
                        │ 1. POST /canvas/evaluate { slug, sectionId, config }
                        ▼
            evaluate route (admin)
              ├─ screenshot: render /story/<slug>/canvas-frame/<id> → PNG  (Playwright)
              ├─ generateText({ model: vision, images: [png], schema: CRITIQUE })
              └─ returns { critiques: [{ aspect, issue, suggestedPrompt, suggestedValue? }], notes }
                        │
                        ▼
            Evaluator panel (right-side region, like the ✨ host)
              per critique row:
                • Apply      → handleSave(suggestedValue) for that aspect's slot
                • Send to ✨  → makeGenerateClick(aspect) + prefill PromptBar with suggestedPrompt
```

### Critique schema (Zod, in the evaluate route)

```ts
const Critique = z.object({
  aspect: z.enum([                 // = EditableKind subset the evaluator can act on
    'content','layout','theme','background','foreground','narration',
  ]),
  severity: z.enum(['low','medium','high']),
  issue: z.string(),               // what's wrong, grounded in the screenshot
  suggestedPrompt: z.string(),     // ready to drop into that slot's ✨ PromptBar
  suggestedValue: z.string().optional(), // slot-shaped YAML/text, if confident
})
const EvalResult = z.object({
  critiques: z.array(Critique),
  notes: z.string(),               // overall read
  // scores: {...}  ← Feature 2, added last
})
```

`aspect` maps 1:1 to the slot the critique routes to. `suggestedValue`, when
present, must pass the slot's parse before Apply enables (reuse the route's
existing YAML-validity check).

---

## Step 1 — Foundations (gateway vision + screenshot route)

**1a. Extend `@vismay/ai-gateway` `generateText` to accept images.**
Add `images?: Array<{ data: string; mimeType: string }>` (base64 / data-URL) to
`GenerateTextOptions`. When present, build a multimodal `messages` array (the
Vercel `ai` SDK supports `{ type: 'image' }` content parts) instead of a bare
`prompt` string. Keep the schema path. Add a vision-capable alias to
`MODELS.text` (Gemini 3 flash/pro accept image input) — e.g. `text.vision`.
*Honors the repo rule: extend the gateway, don't import a provider SDK.*

**1b. Screenshot route — lives in `admin`.** Resolved: `apps/admin` already has
Playwright *and* existing screenshot routes ([story-pdf](../apps/admin/app/api/story-pdf),
[render-share](../apps/admin/app/api/vizmaya/social/posts/[id]/render-share)) that
screenshot the **signed `canvas-frame` URL** (`signedSrcById`), which points at
whichever story app renders that story. The structure is now multi-app
(`vizmaya-fyi`/`footshorts`/`vizf1`/`catalog` + shared `story-reader`/`story-embed`),
so we do NOT hardcode vizmaya-fyi. Add an admin screenshot route mirroring
`render-share`: `page.screenshot({ type: 'png' })` against the signed canvas-frame
URL for the active section, waiting on the canvas-frame readiness signal. App-
agnostic, no cross-app call.

## Step 2 — Evaluate route + structured critique

New `app/api/vizmaya/stories/[slug]/canvas/evaluate/route.ts`:
- input: `{ sectionId, config, format? }`
- fetch the screenshot (step 1b), call `generateText({ model: 'text.vision',
  images: [png], system: <critique instructions>, prompt: <section config as
  context>, schema: EvalResult })`
- adapt the judge's 429/backoff handling (the gateway may already retry; confirm)
- audit row via `recordGeneration` like the generate route
- return the validated `EvalResult`

## Step 3 — EvaluatorNode + panel (the loop)

- **EvaluatorNode**: a new Rete node class (alongside Frame/Output) with one
  `render` input wired from `FrameNode.render`; a control with an "Evaluate"
  button. Add it to the graph-construction IIFE and wire `frame.render →
  evaluator.render`.
- **Evaluator panel**: reuse the right-side region pattern from the ✨ host.
  Lists `critiques`; each row shows aspect + issue + severity and two actions:
  - **Apply** (enabled only when `suggestedValue` parses): `handleSave` against
    an `editorTarget` built from `{ kind: aspect, unit: activeUnit }`.
  - **Send to ✨**: open the `promptOnly` PromptBar for `aspect` (via
    `makeGenerateClick`) **prefilled** with `suggestedPrompt` — needs one new
    PromptBar prop `initialPrompt?: string`.
- Group-awareness caveat: only the active section's nodes are mounted, and
  collapsed override groups are unmounted. v1 routes to **frame-input aspects**
  (content/layout/theme/background/foreground/narration) which are always present
  for the active section — sidestepping the unmounted-group problem. Override-slot
  critiques (share/slides/report) come later.

## Step 4 — Scoring (Feature 2, last)

Add a `scores` block to `EvalResult` (clarity, legibility, onBrand…) and a small
readout on the EvaluatorNode. Display-only, no routing.

---

## Open decisions

- **A. Screenshot app** — vizmaya-fyi route (recommended, reuses Playwright +
  canvas-frame page) vs Playwright in admin. Cross-app call needs the same admin
  auth/secret the other internal calls use.
- **B. Vision model** — confirm which `MODELS.text` alias reliably accepts image
  input + returns schema-constrained JSON (Gemini 3 pro/flash). May need a
  dedicated `text.vision` alias.
- **C. Readiness signal** — does `/canvas-frame/[id]` expose a "fully rendered"
  hook (Mapbox tiles, charts settled) like the PDF path's `__pdfReady__`? If not,
  add one so screenshots aren't captured mid-paint.
- **D. Trigger** — manual "Evaluate" button (recommended v1) vs auto-evaluate on
  render. Auto is costly (a vision call per edit); start manual.
