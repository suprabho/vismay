import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

const RiveLayoutFitSchema = z.enum([
  'cover',
  'contain',
  'fill',
  'fitWidth',
  'fitHeight',
  'scaleDown',
  'none',
])
export type RiveLayoutFit = z.infer<typeof RiveLayoutFitSchema>

const RiveLayoutAlignmentSchema = z.enum([
  'center',
  'topLeft',
  'topCenter',
  'topRight',
  'centerLeft',
  'centerRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
])
export type RiveLayoutAlignment = z.infer<typeof RiveLayoutAlignmentSchema>

/**
 * A single view-model binding value. The Component derives the Rive node type
 * from the value type: hex color / theme token (`"$accent"`) / number / boolean
 * / string.
 */
const RiveBindingValueSchema = z.union([z.string(), z.number(), z.boolean()])
export type RiveBindingValue = z.infer<typeof RiveBindingValueSchema>

const RiveInputTypeSchema = z.enum(['number', 'boolean', 'trigger'])

/** Per-step state-machine / view-model input write. */
export const riveStepInputSchema = z
  .object({
    name: z.string().describe('State-machine input name (must match the .riv exactly).'),
    type: RiveInputTypeSchema,
    map: z
      .enum(['linear', 'stepwise', 'trigger'])
      .describe(
        "How activeStep derives the value: 'linear' (0..1, requires totalSteps), 'stepwise' (values[activeStep]), or 'trigger' (fire on step change).",
      ),
    values: z
      .array(z.union([z.number(), z.boolean()]))
      .optional()
      .describe("Per-step values. Required when map === 'stepwise'."),
    totalSteps: z.number().optional().describe("Step count. Required when map === 'linear'."),
  })
  .refine((s) => !(s.map === 'linear' && typeof s.totalSteps !== 'number'), {
    message: "totalSteps required when map === 'linear'",
    path: ['totalSteps'],
  })
  .refine((s) => !(s.map === 'stepwise' && !Array.isArray(s.values)), {
    message: "values required when map === 'stepwise'",
    path: ['values'],
  })
export type RiveStepInputConfig = z.infer<typeof riveStepInputSchema>

/** Freeze strategy used by PDF / share / video captures. */
export const riveCaptureSchema = z.object({
  mode: z
    .enum(['currentFrame', 'stateMachineInput', 'advanceMs', 'posterImage'])
    .describe(
      'Freeze strategy: currentFrame (pause + settle), stateMachineInput (write then pause), advanceMs (play N ms then pause), posterImage (render the poster).',
    ),
  advanceMs: z.number().optional().describe("Milliseconds to play before pausing, for mode 'advanceMs'."),
  stateMachineInput: z
    .object({
      name: z.string(),
      type: RiveInputTypeSchema,
      value: z.union([z.number(), z.boolean()]).optional(),
    })
    .optional()
    .describe("Input to write for mode 'stateMachineInput'."),
})
export type RiveCaptureConfig = z.infer<typeof riveCaptureSchema>

const RiveViewModelSchema = z.object({
  instance: z.string().optional().describe('View-model instance name.'),
  bindings: z
    .record(z.string(), RiveBindingValueSchema)
    .optional()
    .describe('Map of binding name → value (hex / theme token / number / boolean / string).'),
})

const RiveLayoutSchema = z.object({
  fit: RiveLayoutFitSchema.optional(),
  alignment: RiveLayoutAlignmentSchema.optional(),
})

/**
 * Zod schema for the `rive` module — a `.riv` animation layer with optional
 * view-model bindings, per-step state-machine input, and a capture-freeze
 * strategy for deterministic PDF/share renders.
 */
export const riveSchema = z.object({
  type: z.literal('rive'),
  src: z
    .string()
    .trim()
    .min(1)
    .describe('`assets://<key>`, absolute URL, or same-origin /public .riv path. Required.'),
  artboard: z.string().optional().describe('Artboard name. Defaults to the .riv default.'),
  stateMachine: z.string().optional().describe('State machine name. Omit for autoplay-only.'),
  layout: RiveLayoutSchema.optional().describe('Fit + alignment of the artboard in its box.'),
  autoplay: z.boolean().default(true).describe('Autoplay on mount. Defaults true.'),
  posterImage: z
    .string()
    .optional()
    .describe("Fallback image while the .riv loads, or for capture.mode 'posterImage'."),
  viewModel: RiveViewModelSchema.optional().describe('Static view-model bindings applied once on mount.'),
  stepInput: riveStepInputSchema.optional().describe('Per-step state-machine / view-model input writes.'),
  background: z.string().optional().describe('Background color shown while loading.'),
  capture: riveCaptureSchema.optional().describe("Capture-mode behavior. Defaults to { mode: 'currentFrame' }."),
})

export type RiveLayerConfig = z.infer<typeof riveSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): RiveLayerConfig {
  return parseWithSchema(riveSchema, raw, ctx)
}

const riveModule: VizModule<RiveLayerConfig> = {
  type: 'rive',
  label: 'Rive',
  slots: ['foreground', 'background'],
  schema: riveSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `rive:${config.src}::${config.artboard ?? ''}::${config.stateMachine ?? ''}`,
  collectAssetKeys: (config) => {
    const keys: string[] = []
    if (config.src.startsWith('assets://')) keys.push(config.src)
    if (config.posterImage?.startsWith('assets://')) keys.push(config.posterImage)
    return keys
  },
  // For Phase 7 we surface the structural Rive fields. `viewModel.bindings`
  // and `stepInput` are nested-object shapes that the JSON kind covers — once
  // the Rive introspector (Phase 7b) lands, those fields graduate to enumerated
  // dropdowns populated from the .riv's actual artboards/state machines.
  adminForm: () => [
    {
      kind: 'asset',
      key: 'src',
      label: '.riv file',
      accept: ['application/octet-stream', '.riv'],
      required: true,
    },
    { kind: 'text', key: 'artboard', label: 'Artboard', placeholder: '(default)' },
    { kind: 'text', key: 'stateMachine', label: 'State machine', placeholder: '(none — autoplay only)' },
    { kind: 'asset', key: 'posterImage', label: 'Poster image (fallback)', accept: ['image/*'] },
    { kind: 'boolean', key: 'autoplay', label: 'Autoplay' },
    { kind: 'json', key: 'viewModel', label: 'View model bindings (JSON)', placeholder: '{"instance":"default","bindings":{}}' },
    { kind: 'json', key: 'stepInput', label: 'Scroll → input mapping (JSON)' },
    { kind: 'json', key: 'capture', label: 'Capture freeze (JSON)' },
  ],
  // viewModel is the common binding; stepInput/capture are advanced and left to
  // the field docs rather than the worked example.
  aiFieldExamples: {
    viewModel:
      'viewModel:\n' +
      '  instance: default\n' +
      '  bindings: { speed: 1.5, active: true }',
  },
}

export default riveModule
