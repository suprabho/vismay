# Plan: schema-aware AI system prompts for the Vizmaya Canvas

**Status: implemented (steps 1–5).** Layer slots derive their prompt from the
module `adminForm` (+ `aiFieldExamples` for nested fields, `aiSchema` for
chart/map); override slots use hand-authored schemas in `overrideSchemas.ts`;
`buildSlotSchemaPrompt` is the single entry point for the PromptBar + route,
and the PromptBar recovers a missing layer type from the YAML being edited.
The "layer-type picker UI" (original step 5) was dropped as unnecessary — the
type is always known upstream or recoverable from content.

## Goal

Today every generation through the canvas PromptBar uses one of ~15 fixed
`defaultSystem` strings keyed only on slot *kind*
([`aiSlots.ts`](../apps/admin/components/vizmaya/canvas/aiSlots.ts) `SLOTS`).
For the `layer` slot that string is deliberately vague —
*"author one layer's fields as YAML (e.g. a map: …, or a chart: …)"* — because a
single prompt cannot describe the 13 distinct layer shapes. The model guesses the
field names, so it emits YAML that fails `parseConfig`.

**Objective (confirmed):** the system prompt should carry the *exact YAML shape*
the targeted slot accepts. Decisions confirmed with the user:

1. **Source** — derive the shape from each `VizModule`'s `adminForm()` + `type`/
   `label`, so the prompt can never drift from the renderer/validator. (Gaps —
   see §4 — get a small co-located supplement.)
2. **Scope** — cover all 13 layer types **and** the 9 structured override slots
   (`foreground`, `background`, `share`, `slides`, `report`, `map`, `shareMap`,
   `theme`, `defaults`).
3. **Selection** — author picks the target layer type in the PromptBar; the
   derived schema prompt **fully replaces** the generic `layer` default.

Outcome: an author opening the PromptBar on a `bigStat` layer sees a system prompt
that lists `value` (required), `unit?`, `label?`, `delta?`, `color?`, `deltaColor?`,
`align?` with their enums, plus a worked YAML example — and the model emits YAML that
parses on the first try.

---

## 1. Existing pieces to reuse (do NOT reinvent)

