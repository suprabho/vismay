# Plan: AI prompt + evaluators across the Vizmaya Canvas

## Context

The Vizmaya canvas (`apps/admin/components/vizmaya/canvas`, a Rete v2 graph) today
is a **declarative dependency graph**: left-side `DataNode` "input nodes" feed a
central `FrameNode`, which feeds right-side `OutputNode`s (Share/Slides/Report/Autoplay).
Editing is manual — click a node → an edit panel opens → save → the slice is
spliced back into `config.yaml` / override files → iframes reload.

The only AI in admin today is **prompt-to-image** in the Assets tab
(`GenerateImagePanel.tsx` → `assets/generate/route.ts` → `@vismay/ai-gateway`).
There is **no Vercel v0 integration and none is wanted** — "v0" here means "use
ai-gateway". This plan adds three capabilities, decisions confirmed with the user:

1. **Prompt input on every input node** — generate the node's value from a prompt,
   with a *context-appropriate* model picker (image models for image layers, text
   models for text/YAML slots).
2. **Evaluator nodes** wired to the Frame + Output nodes that critique the rendered
   result, break the critique down per-aspect, and route each piece to the matching
   input node. (Build order the user gave for the evaluator's job: **critique→route
   first**, then **reuse the eval-entities judge pattern**, then rubric **scoring** last.)
3. **Prompt input inside every edit panel** (EditorPanel, SlotInspector,
   ThemeEditOverlay, ImageEditModal).

Outcome: an author can sit on the canvas, prompt any input into existence, render,
ask an evaluator "what's wrong", and accept targeted AI fixes back into the exact
inputs that need them — all through the **existing save/merge plumbing** so nothing
about persistence or rendering changes.

**This document is plan-only. No code is to be written yet.**

---

## Key existing pieces to reuse (do NOT reinvent)

| Need | Reuse |
|---|---|
| Text/image generation | `@vismay/ai-gateway`: `generateText({model, prompt, system, schema})`, `generateImage(...)`, `resolveModel`, `recordGeneration`, `hashRequest` |
| Model registry | `packages/ai-gateway/src/models.ts` — `MODELS.text` (`fast/pro/claude/proPlus`), `MODELS.image` (`default/imagen/...`) |
| Prompt-UI reference | `apps/admin/components/vizmaya/GenerateImagePanel.tsx` (textarea + option chips + Generate + status, persists prompt) |
| Server route reference | `apps/admin/app/api/vizmaya/stories/[slug]/assets/generate/route.ts` (auth → validate → gateway → store → audit) |
| Slot identity | `canvasSlotEditing.ts`: `SlotDescriptor`, `SlotPath`, `getSection`, `getLayer`, `replaceLayer`, `replaceTheme` |
| Override/section slices | `canvasEditing.ts`: `EditableKind` (share/slides/report/map/shareMap/narration/content/layout/background/defaults/foreground/region/layer + theme), `buildEditableSlice`, `mergeSlice`, `saveSlice` |
| Save endpoints | `saveConfigYaml`, `saveMarkdown` (PUT `/api/vizmaya/stories/<slug>`); `dataNonce` bump → iframe reload |
| Structured-LLM pattern | `packages/eval-entities/src/judge.ts` (Zod schema, structured output, 429 retry/backoff) |

The crucial insight: **a generated value and an evaluator suggestion both terminate
in the same place a manual edit does** — `mergeSlice`/`replaceLayer`/`replaceTheme`
+ `saveSlice`/`saveConfigYaml`/`saveMarkdown`. "Route to the respective input node"
== "call that node's existing apply path". This keeps the surface area small.

---

## Architecture — shared core (build once, used by all three features)

### A. Slot → generation-context map  (new: `canvas/aiSlots.ts`)
A single source of truth mapping each `EditableKind` / layer `type` to:
- **modality**: `'text' | 'image'`
- **allowed model aliases** (the context-appropriate subset), e.g.
  - image layers → `image.default`, `image.imagen`, `image.imagenFast`
  - `content` / `narration` → `text.claude`, `text.pro` (prose register)
  - YAML slots (`layout`/`theme`/`background`/`foreground`/`region`/`share`/…) → `text.pro`, `text.proPlus`, `text.fast`
- **output schema**: a Zod schema so text generation returns *valid* YAML/markdown
  for that slot (e.g. a layer object, a theme object, a layout name) — not freeform
  prose that breaks the config. Reuses the `generateText({schema})` structured path.
