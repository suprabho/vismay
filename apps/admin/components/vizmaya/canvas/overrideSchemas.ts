/**
 * Schema-aware system prompts for the canvas's non-layer ("override") slots.
 *
 * Layer slots derive their prompt from the module's Zod schema
 * (`describeLayerSchema` in `@vismay/viz-engine`). The override slots —
 * foreground/background/region structure, theme, defaults, and the
 * share/slides/report/map export overrides — are story-config shapes with no
 * module and no machine-readable schema, so their exact-shape prompts are
 * hand-authored here from the TypeScript types in
 * `@vismay/viz-engine` `lib/storyConfig.types.ts` and `types/story.ts`.
 *
 * `buildSlotSchemaPrompt` is the single entry point both the PromptBar and the
 * generate route call: it routes layer slots to the derived prompt and override
 * slots to the tables below, and is the one place the image-modality guard
 * lives (image layers keep their artistic default, not a YAML schema).
 */

import { describeLayerSchema, listModulesForSlot } from '@vismay/viz-engine'
import { aiSlotConfig, type AiSlotKind } from './aiSlots'

const RAW =
  'Output ONLY valid YAML for this slot — no markdown code fences, no ' +
  'commentary, no surrounding keys.'

/** "bigStat (Big stat), chart (Chart), …" — the layer types valid in a slot. */
function layerMenu(slot: 'foreground' | 'background'): string {
  return listModulesForSlot(slot)
    .map((m) => `${m.type} (${m.label})`)
    .join(', ')
}

/** Per-slot prompt builders. Functions so layer menus reflect the live registry. */
const OVERRIDE_SCHEMAS: Partial<Record<AiSlotKind, () => string>> = {
  foreground: () =>
    `You author a section foreground as YAML — the composable content layered ` +
    `over the section backdrop. It takes one of three shapes:\n` +
    `  1. a single layer mapping,\n` +
    `  2. a flat list of layer mappings, or\n` +
    `  3. a \`layout:\` + \`regions:\` mapping (regions maps a region name to a ` +
    `layer or list of layers).\n` +
    `Every layer is a mapping with a \`type:\` discriminant; author each with ` +
    `that type's own fields. Available foreground layer types: ${layerMenu('foreground')}.\n\n` +
    `Example shape (layout + regions):\n` +
    `layout: stat-left-chart-right\n` +
    `regions:\n` +
    `  lead:\n` +
    `    - { type: bigStat, value: "$18.7B", label: "FY2025 revenue" }\n` +
    `  chart:\n` +
    `    - { type: chart, id: revenue-growth }\n\n` +
    RAW,

  background: () =>
    `You author a section background as YAML: a single layer mapping, a list of ` +
    `layers, or \`{ type: none }\` to suppress the backdrop. Each layer is a ` +
    `mapping with a \`type:\` discriminant. Available background layer types: ` +
    `${layerMenu('background')}. The common cases are a map or an image.\n\n` +
    `Example shape:\n` +
    `type: map\n` +
    `center: [-80.604, 28.608]\n` +
    `zoom: 5\n\n` +
    RAW,

  region: () =>
    `You author one foreground region's content as YAML: a single layer mapping ` +
    `or a list of layers. Each layer is a mapping with a \`type:\` discriminant; ` +
    `author each with that type's own fields. Available layer types: ` +
    `${layerMenu('foreground')}.\n\n` +
    `Example shape:\n` +
    `- { type: bigStat, value: "$18.7B", label: "FY2025 revenue" }\n` +
    `- { type: bodyText, content: ["A short supporting caption."] }\n\n` +
    RAW,

  theme: () =>
    `You author a Vizmaya theme as YAML: a \`colors\` mapping and a \`fonts\` ` +
    `mapping.\n` +
    `Accepted fields:\n` +
    `  - colors (required): background, text, accent, accent2, teal, surface, ` +
    `muted (all required CSS colors); positive, amber, red, line (optional)\n` +
    `  - fonts (required): serif, sans, mono (font-family strings)\n\n` +
    `Example shape:\n` +
    `colors:\n` +
    `  background: "#0b0b0c"\n` +
    `  text: "#f5f5f0"\n` +
    `  accent: "#4a9fd8"\n` +
    `  accent2: "#d8804a"\n` +
    `  teal: "#3fb8a0"\n` +
    `  surface: "#16171a"\n` +
    `  muted: "#8a8a90"\n` +
    `fonts:\n` +
    `  serif: "Georgia, serif"\n` +
    `  sans: "Inter, sans-serif"\n` +
    `  mono: "ui-monospace, monospace"\n\n` +
    `Output ONLY valid YAML for the theme mapping — no \`theme:\` key, no code ` +
    `fences, no commentary.`,

  defaults: () =>
    `You author the story-wide defaults block as YAML. All fields optional — ` +
    `include only what you set:\n` +
    `  - storyBackground: one of { type: aura, slug, input?, tint?, fixed? } | ` +
    `{ type: image, src, fit?, position? } | { type: color, value } | { type: none }\n` +
    `  - overlay: { color?, opacity? (0..1), gradient?: { type: radial|linear, from, to, angle? } }\n` +
    `  - panel: { background?, border?, borderRadius?, padding?, backdropBlur?, shadow? }\n` +
    `  - scroll: { mode: snap|continuous, paddingY? }\n` +
    `  - chart: { theme?, grid?: { left?, right?, top?, bottom? } }\n` +
    `  - progress: true | false\n` +
    `  - logoPalette: { text?, teal?, accent?, accent2?, surface?, muted?, line? }\n` +
    `  (map-format stories also use mapStyle, mapOpacity, pinColor, pinRadius, flySpeed, mapPalette)\n\n` +
    `Example shape:\n` +
    `storyBackground: { type: aura, slug: nebula }\n` +
    `overlay: { color: "#000", opacity: 0.35 }\n` +
    `scroll: { mode: snap }\n` +
    `progress: true\n\n` +
    RAW,

  share: () =>
    `You author a share-card override for one section as YAML — fields that ` +
    `replace the section's defaults on exported share cards. All optional:\n` +
    `  - heading: string\n` +
    `  - subheading: string\n` +
    `  - hide: true | false (drop this section from share)\n` +
    `  - hidePretext: true | false\n` +
    `  - paragraphsOverride: string[] (replacement body paragraphs)\n` +
    `  - ratios: per-aspect overrides keyed by ratio ('1:1' | '4:5' | '3:4' | ` +
    `'4:3'), each a partial of the same fields plus an optional \`map:\` camera block\n\n` +
    `Example shape:\n` +
    `heading: "SpaceX clears $18.7B"\n` +
    `hidePretext: true\n` +
    `paragraphsOverride:\n` +
    `  - "Consolidated revenue rose 33% year over year."\n` +
    `ratios:\n` +
    `  "1:1":\n` +
    `    heading: "$18.7B"\n\n` +
    RAW,

  slides: () => exportPagePrompt('slides'),
  report: () => exportPagePrompt('report'),

  map: () =>
    `You author an autoplay map override for one section as YAML. Output a ` +
    `mapping with a \`map:\` camera block. Do NOT include a \`target:\` field — ` +
    `the canvas sets it automatically. The \`map:\` fields (all optional):\n` +
    `  center: [lng, lat], zoom, pitch, bearing, opacity (0..1), flySpeed, ` +
    `pins: [{ coordinates: [lng, lat], label?, color?, radius? }]\n\n` +
    `Example shape:\n` +
    `map:\n` +
    `  center: [-80.604, 28.608]\n` +
    `  zoom: 5.5\n` +
    `  pitch: 30\n\n` +
    RAW,

  shareMap: () =>
    `You author a share-card map override for one section as YAML — a camera ` +
    `block written directly (no wrapper). Fields (all optional):\n` +
    `  center: [lng, lat], zoom, pitch, bearing,\n` +
    `  pins: [{ coordinates: [lng, lat], label?, color?, radius? }],\n` +
    `  ratios: per-aspect overrides keyed by ratio ('1:1' | '4:5' | '3:4' | ` +
    `'4:3'), each { center?, zoom?, pitch?, bearing? }\n\n` +
    `Example shape:\n` +
    `center: [-80.604, 28.608]\n` +
    `zoom: 5.5\n` +
    `pitch: 30\n` +
    `ratios:\n` +
    `  "1:1": { zoom: 6 }\n\n` +
    RAW,
}

