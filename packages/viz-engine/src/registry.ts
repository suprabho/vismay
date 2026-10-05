import type { VizModule, VizSlot } from './types'
import chartModule from './modules/chart'
import mapModule from './modules/map'
import imageModule from './modules/image'
import embedModule from './modules/embed'
import videoModule from './modules/video'
import audioModule from './modules/audio'
import riveModule from './modules/rive'
import textModule from './modules/text'
import bigStatModule from './modules/bigStat'
import bodyTextModule from './modules/bodyText'
import quoteModule from './modules/quote'
import keyValueModule from './modules/keyValue'
import imageGridModule from './modules/imageGrid'
import tableModule from './modules/table'

// The registry stores modules with the config generic erased — different
// modules carry incompatible config types, and `parseConfig`'s input position
// makes them not mutually assignable through `VizModule<unknown>`. Each module
// owns the round-trip from raw YAML → its own TConfig → its own component, so
// erasure at the registry boundary is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVizModule = VizModule<any>

const core: AnyVizModule[] = [
  chartModule,
  mapModule,
  imageModule,
  embedModule,
  videoModule,
  audioModule,
  riveModule,
  textModule,
  bigStatModule,
  bodyTextModule,
  quoteModule,
  keyValueModule,
  imageGridModule,
  tableModule,
]

const registry = new Map<string, AnyVizModule>(core.map((m) => [m.type, m]))

// Re-registering a type is a no-op (first registration wins). A vertical's
// `register()` can legitimately run more than once per client — the bundler may
// evaluate a module that calls it in more than one chunk, HMR re-runs it, or an
// app calls it directly as well as via `loadVertical`. Throwing here used to
// surface as an uncaught error that took down the whole page (e.g. vizf1's
// replay page on switching to the 3D view).
export function registerVizModule(m: AnyVizModule): void {
  const existing = registry.get(m.type)
  if (existing) {
    if (existing !== m && process.env.NODE_ENV !== 'production') {
      console.warn(`[viz-engine] viz module '${m.type}' already registered — keeping the first`)
    }
    return
  }
  registry.set(m.type, m)
}

export function getVizModule(type: string): AnyVizModule | undefined {
  return registry.get(type)
}

export function listModulesForSlot(slot: VizSlot): AnyVizModule[] {
  return [...registry.values()].filter((m) => m.slots.includes(slot))
}

export function allRegisteredTypes(): string[] {
  return [...registry.keys()]
}
