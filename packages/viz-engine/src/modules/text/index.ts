import type { VizModule } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'

export type TextKind = 'text' | 'stat'

/**
 * Layer config for the `text` module. Every field is optional — the renderer
 * falls back to the active unit's resolved content (`ForegroundContentContext`)
 * for any field the layer omits. This lets authors either rely on the section's
 * own heading / paragraphs (the common case) or override with literal text
 * when slotting a text panel into a non-default region.
 */
export interface TextLayerConfig {
  type: 'text'
  /** Visual variant. Default 'text'. */
  kind?: TextKind
  /** Inline heading override. Falls back to `unit.heading`. */
  heading?: string
  /** Inline subheading override (label beneath stat number, or eyebrow above text). */
  subheading?: string
  /** Inline content override. String → single paragraph; array → multi-paragraph. */
  content?: string | string[]
  /** Stat-kind only: theme palette token for the giant number's color. Default 'accent2'. */
  color?: StatColor
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TextLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: text layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (r.kind != null && r.kind !== 'text' && r.kind !== 'stat') {
    throw new Error(`${ctx.label}: text 'kind' must be 'text' or 'stat'`)
  }
  if (r.content != null && typeof r.content !== 'string' && !Array.isArray(r.content)) {
    throw new Error(`${ctx.label}: text 'content' must be a string or array of strings`)
  }
  return {
    type: 'text',
    kind: (r.kind as TextKind | undefined) ?? 'text',
    heading: typeof r.heading === 'string' ? r.heading : undefined,
    subheading: typeof r.subheading === 'string' ? r.subheading : undefined,
    content: r.content as string | string[] | undefined,
    color: r.color as StatColor | undefined,
  }
}

const textModule: VizModule<TextLayerConfig> = {
  type: 'text',
  label: 'Text',
  slots: ['foreground'],
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
