import type { VizModule } from '../../types'

export type ImageFit = 'cover' | 'contain' | 'fill' | 'scale-down' | 'none'

export interface ImageLayerConfig {
  type: 'image'
  /** `assets://<key>`, absolute URL, or same-origin `/public` path. */
  src: string
  alt?: string
  /** CSS object-fit. Defaults to 'cover' so the image fills the slot edge-to-edge. */
  fit?: ImageFit
  /** CSS object-position. Default 'center'. Use to shift the focal point (e.g. 'top', '30% 50%'). */
  focus?: string
  /** Background color shown while the image is loading or where `contain` letterboxes. */
  background?: string
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): ImageLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: image layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.src !== 'string' || r.src.trim().length === 0) {
    throw new Error(`${ctx.label}: image layer requires 'src' (assets://… , https://… , or /public path)`)
  }
  if (r.fit != null && !['cover', 'contain', 'fill', 'scale-down', 'none'].includes(r.fit as string)) {
    throw new Error(`${ctx.label}: image 'fit' must be one of cover | contain | fill | scale-down | none`)
  }
  return {
    type: 'image',
    src: r.src,
    alt: typeof r.alt === 'string' ? r.alt : undefined,
    fit: (r.fit as ImageFit | undefined) ?? 'cover',
    focus: typeof r.focus === 'string' ? r.focus : undefined,
    background: typeof r.background === 'string' ? r.background : undefined,
  }
}

const imageModule: VizModule<ImageLayerConfig> = {
  type: 'image',
  label: 'Image',
  slots: ['foreground', 'background'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  // Multiple sections referencing the same image src share one mount so the
  // browser can keep the decoded bitmap in memory across scroll snaps. The
  // styling (focus / fit / opacity) is part of identity because two cards
  // showing the same src with different framing should NOT share — they
  // need separate <img> elements with their own object-fit.
  stableIdentity: (config) =>
    `image:${config.src}::${config.fit ?? 'cover'}::${config.focus ?? 'center'}::${config.background ?? ''}`,
  collectAssetKeys: (config) => (config.src.startsWith('assets://') ? [config.src] : []),
  // Images are non-interactive by default so scroll/wheel events pass through
  // to the snap-scroll container — critical when an image fills a foreground
  // region edge-to-edge (otherwise the user can't scroll past that section).
  // Authors who want a clickable image opt back in via `style.pointerEvents: 'auto'`.
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'asset', key: 'src', label: 'Image source', accept: ['image/*'], required: true },
    { kind: 'text', key: 'alt', label: 'Alt text', placeholder: 'Describe the image…' },
    {
      kind: 'select',
      key: 'fit',
      label: 'Fit',
      options: [
        { value: 'cover', label: 'Cover (fill, crop overflow)' },
        { value: 'contain', label: 'Contain (fit inside, letterbox)' },
        { value: 'fill', label: 'Fill (stretch)' },
        { value: 'scale-down', label: 'Scale down' },
        { value: 'none', label: 'None (intrinsic size)' },
      ],
    },
    { kind: 'text', key: 'focus', label: 'Focus (CSS object-position)', placeholder: 'center / top / 30% 50%' },
    { kind: 'text', key: 'background', label: 'Background color', placeholder: '#000 or transparent' },
  ],
}

export default imageModule
