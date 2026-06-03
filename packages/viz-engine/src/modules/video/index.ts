import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

/**
 * How `activeStep` drives the video's `currentTime`. For Phase 4 only
 * `stepwise` ships (jump to `stepTimestamps[activeStep]` on each step change);
 * `scrubbed` interpolation is reserved.
 */
export const videoStepSyncSchema = z.object({
  mode: z.literal('stepwise').describe("Sync mode. Only 'stepwise' ships in Phase 4."),
  stepTimestamps: z
    .array(z.number())
    .describe('Seconds to seek to per step — one timestamp per scroll step.'),
})

export type VideoStepSync = z.infer<typeof videoStepSyncSchema>

const VideoFitSchema = z.enum(['cover', 'contain', 'fill', 'scale-down', 'none'])

/**
 * Zod schema for the `video` module — a looping/auto-playing video layer with
 * deterministic capture (seek to `posterTime` on freeze) and optional
 * scroll-driven seek.
 */
export const videoSchema = z.object({
  type: z.literal('video'),
  src: z
    .string()
    .trim()
    .min(1)
    .describe('`assets://<key>`, absolute URL, or same-origin /public path. Required.'),
  poster: z.string().optional().describe('Static image shown until the first frame decodes.'),
  loop: z.boolean().default(true).describe('Loop playback. Defaults true.'),
  muted: z
    .boolean()
    .default(true)
    .describe('Mute audio. Defaults true (browsers refuse autoplay with sound).'),
  autoplay: z.boolean().default(true).describe('Autoplay on mount. Defaults true.'),
  fit: VideoFitSchema.default('cover').describe('CSS object-fit. Defaults to cover.'),
  focus: z.string().optional().describe('CSS object-position.'),
  background: z
    .string()
    .optional()
    .describe('Background color shown while loading or where `contain` letterboxes.'),
  posterTime: z
    .number()
    .default(0)
    .describe('Seconds to seek for a deterministic capture frame. Defaults 0.'),
  stepSync: videoStepSyncSchema.optional().describe('Optional scroll-driven seek.'),
})

export type VideoLayerConfig = z.infer<typeof videoSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): VideoLayerConfig {
  return parseWithSchema(videoSchema, raw, ctx)
}

const videoModule: VizModule<VideoLayerConfig> = {
  type: 'video',
  label: 'Video',
  slots: ['foreground', 'background'],
  schema: videoSchema,
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
