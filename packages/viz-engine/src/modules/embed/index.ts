import type { VizModule } from '../../types'

export interface EmbedLayerConfig {
  type: 'embed'
  /** Absolute URL of the embedded resource (tweet, observable notebook, youtube, etc.). */
  src: string
  /**
   * REQUIRED. Static image used in `capture` / `print` mode — cross-origin
   * iframes don't rasterize reliably into PDFs or share-card screenshots.
   * Accepts the same shapes as image.src (assets://, https://, /public).
   */
  poster: string
  /** CSS aspect-ratio. Defaults to '16 / 9'. Use 'auto' to let the iframe size itself. */
  aspect?: string
  /**
   * iframe `sandbox` attribute. Defaults to 'allow-scripts' — minimal surface
   * that still permits most read-only embeds. Authors can opt into more
   * (allow-same-origin, allow-forms, allow-popups) on a per-embed basis when
   * they trust the source.
   */
  sandbox?: string
  /** iframe `allow` attribute (camera, autoplay, etc.). Empty by default. */
  allow?: string
  /** iframe `referrerpolicy`. Defaults to 'no-referrer-when-downgrade' (browser default). */
  referrerPolicy?: string
  /** Optional title for accessibility. Defaults to "Embedded content". */
  title?: string
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): EmbedLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: embed layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.src !== 'string' || r.src.trim().length === 0) {
    throw new Error(`${ctx.label}: embed layer requires 'src' (URL)`)
  }
  if (typeof r.poster !== 'string' || r.poster.trim().length === 0) {
    throw new Error(
      `${ctx.label}: embed layer requires 'poster' — cross-origin iframes can't rasterize in PDF/share captures`
    )
  }
  return {
    type: 'embed',
    src: r.src,
    poster: r.poster,
    aspect: typeof r.aspect === 'string' ? r.aspect : '16 / 9',
    sandbox: typeof r.sandbox === 'string' ? r.sandbox : 'allow-scripts',
    allow: typeof r.allow === 'string' ? r.allow : undefined,
    referrerPolicy: typeof r.referrerPolicy === 'string' ? r.referrerPolicy : undefined,
    title: typeof r.title === 'string' ? r.title : 'Embedded content',
  }
}

const embedModule: VizModule<EmbedLayerConfig> = {
  type: 'embed',
  label: 'Embed (iframe)',
  slots: ['foreground', 'background'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `embed:${config.src}::${config.sandbox ?? ''}`,
  collectAssetKeys: (config) => {
    const keys: string[] = []
    if (config.poster.startsWith('assets://')) keys.push(config.poster)
    return keys
  },
  adminForm: () => [
    { kind: 'text', key: 'src', label: 'Embed URL', placeholder: 'https://…', required: true },
    {
      kind: 'asset',
      key: 'poster',
      label: 'Poster image (required for capture)',
      accept: ['image/*'],
      required: true,
    },
    { kind: 'text', key: 'aspect', label: 'Aspect ratio (CSS)', placeholder: '16 / 9' },
    { kind: 'text', key: 'sandbox', label: 'iframe sandbox attribute', placeholder: 'allow-scripts' },
    { kind: 'text', key: 'title', label: 'Accessibility title' },
  ],
}

export default embedModule
