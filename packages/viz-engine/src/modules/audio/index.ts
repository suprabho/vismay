import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

/**
 * Audio layer — a sound source with no visual output. Used by the freeform
 * video editor for audio-only timeline tracks: it draws nothing on the canvas
 * (the renderer skips audio-track clips), and exists so an audio clip is a
 * first-class `VizLayer` that round-trips through the registry, declares its
 * asset key for collection, and exposes an asset picker in the config panel.
 * The actual sound is muxed from `src` by the project render's audio stage.
 */
export const audioSchema = z.object({
  type: z.literal('audio'),
  src: z
    .string()
    .trim()
    .min(1)
    .describe('`assets://<key>`, absolute URL, or same-origin /public path. Required.'),
  muted: z.boolean().default(false).describe('Mute this clip in the mix. Defaults false.'),
  gain: z.number().default(1).describe('Linear volume multiplier. Defaults 1.'),
})

export type AudioLayerConfig = z.infer<typeof audioSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): AudioLayerConfig {
  return parseWithSchema(audioSchema, raw, ctx)
}

const audioModule: VizModule<AudioLayerConfig> = {
  type: 'audio',
  label: 'Audio',
  slots: ['foreground'],
  schema: audioSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  collectAssetKeys: (config) =>
    config.src.startsWith('assets://') ? [config.src] : [],
  adminForm: () => [
    { kind: 'asset', key: 'src', label: 'Audio source', accept: ['audio/mpeg', 'audio/wav', 'audio/mp4'], required: true },
    { kind: 'boolean', key: 'muted', label: 'Muted' },
    { kind: 'number', key: 'gain', label: 'Volume', min: 0, max: 4, step: 0.1 },
  ],
}

export default audioModule
