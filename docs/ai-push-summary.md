# Vizmaya AI Push — what shipped & what's left

Branch: `claude/canvas-ai-integration-plan`. This push turned the admin canvas
from a manual editor into an **AI authoring layer**: schema-accurate generation
for every slot and whole sections, a grounded Q&A assistant, in-editor selection
AI, a vision evaluator, and a feedback/eval loop — all on a single **Zod
schema-first** spine.

## The arc

Started from: *"where are the default system prompts stored? I want templates per
deck type."* Reframed to: *"the AI should know the exact YAML shape each slot
accepts."* It grew from there into the full authoring layer below.

---

## What shipped

### 1. Schema-aware generation (the foundation)
The AI knows the exact shape of every slot, derived from the **Zod module schema**
(the single source of truth behind validation + generation + docs).

- Every layer module is **schema-first**: a Zod `schema` with `.describe()` field
  docs that `parseConfig` delegates to (`parseWithSchema`). All 13 modules migrated.
- `describeLayerSchema()` walks a module's schema into exact-shape prompt text —
  used by the slot ✨ generate, the generate route, and the Q&A bot. (Superseded
  the earlier `adminForm`-derived path, now retired.)
- Slot + section generation is **constrained to the schema** (`generateObject`),
  so a generated layer can't fail to parse (`genSchema`, `slotGenSchema`).

Files: `packages/viz-engine/src/lib/{zodConfig,schemaDocs,genSchema}.ts`,
`apps/admin/components/vizmaya/canvas/{slotGenSchema,overrideSchemas,aiSlots}.ts`.

### 2. On-node ✨ Generate (per-slot)
A ✨ chip on every editable input node/junction opens a standalone PromptBar for
that slot; generation persists through the existing save path. Layer type is
recovered from the YAML when not passed.
Files: `canvas/CanvasClient.tsx` (`makeGenerateClick`, `promptOnly` editorTarget),
`canvas/PromptBar.tsx`.

### 3. Section generate (whole-section, with approval)
Generate a complete new section (markdown `##` + prose **and** its `config.yaml`
entry) from a brief, with a **generate → review → approve** flow (nothing is
written until "Apply section").
Files: `content-source/storySection.ts` (`appendStorySection` — the first
add-section primitive), `canvas/generate-section/route.ts`, `CanvasClient.tsx`.

### 4. Q&A platform assistant ("✨ Ask")
A chat assistant grounded in a knowledge pack: a platform overview **+ a schema
reference auto-generated from the live Zod schemas** (stays accurate as modules
change). Context-aware — it captures what you're looking at (active section,
focused node + value, selected text from window **and** Monaco) as removable
chips. Conversations are **persisted** (history). Cheap model (DeepSeek) since
it's grounded.
Files: `lib/{assistantKnowledge,assistantContext}.ts`,
`components/AssistantLauncher.tsx`, `api/vizmaya/assistant/{route,conversations}`.

### 5. In-editor selection AI
Select text in an editor → an AI actions overlay (`transform` route) and a
programmatic `openAssistant()` that opens Ask seeded with the selection. Wired
into EditorPanel + the standalone editors.
Files: `canvas/{SelectionAiOverlay,aiSelectionActions}.tsx`, `canvas/transform/route.ts`.

### 6. Evaluator (Feature 3 — vision critique loop)
"✦ Evaluate" screenshots the rendered section (headless Playwright), sends the
image + config to a **vision model**, and returns an **aspect-keyed critique**
(content/layout/theme/background/foreground/narration). Each critique routes back
to its slot via "Fix in ✨".
Files: `lib/canvasScreenshot.ts`, `canvas/evaluate/route.ts`,
`canvas/EvaluatorPanel.tsx`, gateway `generateText({ images })` (vision support).

### 7. Generation feedback / evals
Thumbs up/down on AI generations + a refine loop on section-gen, accumulating a
quality corpus.
Files: `canvas/GenerationFeedback.tsx`, `api/.../generation-feedback`,
`ai-gateway/cache.ts` (`recordFeedback`).

### 8. AI gateway
`generateText` gained **vision** (`images`) and structured output (`schema`);
model registry refreshed with cheaper aliases (DeepSeek, Seedream image).
Files: `packages/ai-gateway/src/{text,models,cache,index}.ts`.

---

## Infra / migrations
- `043_ai_generations.sql` — generation audit (pre-existing, used throughout)
- `051_ai_generation_feedback.sql` — feedback rows
- `051_assistant_conversations.sql` — assistant_conversations + assistant_messages
- `zod` added to `viz-engine` deps (build fix / relock)

## API routes (admin)
`canvas/generate` · `canvas/generate-section` · `canvas/evaluate` ·
`canvas/transform` · `assistant` · `assistant/conversations` ·
`stories/[slug]/generation-feedback` · `assets/generate`

---

## What's left / open items

### Verification (none of the live LLM/browser flows have been smoke-tested)
The code typechecks and `next build` passes, but these runtime paths haven't been
exercised against real models/infra:
- **Evaluator**: the Playwright screenshot of the signed canvas-frame URL +
  readiness timing (currently `networkidle` + a settle delay — see evaluator plan
  decision C), and the vision critique quality.
- **Section generate / slot generate**: real model output parsing under the new
  constrained-schema path.
- **Q&A + selection AI**: live answers, the selection→overlay→transform flow.
- Suggested: a pass with the app running + `AI_GATEWAY_API_KEY` set.

### Polish / smaller follow-ups
- **Two ✨ Ask buttons** (global admin header + canvas header) — dedupe if redundant.
- **Evaluator "Apply suggestedValue"** — v1 only routes to "Fix in ✨" (re-prompt);
  a direct one-click apply of `suggestedValue` is a natural add.
- **Evaluator readiness signal** — replace the settle-delay with a real
  "fully rendered" hook (Mapbox tiles, charts) for reliable screenshots.
- **Override-slot schemas** (foreground/background/theme/defaults/share/slides/
  report/map/shareMap) are still hand-authored in `overrideSchemas.ts` — they have
  no module Zod schema. Fine, but they don't share the schema-first guarantee.
- **PromptBar `initialPrompt`** — prefill the suggested fix when routing from the
  evaluator (currently opens the bar empty; the suggestion is shown to copy).

### Known caveat
- Commit `2a324fa` is a transiently-broken intermediate (deletes `schemaPrompt.ts`
  before the repoint in `33e48a5`). The **branch tip is green**; just don't bisect
  onto that one commit. Squashing the pair would clean it up (needs a force-push).

### Larger, not started
- **Build-time prompt resolver** — turn YAML `prompt:` fields into cached
  generations at build (mentioned in `apps/admin/CLAUDE.md` as planned).
- **Evaluator scoring** (Feature 2, deferred) — a `scores` block on the critique
  schema + readout, display-only.

---

## Reference docs
Plans written during the push (under `docs/`): `canvas-schema-aware-prompts-plan`,
`canvas-evaluator-plan`, `qa-platform-bot-plan`, `section-generate-plan`,
`assistant-context-plan`, plus the original `canvas-ai-integration-plan`.
