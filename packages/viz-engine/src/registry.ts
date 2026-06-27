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

export function registerVizModule(m: AnyVizModule): void {
  if (registry.has(m.type)) {
    throw new Error(`Viz module '${m.type}' already registered`)
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