/** Slides and report share one page shape — only the noun differs. */
function exportPagePrompt(kind: 'slides' | 'report'): string {
  return (
    `You author one per-section ${kind} export override page as YAML. Do NOT ` +
    `include a \`unit:\` field — the canvas sets it automatically. All fields ` +
    `optional:\n` +
    `  - include: true | false (false excludes this section from the export)\n` +
    `  - heading: string\n` +
    `  - subheading: string\n` +
    `  - paragraphs: string[]\n` +
    `  - mapOverride: { center?: [lng, lat], zoom?, pitch?, bearing? }\n` +
    `  - chartOverride: { id: string }\n\n` +
    `Example shape:\n` +
    `heading: "Revenue clears $18.7B"\n` +
    `paragraphs:\n` +
    `  - "Consolidated revenue rose 33% year over year."\n` +
    `mapOverride: { zoom: 5.5, pitch: 30 }\n\n` +
    RAW
  )
}

/**
 * The schema-aware system prompt for any slot, or null when none can be derived
 * (the caller then falls back to the slot's generic `defaultSystem`). Layer
 * slots derive from the module's adminForm; override slots use the tables above.
 * Only text-modality slots get a YAML schema — image layers keep their default.
 */
export function buildSlotSchemaPrompt(
  kind: AiSlotKind,
  layerType?: string,
): string | null {
  const config = aiSlotConfig(kind, layerType)
  if (!config || config.modality !== 'text') return null
  if (kind === 'layer') {
    return layerType ? describeLayerSchema(layerType) : null
  }
  return OVERRIDE_SCHEMAS[kind]?.() ?? null
}