- **system prompt**: slot-specific instruction (e.g. "You output a single Vizmaya
  background map layer as YAML matching this shape…").

### B. Generation API route  (new: `app/api/vizmaya/stories/[slug]/canvas/generate/route.ts`)
Mirrors `assets/generate/route.ts`. Body: `{ kind, slotPath?, layerType?, prompt, system?, model }`
(`system` overrides the slot default when the author edits it; otherwise the route falls
back to the slot's default system prompt from `aiSlots.ts`).
- Auth (`isAuthed`), slug/prompt validation, `resolveModel`.
- modality `text` → `generateText` with the slot's schema+system → returns the
  generated value (string/object). modality `image` → `generateImage` → upload to
  `story-assets` (reuse asset route helpers) → return an `assetRef`.
- `recordGeneration(kind: 'text' | 'image', …)` for audit (table already supports
  `'text'` per `apps/admin/CLAUDE.md`).
- **Server returns the candidate value only**; it does NOT persist to config — the
  client applies via the existing slot path so undo/preview semantics match manual edits.

### C. `<PromptBar>` component  (new: `canvas/PromptBar.tsx`)
The reusable "prompt input". Generalizes `GenerateImagePanel`:
- Props: `slug`, generation context (`kind`/`slotPath`/`layerType`), `allowedModels`,
  `currentValue`, `defaultSystemPrompt`, `onApply(value)`, optional `aspectRatio` (image slots).
- Renders: a **system-prompt field pre-filled with the slot's default system prompt**
  (collapsible, editable — see below) + the user-prompt textarea + **model dropdown
  limited to the slot's allowed aliases** + (image only) aspect chips + Generate +
  status line (model used, errors).
- On Generate → POST to route B (passing both the system prompt and user prompt) →
  on success call `onApply(value)`.
This single component is the "prompt input" for BOTH Feature 1 (nodes) and Feature 3 (panels).

### C.1 Default system prompts per panel/slot
Every slot has a **default system prompt** defined once in `aiSlots.ts` (the `system`
field of the slot→context map, A). The `<PromptBar>` always loads that default into a
visible, editable system-prompt field, so **all edit panels open with a working default
system prompt** the author can tweak per-generation (e.g. content panel → an editorial
prose instruction; theme panel → "emit a Vizmaya theme object…"; layout panel → "choose
one valid layout name…"). Defaults live in code, not per-story state, so they stay in
sync with the slot schemas; an author's edits apply to that generation only (not persisted),
keeping behavior predictable. This is the single mechanism that satisfies "all edit panels
should have a default system prompt as well."

---

## Feature 1 — Prompt input on ALL input nodes

- Extend `InputNodeData` (`InputNode.tsx`) so every clickable `DataNode` exposes its
  generation context (it already carries `slot?: SlotDescriptor`; add the resolved
  `EditableKind` where the node isn't slot-based, e.g. content/layout/narration —
  these already map to `EditableKind`s in `canvasInputs.ts`).
- Add a small **✨ affordance** on the node. Clicking it opens `<PromptBar>` for that
  slot (recommended: in the existing right-side panel area used by the editors, to
  avoid Rete-node layout churn — see Open Decision 1).
- On apply: build the slice via `buildEditableSlice` if needed, run `mergeSlice`/
  `replaceLayer`/`replaceTheme`, persist via `saveSlice`/`saveConfigYaml`/`saveMarkdown`,
  bump `dataNonce`. Identical to a manual save.
- Coverage = every `EditableKind` + theme + image/map layers. The slot→context map (A)
  makes this table-driven rather than per-node bespoke code.

## Feature 3 — Evaluators wired to Frame + Output (PRIORITY after core)

- **New Rete node type `EvaluatorNode`** (`CanvasClient.tsx`, alongside Frame/Output/
  Data/Junction/GroupHeader node classes ~lines 772–864; new component file
  `canvas/EvaluatorNode.tsx`). Input socket(s): `render` from `FrameNode` (and
  optionally a chosen `OutputNode`). Wire connections in the graph-construction IIFE.
- **Evaluate API route** (new: `app/api/vizmaya/stories/[slug]/canvas/evaluate/route.ts`):
  takes the section config + a **screenshot of the rendered frame** (see Open Decision 2)
  + the format being evaluated → `generateText` with a **structured critique schema**
  built on the `eval-entities/judge.ts` pattern (structured output + 429 retry/backoff).
- **Critique schema is keyed by aspect** = the `EditableKind` taxonomy:
  `{ aspect: 'content'|'layout'|'theme'|'background'|'foreground'|'narration'|…,
     issue: string, suggestedPrompt: string, suggestedValue?: <slot-shaped> }[]`
  plus an overall `notes` field.
- **Break down + route**: each critique entry is dispatched to the input node whose
  `EditableKind` matches `aspect`. On that node, surface a **suggestion badge**; the
  author can (a) **Apply** `suggestedValue` directly through the slot save path, or
  (b) **Send to prompt** — prefill that node's `<PromptBar>` with `suggestedPrompt`
  and let Feature 1 regenerate. This is the "evaluation → broken down → respective
  input nodes" loop, reusing Feature 1's apply path end-to-end.
- Build order within this feature (user's priority **1 > 3 > 2**):
  1. critique→route (above), 3. lean on the eval-entities judge pattern for the
  structured call, 2. add rubric **scoring** fields to the schema *last* (a `scores`
  block; non-blocking, display-only).

## Feature 2 (scoring) — deferred
Add `scores: {clarity, legibility, onBrand, …}` to the evaluator schema and a small
score readout on the EvaluatorNode. No routing. Lowest priority per the user.

## Prompt input in ALL edit panels (the panel half of the request)
Embed `<PromptBar>` (component C) into each panel, scoped to that panel's slot. Each
panel passes the slot's `defaultSystemPrompt` (from `aiSlots.ts`) so **every panel opens
with an editable default system prompt** (per C.1):
- `EditorPanel.tsx` — above the Monaco editor; `onApply` sets editor text (YAML/markdown/plaintext slots).
- `SlotInspector.tsx` — in the CONTENT section, for `adminForm` layers; `onApply` patches the form value.
- `ThemeEditOverlay.tsx` — `onApply` sets the theme object.
- `ImageEditModal.tsx` — wraps image generation (route B, image modality) and selects the resulting asset.

---

## Files

**New:** `canvas/aiSlots.ts` (slot→context/model/schema/system map), `canvas/PromptBar.tsx`,
`canvas/EvaluatorNode.tsx`, `app/api/vizmaya/stories/[slug]/canvas/generate/route.ts`,
`app/api/vizmaya/stories/[slug]/canvas/evaluate/route.ts`, an evaluator critique
Zod schema module (co-located with the evaluate route or in `aiSlots.ts`).

**Modify:** `InputNode.tsx` (context + ✨ affordance), `CanvasClient.tsx` (register
EvaluatorNode, wire edges from Frame/Output, suggestion-badge state, PromptBar host),
`EditorPanel.tsx`, `SlotInspector.tsx`, `ThemeEditOverlay.tsx`, `ImageEditModal.tsx`
(embed PromptBar). Possibly `canvasInputs.ts` (attach `EditableKind` to node data).

**Reuse unchanged:** `canvasSlotEditing.ts`, `canvasEditing.ts`, `@vismay/ai-gateway`,
asset upload helpers from `assets/generate/route.ts`.

---

## Open decisions to resolve at build time
1. **Where the node PromptBar renders** — recommended: reuse the right-side panel
   region (no Rete node-size changes) vs. an on-node popover. (Recommend side panel.)
2. **Evaluator screenshot capture** — the canvas-frame iframe is same-origin. Options:
   (a) `html2canvas`/`getDisplayMedia` client-side, (b) a server screenshot route
   (Playwright/`@vercel/og`-style) rendering the published `/<slug>` frame. Recommend
   starting with a server-side screenshot of the existing canvas-frame URL for fidelity.
3. **Structured-YAML safety** — rely on `generateText({schema})` + a YAML re-serialize
   pass before applying; reject/flag if the candidate fails the slot's parse.

## Verification
- `pnpm --filter admin typecheck && pnpm --filter admin lint`.
- Manual, in admin canvas for a test story:
  1. Click ✨ on a content node → prompt → Generate → frame iframe updates after save.
  2. Repeat for an image layer (image models offered), a theme node, a YAML override.
  3. Confirm each edit panel shows the PromptBar and Apply writes through.
  4. Run an EvaluatorNode → confirm per-aspect suggestions land on the matching nodes →
     Apply one and confirm it persists + re-renders; Send-to-prompt prefills the bar.
  5. Check `ai_generations` rows are written (audit) for both text and image kinds.
