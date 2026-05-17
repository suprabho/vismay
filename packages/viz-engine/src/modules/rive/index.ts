import type { VizModule } from '../../types'

export type RiveLayoutFit =
  | 'cover'
  | 'contain'
  | 'fill'
  | 'fitWidth'
  | 'fitHeight'
  | 'scaleDown'
  | 'none'

export type RiveLayoutAlignment =
  | 'center'
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'centerLeft'
  | 'centerRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight'

/**
 * A single view-model binding. `value` is either:
 *   - a hex color string (`"#d8804a"`) → applied via `useViewModelInstanceColor`
 *   - a theme token (`"$accent"`)       → resolved via lib/theme.ts (color paths)
 *   - a number                          → applied via `useViewModelInstanceNumber`
 *   - a boolean                         → applied via `useViewModelInstanceBoolean`
 *   - a string                          → applied via `useViewModelInstanceString`
 *
 * The Component derives the node type from the value type. Authors who need
 * something more specific (e.g. enum) can fall back to a hex literal that
 * happens to encode the desired enum value.
 */
export type RiveBindingValue = string | number | boolean

export interface RiveStepInputConfig {
  /** State-machine input name (must match the .riv exactly). */
  name: string
  type: 'number' | 'boolean' | 'trigger'
  /**
   * How to derive the input value from `activeStep`:
   *   linear:   `activeStep / Math.max(1, totalSteps - 1)` — yields 0..1.
   *             Only valid for `type: 'number'`. Requires `totalSteps`.
   *   stepwise: read from `values[activeStep]`. Length must match step count.
   *   trigger:  fire the trigger on each step change (no value).
   */
  map: 'linear' | 'stepwise' | 'trigger'
  values?: Array<number | boolean>
  /** Required when map === 'linear'. */
  totalSteps?: number
}

export interface RiveCaptureConfig {
  /**
   * Freeze strategy used by PDF / share / video captures.
   *
   *   currentFrame:        pause + a short settle delay; deterministic only if
   *                        autoplay is off or the .riv has hit its idle state.
   *   stateMachineInput:   write the configured input, then pause.
   *   advanceMs:           play for N ms from the start, then pause.
   *   posterImage:         skip Rive entirely; render the posterImage. Fastest.
   */
  mode: 'currentFrame' | 'stateMachineInput' | 'advanceMs' | 'posterImage'
  advanceMs?: number
  stateMachineInput?: { name: string; type: 'number' | 'boolean' | 'trigger'; value?: number | boolean }
}

export interface RiveLayerConfig {
  type: 'rive'
  /** `assets://<key>`, absolute URL, or same-origin `/public` path. */
  src: string
  artboard?: string
  stateMachine?: string
  layout?: { fit?: RiveLayoutFit; alignment?: RiveLayoutAlignment }
  autoplay?: boolean
  /** Optional fallback image while the `.riv` loads OR for capture.mode === 'posterImage'. */
  posterImage?: string
  /** Static view-model bindings applied once on mount. */
  viewModel?: {
    instance?: string
    bindings?: Record<string, RiveBindingValue>
  }
  /** Per-step state-machine / view-model input writes. */
  stepInput?: RiveStepInputConfig
  /** Background color shown while loading. */
  background?: string
  /** Capture-mode behavior. Defaults to `{ mode: 'currentFrame' }`. */
  capture?: RiveCaptureConfig
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): RiveLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: rive layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.src !== 'string' || r.src.trim().length === 0) {
    throw new Error(`${ctx.label}: rive layer requires 'src' (.riv URL or assets:// key)`)
  }
  const layout = (() => {
    if (r.layout == null) return undefined
    if (typeof r.layout !== 'object') throw new Error(`${ctx.label}: rive.layout must be an object`)
    return r.layout as RiveLayerConfig['layout']
  })()
  const viewModel = (() => {
    if (r.viewModel == null) return undefined
    if (typeof r.viewModel !== 'object') {
      throw new Error(`${ctx.label}: rive.viewModel must be an object`)
    }
    const vm = r.viewModel as Record<string, unknown>
    if (vm.bindings != null && typeof vm.bindings !== 'object') {
      throw new Error(`${ctx.label}: rive.viewModel.bindings must be a map`)
    }
    return {
      instance: typeof vm.instance === 'string' ? vm.instance : undefined,
      bindings: (vm.bindings as Record<string, RiveBindingValue> | undefined) ?? undefined,
    }
  })()
  const stepInput = (() => {
    if (r.stepInput == null) return undefined
    if (typeof r.stepInput !== 'object') throw new Error(`${ctx.label}: rive.stepInput must be an object`)
    const s = r.stepInput as Record<string, unknown>
    if (typeof s.name !== 'string') throw new Error(`${ctx.label}: rive.stepInput.name required`)
    if (s.type !== 'number' && s.type !== 'boolean' && s.type !== 'trigger') {
      throw new Error(`${ctx.label}: rive.stepInput.type must be number | boolean | trigger`)
    }
    if (s.map !== 'linear' && s.map !== 'stepwise' && s.map !== 'trigger') {
      throw new Error(`${ctx.label}: rive.stepInput.map must be linear | stepwise | trigger`)
    }
    if (s.map === 'linear' && typeof s.totalSteps !== 'number') {
      throw new Error(`${ctx.label}: rive.stepInput.totalSteps required when map === 'linear'`)
    }
    if (s.map === 'stepwise' && !Array.isArray(s.values)) {
      throw new Error(`${ctx.label}: rive.stepInput.values required when map === 'stepwise'`)
    }
    return s as unknown as RiveStepInputConfig
  })()
  const capture = (() => {
    if (r.capture == null) return undefined
    if (typeof r.capture !== 'object') throw new Error(`${ctx.label}: rive.capture must be an object`)
    const c = r.capture as Record<string, unknown>
    if (
      c.mode !== 'currentFrame' &&
      c.mode !== 'stateMachineInput' &&
      c.mode !== 'advanceMs' &&
      c.mode !== 'posterImage'
    ) {
      throw new Error(`${ctx.label}: rive.capture.mode must be currentFrame | stateMachineInput | advanceMs | posterImage`)
    }
    return c as unknown as RiveCaptureConfig
  })()
  return {
    type: 'rive',
    src: r.src,
    artboard: typeof r.artboard === 'string' ? r.artboard : undefined,
    stateMachine: typeof r.stateMachine === 'string' ? r.stateMachine : undefined,
    layout,
    autoplay: r.autoplay !== false,
    posterImage: typeof r.posterImage === 'string' ? r.posterImage : undefined,
    viewModel,
    stepInput,
    background: typeof r.background === 'string' ? r.background : undefined,
    capture,
  }
}

const riveModule: VizModule<RiveLayerConfig> = {
  type: 'rive',
  label: 'Rive',
  slots: ['foreground', 'background'],
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
}

export default riveModule