| Need | Reuse |
|---|---|
| Per-layer field schema | `VizModule.adminForm(config)` → `AdminFormField[]` ([types.ts:135-142](../packages/viz-engine/src/types.ts#L135-L142)) — already drives the inspector form |
| Enumerate / fetch a module | `getVizModule(type)`, `listModulesForSlot(slot)`, `allRegisteredTypes()` ([registry.ts:49-59](../packages/viz-engine/src/registry.ts#L49-L59)). Lazy-safe: reading `type`/`label`/`adminForm`/`slots` does **not** trigger the module's `load: () => import('./Component')` |
| Validator (ground truth) | each module's `parseConfig` — the prompt schema must mirror it |
| Slot → modality/models/label | `aiSlotConfig(kind, layerType)` ([aiSlots.ts:252-258](../apps/admin/components/vizmaya/canvas/aiSlots.ts#L252-L258)) stays the spine |
| Generation | `@vismay/ai-gateway` `generateText`/`generateImage`, already called by [generate/route.ts](../apps/admin/app/api/vizmaya/stories/[slug]/canvas/generate/route.ts) |
| System-prompt resolution | route.ts priority `body.system → config.defaultSystem`; we extend to a 3rd level |

`apps/admin` already imports `@vismay/viz-engine` (e.g. `SlotInspector.tsx` imports
`getVizModule`), so no new dependency.

---

## 2. Architecture

Add one pure builder that turns a module (or override-slot descriptor) into a
system-prompt string, and let both the client and the route call it so they stay in
lockstep — exactly the pattern `aiSlotConfig` already establishes.

```
@vismay/viz-engine  ──► adminForm() / type / label   (source of truth, already exists)
        │
        ▼
buildSchemaPrompt(kind, layerType)   ◄── NEW pure fn, in viz-engine or aiSlots.ts
        │   • layer slot  → derive from getVizModule(layerType).adminForm()
        │   • override slot → derive from a co-located schema descriptor (§4)
        ▼
   schema-aware system prompt string  (field list + enums + worked YAML example)
        │
   ┌────┴────────────────────────┐
   ▼                             ▼
PromptBar.tsx                generate/route.ts
 seeds textarea               final system = body.system
 (now schema-aware)             ?? buildSchemaPrompt(...)   ← was config.defaultSystem
                                ?? config.defaultSystem
```

### The builder

```ts
// new: packages/viz-engine/src/lib/schemaPrompt.ts  (or aiSlots.ts-adjacent in admin)
export function buildLayerSchemaPrompt(layerType: string): string | null
export function buildSlotSchemaPrompt(kind: AiSlotKind, layerType?: string): string | null
```

`buildLayerSchemaPrompt` calls `getVizModule(layerType)`, walks `adminForm(null)`,
and renders each `AdminFormField` to a documented line:

| AdminFormField kind | Rendered as |
|---|---|
| `text` | `key: string` (`+ " (required)"` if `required`; placeholder → example) |
| `number` | `key: number` (+ min/max/step if present) |
| `boolean` | `key: true \| false` |
| `select` | `key: 'a' \| 'b' \| 'c'` (from `options[].value`) |
| `theme-token` | `key: <theme token>` (+ the known StatColor/DeltaColor set) |
| `asset` | `key: assets://… \| https://… \| /public path` (+ `accept`) |
| `json` | the field name + a **hand-written nested example** (see §4) |

Then it appends a complete, parseable YAML example for that layer type, plus the
shared `RAW_TEXT_RULE` ("output ONLY raw YAML, no fences…"). The `type:` field is
always emitted explicitly since `adminForm` omits it (it's the discriminant).

Living next to the modules means a new field in `adminForm` shows up in the prompt
automatically — no second place to update.

---

## 3. Wiring changes (small)

1. **`generate/route.ts`** — change one line. Replace
   `const system = body.system?.trim() || config.defaultSystem` with a 3-level
   fallback: `body.system → buildSlotSchemaPrompt(kind, layerType) → config.defaultSystem`.
   The `config.defaultSystem` stays as the backstop for any slot the builder can't
   describe yet, so nothing regresses.
2. **`PromptBar.tsx`** — seed the textarea from the same builder
   ([line 65-70](../apps/admin/components/vizmaya/canvas/PromptBar.tsx#L65-L70)),
   so the author *sees* the schema and can still tweak it. No prop changes for the
   common path — `kind`/`layerType` already arrive.
3. **Layer-type picker** — when the slot is `layer` and the author is *creating*
   (not editing an existing typed layer), expose a dropdown of
   `listModulesForSlot('foreground')` so they choose the target shape; that choice
   sets `layerType` and re-derives the prompt. When *editing* an existing layer,
   `layerType` is already known (traced: layer's on-disk `type` → `SlotInspector`
   `layerType` prop → PromptBar), so the picker is pre-filled/hidden.

No persistence, merge, or render changes — this only swaps which string is fed to
the model.

---

## 4. Gaps adminForm can't cover (must be handled, not ignored)

`adminForm()` is not total. Three gap classes, with the chosen treatment:

| Gap | Modules | Treatment |
|---|---|---|
| **No `adminForm` at all** | `chart`, `map` | Add a co-located `aiSchema` export (or minimal hand-written prompt snippet) on those two modules. `chart` is `{ type, id }` + a note that `id` references a registered chart; `map` is the camera block (`center [lng,lat]`, `zoom`, `pitch?`, `bearing?`, `pins?`, `regions?`, `heatmap?`, `textLabels?`). |
| **`json` nested fields** | `bodyText` (content), `imageGrid` (items), `keyValue` (items), `rive` (viewModel/stepInput/capture), `table` (columns/rows), `text` (content) | The builder renders the primitive fields from `adminForm`; for each `json` key the module exports a `promptExample` snippet (the nested shape as YAML). This is the one hand-written-but-co-located piece. |
| **Override slots — no module, no machine schema** | `foreground`, `background`, `share`, `slides`, `report`, `map`, `shareMap`, `theme`, `defaults` | These are plain TS interfaces in [storyConfig.types.ts](../packages/viz-engine/src/lib/storyConfig.types.ts) and [types/story.ts](../packages/viz-engine/src/types/story.ts) — no zod/JSON-schema to derive from. Author one schema descriptor each (field list + worked example), co-located with the types, consumed by `buildSlotSchemaPrompt`. `foreground`/`background`/`region` additionally reference the layer schemas, so they compose the per-layer builders. |

This is why the honest source model is **"derive from `adminForm` where it exists,
co-located hand-written supplement where it doesn't"** — not pure derivation. The
single-source-of-truth guarantee holds for the 7 primitive-only modules
(bigStat, embed, image, quote, video + the primitive fields of the json ones); the
rest get a supplement that lives next to the code it describes so it can't drift far.

---

## 5. Build order

1. **Builder + the 7 clean modules** — `buildLayerSchemaPrompt` over `adminForm`,
   wire the 3-level fallback in `route.ts`, seed the PromptBar. Validate on
   `bigStat` end-to-end (the screenshot case). Lowest risk, proves the spine.
2. **`json`-field modules** — add `promptExample` snippets to bodyText, imageGrid,
   keyValue, table, text; rive last (deepest nesting).
3. **chart + map** — co-located `aiSchema` for the two formless modules.
4. **Override slots** — schema descriptors for foreground/background/region (compose
   the layer builders), then theme/defaults, then the export overrides
   (share/slides/report/map/shareMap).
5. **Layer-type picker UI** in the PromptBar for the create-new path.

Each step is independently shippable; `config.defaultSystem` remains the backstop
the whole way, so partial coverage never breaks generation.

---

## 6. Open questions

- **Builder home** — `packages/viz-engine` (closest to the schemas, importable by
  both admin client + route) vs `apps/admin/.../canvas` (keeps prompt-wording an
  admin concern). Leaning viz-engine for the layer builder (co-located with
  `adminForm`), admin for the override-slot wording.
- **Token budget** — full schemas for the big modules (map, table, rive) are long.
  Cap with a "fields beyond these are advanced — omit unless asked" line, or trim
  the example to the common fields.
- **`introspect`/chart ids** — should the chart prompt enumerate the actual
  registered chart ids for the current story, or stay generic? Enumerating needs
  story context in the route.
