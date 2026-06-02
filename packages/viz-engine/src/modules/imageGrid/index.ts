import type { VizModule } from '../../types'

export interface ImageGridItem {
  src: string
  alt?: string
  caption?: string
}

/**
 * Layer config for the `imageGrid` module — the deck-format mosaic.
 *
 * 2-6 images arranged in a responsive grid. The layout is chosen by count:
 *   2 → 2×1
 *   3 → 3×1
 *   4 → 2×2
 *   5 → 3-2 split
 *   6 → 3×2
 */
export interface ImageGridLayerConfig {
  type: 'imageGrid'
  items: ImageGridItem[]
  /** Optional caption rendered below the grid. */
  caption?: string
  /** CSS `object-fit` for every image. Defaults to `cover`. */
  fit?: 'cover' | 'contain'
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): ImageGridLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: imageGrid layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.items) || r.items.length < 2) {
    throw new Error(`${ctx.label}: imageGrid 'items' must contain at least 2 entries`)
  }
  if (r.items.length > 6) {
    throw new Error(`${ctx.label}: imageGrid 'items' may contain at most 6 entries`)
  }
  const items: ImageGridItem[] = r.items.map((it, i) => {
    if (!it || typeof it !== 'object') {
      throw new Error(`${ctx.label}: imageGrid item ${i} must be an object`)
    }
    const obj = it as Record<string, unknown>
    if (typeof obj.src !== 'string' || obj.src.trim().length === 0) {
      throw new Error(`${ctx.label}: imageGrid item ${i} 'src' is required`)
    }
    return {
      src: obj.src.trim(),
      alt: typeof obj.alt === 'string' ? obj.alt : undefined,
      caption: typeof obj.caption === 'string' ? obj.caption : undefined,
    }
  })
  return {
    type: 'imageGrid',
    items,
    caption: typeof r.caption === 'string' ? r.caption : undefined,
    fit: r.fit === 'contain' ? 'contain' : 'cover',
  }
}

const imageGridModule: VizModule<ImageGridLayerConfig> = {
  type: 'imageGrid',
  label: 'Image grid',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  // First-paint readiness: every image must load (or error) before the slot
  // signals ready, so PDF capture waits for the mosaic to settle.
  readinessProfile: 'first-paint',
  // Stable by image-src list — duplicate identical grids share an instance.
  stableIdentity: (cfg) => `imageGrid:${cfg.items.map((i) => i.src).join('|').slice(0, 96)}`,
  defaultStyle: { pointerEvents: 'none' },
  adminForm: () => [
    { kind: 'json', key: 'items', label: 'Items ([{ src, alt?, caption? }])', required: true },
    { kind: 'text', key: 'caption', label: 'Caption' },
    {
      kind: 'select',
      key: 'fit',
      label: 'Fit',
      options: [
        { value: 'cover', label: 'Cover (crop to fill)' },
        { value: 'contain', label: 'Contain (no crop)' },
      ],
    },
  ],
  aiFieldExamples: {
    items:
      'items:\n' +
      '  - { src: "assets://photo-1.jpg", alt: "Falcon 9 liftoff" }\n' +
      '  - { src: "assets://photo-2.jpg", caption: "Booster landing" }',
  },
}

export default imageGridModule
