import type { VizModule } from '../../types'

/**
 * Layer config for the `quote` module — a deck-format pull quote.
 *
 * Renders large italic serif text with an optional attribution line. The deck
 * layout typically pairs this with a prose body in a `text-left-quote-right`
 * split.
 */
export interface QuoteLayerConfig {
  type: 'quote'
  /** The quoted text. Required. May contain inline markdown for emphasis. */
  text: string
  /** Optional attribution line (e.g. "Falcon 9 → Starlink supply chain"). */
  attribution?: string
  /** Horizontal alignment inside the region. Defaults to `left`. */
  align?: 'left' | 'center' | 'right'
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): QuoteLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: quote layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.text !== 'string' || r.text.trim().length === 0) {
    throw new Error(`${ctx.label}: quote 'text' is required and must be a non-empty string`)
  }
  if (r.align != null && r.align !== 'left' && r.align !== 'center' && r.align !== 'right') {
    throw new Error(`${ctx.label}: quote 'align' must be 'left' | 'center' | 'right'`)
  }
  return {
    type: 'quote',
    text: r.text.trim(),
    attribution: typeof r.attribution === 'string' ? r.attribution.trim() : undefined,
    align: (r.align as QuoteLayerConfig['align']) ?? 'left',
  }
}

/**
 * Stable identity by quote-text prefix so distinct quotes don't share an
 * instance (which would cause the text to morph between scrolls).
 */
function stableIdentity(config: QuoteLayerConfig): string {
  return `quote:${config.text.slice(0, 64)}`
}

const quoteModule: VizModule<QuoteLayerConfig> = {
  type: 'quote',
  label: 'Quote',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity,
  defaultStyle: { pointerEvents: 'none' },
  regionPreferences: ['body', 'quote'],
  adminForm: () => [
    { kind: 'text', key: 'text', label: 'Quote text', required: true },
    { kind: 'text', key: 'attribution', label: 'Attribution' },
    {
      kind: 'select',
      key: 'align',
      label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
    },
  ],
}

export default quoteModule
