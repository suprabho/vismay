import { z } from 'zod'
import type { VizModule } from '../../types'
import { StatColorSchema, parseWithSchema } from '../../lib/zodConfig'

const TextKindSchema = z.enum(['text', 'stat'])
export type TextKind = z.infer<typeof TextKindSchema>

/**
 * Zod schema for the `text` module. Every field is optional — the renderer
 * falls back to the active unit's resolved content for any field the layer
 * omits. This lets authors either rely on the section's own heading /
 * paragraphs (the common case) or override with literal text when slotting a
 * text panel into a non-default region.
 */
export const textSchema = z.object({
  type: z.literal('text'),
  kind: TextKindSchema.default('text').describe("Visual variant: 'text' (paragraphs) or 'stat' (big number)."),
  heading: z.string().optional().describe('Inline heading override. Falls back to the unit heading.'),
  subheading: z
    .string()
    .optional()
    .describe('Inline subheading override (label beneath a stat number, or eyebrow above text).'),
  content: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Inline content override — a string (one paragraph) or array of strings.'),
  color: StatColorSchema.optional().describe("Stat-kind only: theme token for the giant number. Default accent2."),
})

export type TextLayerConfig = z.infer<typeof textSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TextLayerConfig {
  return parseWithSchema(textSchema, raw, ctx)
}

const textModule: VizModule<TextLayerConfig> = {
  type: 'text',
  label: 'Text',
  slots: ['foreground'],
  schema: textSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // No stableIdentity — text remounts cheaply, and distinct text layers in
  // different regions of the same unit should NOT share a single instance.
  regionPreferences: ['body', 'lead'],
  // Default card chrome — mirrors the legacy `MapStorySection` text card so a
  // bare `- type: text` in a region looks framed out of the box. Authors who
  // want bare text, a different background, or extra blur override per-field
  // via `style.panel` in YAML — the merge in ForegroundVizSlot is sub-field,
  // so overriding `panel.background` alone keeps the default border + blur.
  defaultStyle: {
    // Text is non-interactive by default so scroll/wheel events pass through
    // to the snap-scroll container. Authors can opt back into selection or
    // click handlers via `style.pointerEvents: 'auto'` in YAML.
    pointerEvents: 'none',
    panel: {
      background: 'rgb(var(--color-panel-rgb) / 0.2)',
      border: '0.5px solid var(--color-line)',
      borderRadius: '8px',
      padding: '1.5rem 1.75rem',
      backdropBlur: '20px',
    },
  },
  adminForm: () => [
    {
      kind: 'select',
      key: 'kind',
      label: 'Variant',
      options: [
        { value: 'text', label: 'Paragraphs' },
        { value: 'stat', label: 'Big-number stat' },
      ],
    },
    { kind: 'text', key: 'heading', label: 'Heading override', placeholder: 'Falls back to the section heading' },
    { kind: 'text', key: 'subheading', label: 'Subheading override' },
    { kind: 'json', key: 'content', label: 'Content override (string | string[])' },
    { kind: 'theme-token', key: 'color', label: 'Stat color token (stat-kind only)' },
  ],
}

export default textModule
