import type { VizModule } from '../../types'

export interface VideoStepSync {
  /**
   * How `activeStep` drives the video's `currentTime`.
   *
   *   stepwise: jump to `stepTimestamps[activeStep]` on each step change.
   *   scrubbed: linearly interpolate `currentTime` across `[stepTimestamps[0], stepTimestamps[last]]`
   *             using `activeStep / (totalSteps - 1)` as the fraction (Phase 4.5).
   *
   * For Phase 4 only `stepwise` ships — `scrubbed` is reserved.
   */
  mode: 'stepwise'
  stepTimestamps: number[]
}

export interface VideoLayerConfig {
  type: 'video'
  /** `assets://<key>`, absolute URL, or same-origin `/public` path. */
  src: string
  /** Static image shown until the video has decoded its first frame. */
  poster?: string
  loop?: boolean
  muted?: boolean
  autoplay?: boolean
  /** Object-fit. Defaults to 'cover'. */
  fit?: 'cover' | 'contain' | 'fill' | 'scale-down' | 'none'
  /** Object-position. */
  focus?: string
  /** Background color shown while loading or where `contain` letterboxes. */
  background?: string
  /**
   * Seconds. When `freeze()` is invoked (PDF / share / video capture), the
   * video is paused and seeked here so the frame is deterministic. Defaults
   * to 0.
   */
  posterTime?: number
  /** Optional scroll-driven seek. See `VideoStepSync`. */
  stepSync?: VideoStepSync
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): VideoLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: video layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.src !== 'string' || r.src.trim().length === 0) {
    throw new Error(`${ctx.label}: video layer requires 'src' (URL or assets://… key)`)
  }
  if (r.fit != null && !['cover', 'contain', 'fill', 'scale-down', 'none'].includes(r.fit as string)) {
    throw new Error(`${ctx.label}: video 'fit' must be one of cover | contain | fill | scale-down | none`)
  }
  const stepSync = (() => {
    if (r.stepSync == null) return undefined
    if (typeof r.stepSync !== 'object') {
      throw new Error(`${ctx.label}: video.stepSync must be an object`)
    }
    const s = r.stepSync as Record<string, unknown>
    if (s.mode !== 'stepwise') {
      throw new Error(`${ctx.label}: video.stepSync.mode must be 'stepwise' (only mode shipped in Phase 4)`)
    }
    if (!Array.isArray(s.stepTimestamps) || !s.stepTimestamps.every((t) => typeof t === 'number')) {
      throw new Error(`${ctx.label}: video.stepSync.stepTimestamps must be an array of numbers (seconds)`)
    }
    return { mode: 'stepwise' as const, stepTimestamps: s.stepTimestamps as number[] }
  })()
  return {
    type: 'video',
    src: r.src,
    poster: typeof r.poster === 'string' ? r.poster : undefined,
    loop: r.loop !== false,
    // Default muted — browsers refuse autoplay with sound, and silent ambient
    // loops are the dominant editorial case.
    muted: r.muted !== false,
    autoplay: r.autoplay !== false,
    fit: (r.fit as VideoLayerConfig['fit'] | undefined) ?? 'cover',
    focus: typeof r.focus === 'string' ? r.focus : undefined,
    background: typeof r.background === 'string' ? r.background : undefined,
    posterTime: typeof r.posterTime === 'number' ? r.posterTime : 0,
    stepSync,
  }
}

const videoModule: VizModule<VideoLayerConfig> = {
  type: 'video',
  label: 'Video',
  slots: ['foreground', 'background'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  // Identity strips style so two cards on the same `src` reuse one <video>
  // element — the browser keeps the buffered ranges across scroll snaps and
  // avoids re-downloading the same MP4.
  stableIdentity: (config) => `video:${config.src}`,
  collectAssetKeys: (config) => {
    const keys: string[] = []
    if (config.src.startsWith('assets://')) keys.push(config.src)
    if (config.poster?.startsWith('assets://')) keys.push(config.poster)
    return keys
  },
  adminForm: () => [
    { kind: 'asset', key: 'src', label: 'Video source', accept: ['video/mp4', 'video/webm'], required: true },
    { kind: 'asset', key: 'poster', label: 'Poster image', accept: ['image/*'] },
    { kind: 'boolean', key: 'loop', label: 'Loop' },
    { kind: 'boolean', key: 'muted', label: 'Muted' },
    { kind: 'boolean', key: 'autoplay', label: 'Autoplay' },
    {
      kind: 'select',
      key: 'fit',
      label: 'Fit',
      options: [
        { value: 'cover', label: 'Cover' },
        { value: 'contain', label: 'Contain' },
        { value: 'fill', label: 'Fill' },
        { value: 'scale-down', label: 'Scale down' },
        { value: 'none', label: 'None' },
      ],
    },
    { kind: 'number', key: 'posterTime', label: 'Capture freeze time (seconds)', min: 0, step: 0.1 },
  ],
}

export default videoModule
