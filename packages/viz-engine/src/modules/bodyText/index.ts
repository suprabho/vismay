import type { VizModule } from '../../types'

export type BodyTextSize = 'small' | 'normal' | 'large'
export type BodyTextColor = 'text' | 'muted' | 'accent' | 'accent2'

/**
 * Layer config for the `bodyText` module — the deck format's prose vizslot.
 * Composed alongside charts and stats in a region, reads its paragraphs from
 * the anchored markdown unit by default.
 *
 * Two `from` modes:
 *   - `'text'` (default) → pulls paragraphs from the current unit's resolved
 *     content via `ForegroundContentContext` (the common case for deck slides
 *     whose markdown heading anchors the section).
 *   - `'section-id'` → pulls from a literal `content` field instead. (Future
 *     extension: pull from another section by id; not implemented yet.)
 */
export interface BodyTextLayerConfig {
  type: 'bodyText'
  /** Source mode. `'text'` reads the current unit's paragraphs. Default `'text'`. */
  from?: 'text'
  /**
   * Literal paragraph(s). When set, takes precedence over the unit's
   * resolved paragraphs — use for ad-hoc prose that doesn't live in the
   * markdown.
   */
  content?: string | string[]
  /** Optional heading rendered above the paragraphs. Falls back to unit heading. */
  heading?: string
  /** Whether to render the heading at all. Defaults to false (deck slides typically suppress it). */
  showHeading?: boolean
  /** Text styling. */
  textStyle?: {
    size?: BodyTextSize
    color?: BodyTextColor
  }
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): BodyTextLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: bodyText layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (r.from != null && r.from !== 'text') {
    throw new Error(`${ctx.label}: bodyText 'from' must be 'text' (other sources not yet supported)`)
  }
  if (r.content != null && typeof r.content !== 'string' && !Array.isArray(r.content)) {
    throw new Error(`${ctx.label}: bodyText 'content' must be a string or array of strings`)
  }
  const ts = (r.textStyle ?? {}) as Record<string, unknown>
  return {
    type: 'bodyText',
    from: 'text',
    content: r.content as string | string[] | undefined,
    heading: typeof r.heading === 'string' ? r.heading : undefined,
    showHeading: r.showHeading === true,
    textStyle: {
      size: ts.size as BodyTextSize | undefined,
      color: ts.color as BodyTextColor | undefined,
    },
  }
}

const bodyTextModule: VizModule<BodyTextLayerConfig> = {
  type: 'bodyText',
  label: 'Body text',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // No stableIdentity — bodyText layers remount cheaply per region.
  regionPreferences: ['body', 'text'],
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'boolean', key: 'showHeading', label: 'Show heading above paragraphs' },
    { kind: 'text', key: 'heading', label: 'Heading override' },
    { kind: 'json', key: 'content', label: 'Content override (string | string[])' },
    {
      kind: 'select',
      key: 'textStyle.size',
      label: 'Size',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'normal', label: 'Normal' },
        { value: 'large', label: 'Large' },
      ],
    },
    {
      kind: 'select',
      key: 'textStyle.color',
      label: 'Color',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'muted', label: 'Muted' },
        { value: 'accent', label: 'Accent' },
        { value: 'accent2', label: 'Accent 2' },
      ],
    },
  ],
}

export default bodyTextModule
