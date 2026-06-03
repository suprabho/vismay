/**
 * Knowledge pack for the Vizmaya platform Q&A assistant.
 *
 * Two grounding sources, assembled into the assistant's system prompt:
 *   1. PLATFORM_OVERVIEW — a concise, hand-written conceptual map of how the
 *      platform is structured (story files, formats, the canvas, slots).
 *   2. schemaReference() — the exact slot/layer field shapes, GENERATED at
 *      runtime from the live module registry + override schemas (the same
 *      source of truth the ✨ generation feature uses). Because it's derived,
 *      the assistant never drifts from the real fields/enums as modules change.
 *
 * v1 inlines the overview rather than reading repo docs at runtime — robust
 * across deployments (no fs / cross-app paths) and accurate on schemas. If the
 * pack outgrows a comfortable token budget, switch the schema half to retrieval.
 */

import { allRegisteredTypes, describeLayerSchema } from '@vismay/viz-engine'
import { buildSlotSchemaPrompt } from '@/components/vizmaya/canvas/overrideSchemas'
import type { AiSlotKind } from '@/components/vizmaya/canvas/aiSlots'

const PLATFORM_OVERVIEW = `# Vizmaya platform overview

Vizmaya is an authoring platform for data-driven visual stories — scrollytelling
and slide decks built from maps, charts, and composable visual layers.

## Story files
A story is two paired files, edited together:
- A **markdown** file: YAML frontmatter (title, byline, and the **theme**) plus a
  body where each \`## Heading\` starts a **section**; blank-line-separated
  paragraphs are that section's prose.
- A **config.yaml**: a \`sections:\` array. Each entry has an \`id\`, a \`text\`
  field that must match a \`## Heading\` exactly (this links prose to config), an
  optional \`kind\`, and either a legacy \`map:\` camera block OR modern
  \`foreground:\`/\`background:\` layer stacks.
Optional per-story override files: share.yaml (social cards), report.yaml /
slides.yaml (PDF/slide exports), map.yaml (autoplay camera), tts.yaml (narration).

## Two formats
- **map**: scrollytelling over one persistent Mapbox map; each section sets its
  own camera; foreground layers float over the map.
- **deck**: snap-scrolled slides over a page-level "aura" backdrop; sections are
  slides composed of foreground layers placed in layout regions.
Set via frontmatter \`format: map | deck\`.

## Section kinds
text, hero, stat, cover, bigStat, bodyText, split, data, gallery, quote, divider,
closing. (Deck aliases: cover≈hero, bigStat≈stat, bodyText≈text.)

## The canvas (admin editor)
A node graph: left-side **input nodes** (Content, Layout, Theme, Background,
Foreground and its regions) feed a central **Frame** (the rendered section), which
feeds right-side **Output nodes** (Share, Slides, Report, Autoplay map). Paginate
sections with ← / →.
- **Click** an editable node to edit its YAML/markdown in the side panel.
- **Right-click** a Background/Foreground/region junction to **+ Add** a layer,
  region, or override.
- **✨ AI**: click the sparkle chip on an input node to generate that slot's value
  from a prompt; the generated value saves through the normal path. Image layers
  generate an image instead of YAML.

## Foreground
One of three shapes: a single layer, a flat list of layers, or a \`layout:\` +
\`regions:\` mapping (a region name → its layer stack). Layers are composable
visual slots, each a mapping with a \`type:\` field.

## Background
A single layer, a list of layers, or \`{ type: none }\` to suppress the backdrop —
commonly a map or an image.

## Theme
A \`colors\` mapping (background, text, accent, accent2, teal, surface, muted, and
optional positive/amber/red/line) plus a \`fonts\` mapping (serif, sans, mono).
Layer colors reference theme tokens (e.g. accent2), not raw hex.

## Assets
Images live in a per-story asset bucket; reference them as \`assets://<file>\`.
Upload manually or generate with AI from the Assets tab.`

const ASSISTANT_INSTRUCTIONS = `You are the Vizmaya platform assistant. You help
authors understand and use the Vizmaya authoring platform.

Rules:
- Answer ONLY from the reference below (the platform overview and the slot/layer
  schemas). These describe THIS platform's real fields and options.
- Be concise and concrete: name the exact fields, types, and enum values from the
  schemas. Prefer a short YAML example over prose when it clarifies.
- If something isn't covered by the reference, say you're not sure rather than
  guessing — do not invent fields, kinds, or options.
- You explain and advise; you do not perform actions on the story.
- Format answers as GitHub-flavored markdown.`

/** Exact slot/layer schemas, generated from the live registry + override schemas. */
function schemaReference(): string {
  const layers = allRegisteredTypes()
    .map((t) => describeLayerSchema(t))
    .filter((s): s is string => Boolean(s))

  const overrideKinds: AiSlotKind[] = [
    'foreground',
    'background',
    'region',
    'theme',
    'defaults',
    'share',
    'slides',
    'report',
    'map',
    'shareMap',
  ]
  const overrides = overrideKinds
    .map((k) => buildSlotSchemaPrompt(k))
    .filter((s): s is string => Boolean(s))

  return [
    '# Layer types (foreground/background slots)',
    layers.join('\n\n---\n\n'),
    '',
    '# Slot schemas (foreground/background/theme/defaults/overrides)',
    overrides.join('\n\n---\n\n'),
  ].join('\n')
}

/** Full system prompt for the assistant: instructions + overview + live schemas. */
export function buildAssistantSystemPrompt(): string {
  return [
    ASSISTANT_INSTRUCTIONS,
    '',
    '═══════════════ REFERENCE ═══════════════',
    '',
    PLATFORM_OVERVIEW,
    '',
    schemaReference(),
  ].join('\n')
}
