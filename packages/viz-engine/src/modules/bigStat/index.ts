import type { VizModule } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'

/**
 * Theme palette token used for the delta line. Mirrors `StatColor` plus the
 * `positive`/`amber`/`red` semantic tokens so authors can colour the delta
 * independently of the big number itself.
 */
export type DeltaColor = StatColor | 'positive'

/**
 * Layer config for the `bigStat` module — the deck format's composable
 * giant-number vizslot. Unlike the legacy `text` module's `kind: stat`
 * treatment (which centres in the whole section), `bigStat` lives inside a
 * region of a deck layout and respects the region's box. Use this when a
 * stat sits side-by-side with a chart, image, or prose body.
 */
export interface BigStatLayerConfig {
  type: 'bigStat'
  /** The big number itself, e.g. "$18.7B" or "10.3M". Required. */
  value: string
  /**
   * Optional unit/suffix rendered adjacent to the value at a smaller weight.
   * Useful when the value is purely numeric ("18.7") and the unit ("B") is
   * styled differently.
   */
  unit?: string
  /** Short label beneath the number. Required for readability. */
  label?: string
  /**
   * Secondary line below the label — typically a year-over-year delta or
   * date qualifier (e.g. "+33% YoY · run-rate $18.8B in Q1 2026").
   */
  delta?: string
  /** Theme token applied to the delta line. Defaults to `muted`. */
  deltaColor?: DeltaColor
  /** Theme token applied to the big number. Defaults to `accent2`. */
  color?: StatColor
  /** Horizontal alignment inside the region's box. Defaults to `left`. */
  align?: 'left' | 'center' | 'right'
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): BigStatLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: bigStat layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.value !== 'string' || r.value.trim().length === 0) {
    throw new Error(`${ctx.label}: bigStat 'value' is required and must be a non-empty string`)
  }
  if (r.align != null && r.align !== 'left' && r.align !== 'center' && r.align !== 'right') {
    throw new Error(`${ctx.label}: bigStat 'align' must be 'left' | 'center' | 'right'`)
  }
  return {
    type: 'bigStat',
    value: r.value,
    unit: typeof r.unit === 'string' ? r.unit : undefined,
    label: typeof r.label === 'string' ? r.label : undefined,
    delta: typeof r.delta === 'string' ? r.delta : undefined,
    deltaColor: r.deltaColor as DeltaColor | undefined,
    color: r.color as StatColor | undefined,
    align: (r.align as BigStatLayerConfig['align']) ?? 'left',
  }
}

/**
 * Deterministic identity so multiple `bigStat` layers on the same unit don't
 * collapse into one instance. Keyed by the value text — distinct stats render
 * as distinct components, identical stats reuse.
 */
function stableIdentity(config: BigStatLayerConfig): string {
  return `bigStat:${config.value}`
}

const bigStatModule: VizModule<BigStatLayerConfig> = {
  type: 'bigStat',
  label: 'Big stat',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity,
  // No default panel — the deck format applies frosted-glass chrome via
  // `defaults.panel`, and a bare `bigStat` in a non-deck context should sit
  // borderless on whatever surface it lands.
  defaultStyle: {
    pointerEvents: 'none',
  },
  regionPreferences: ['lead', 'stat'],
  adminForm: () => [
    { kind: 'text', key: 'value', label: 'Big number', placeholder: '$18.7B', required: true },
    { kind: 'text', key: 'unit', label: 'Unit suffix' },
    { kind: 'text', key: 'label', label: 'Label beneath number' },
    { kind: 'text', key: 'delta', label: 'Delta line (optional)' },
    { kind: 'theme-token', key: 'color', label: 'Number color' },
    { kind: 'theme-token', key: 'deltaColor', label: 'Delta color' },
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

export default bigStatModule
