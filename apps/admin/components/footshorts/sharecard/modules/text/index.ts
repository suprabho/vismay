import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type {
  FsCardTextConfig,
  TextCardAlign,
  TextCardFont,
  TextCardSize,
  TextCardWeight,
} from '../types'

const SIZES: TextCardSize[] = ['sm', 'md', 'lg', 'xl', '2xl']
const WEIGHTS: TextCardWeight[] = ['regular', 'medium', 'semibold', 'bold', 'black']
const ALIGNS: TextCardAlign[] = ['left', 'center', 'right']
const FONTS: TextCardFont[] = ['sans', 'display', 'mono']

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

/** Lenient on purpose: a parseConfig throw makes LayerView render the layer as a
 *  silent null, so bad/legacy field values fall back to defaults instead of
 *  vanishing the layer mid-edit. Only a non-object config is rejected. */
function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardTextConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:text layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  return {
    type: 'fscard:text',
    text: typeof r.text === 'string' ? r.text : '',
    size: oneOf(r.size, SIZES, 'md'),
    weight: oneOf(r.weight, WEIGHTS, 'bold'),
    align: oneOf(r.align, ALIGNS, 'center'),
    font: oneOf(r.font, FONTS, 'sans'),
    color: typeof r.color === 'string' ? r.color : '',
    uppercase: r.uppercase === true ? true : undefined,
  }
}

function adminForm(): AdminFormField[] {
  // Position / size / rotation are edited via the free-mode Transform panel.
  return [
    { kind: 'textarea', key: 'text', label: 'Text', rows: 3, placeholder: 'Your copy…', required: true },
    { kind: 'select', key: 'size', label: 'Size', options: SIZES.map((s) => ({ value: s, label: s })) },
    { kind: 'select', key: 'weight', label: 'Weight', options: WEIGHTS.map((w) => ({ value: w, label: w })) },
    { kind: 'select', key: 'align', label: 'Align', options: ALIGNS.map((a) => ({ value: a, label: a })) },
    { kind: 'select', key: 'font', label: 'Font', options: FONTS.map((f) => ({ value: f, label: f })) },
    { kind: 'text', key: 'color', label: 'Color', placeholder: '#RRGGBB / accent / text' },
    { kind: 'boolean', key: 'uppercase', label: 'Uppercase' },
  ]
}

const textCardModule: VizModule<FsCardTextConfig> = {
  type: 'fscard:text',
  label: 'Text',
  slots: ['foreground'],
  placement: 'overlay',
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) =>
    `fscard:text:${c.text}:${c.size}:${c.weight}:${c.align}:${c.font}:${c.color}:${c.uppercase ? 1 : 0}`,
}

export default textCardModule
