import type { CSSProperties } from 'react'
import type { ForegroundLayoutDef } from './types'

/**
 * Layout registry. Mirrors the viz-module registry so verticals can register
 * domain-specific layouts (e.g. a future "f1 podium triptych") without
 * modifying core. Read via `getForegroundLayout(name)`; write via
 * `registerForegroundLayout(def)`.
 *
 * Built-in layouts:
 *   - `single-fill`: one region `default` filling the foreground. Wraps
 *     legacy flat `foreground:` arrays at dispatch time.
 *   - `split-37-63-two-row`: matches the canonical Vizmaya story screenshot
 *     (left 37vw `lead` region, top-right `chart`, bottom-right `body`).
 *     Portrait variant stacks them vertically.
 */

const FILL: CSSProperties = { position: 'absolute', inset: 0 }

const singleFill: ForegroundLayoutDef = {
  name: 'single-fill',
  regions: {
    default: { style: FILL },
  },
}

const splitThreeSevenTwoRow: ForegroundLayoutDef = {
  name: 'split-37-63-two-row',
  regions: {
    lead: {
      style: { position: 'absolute', top: 0, left: 0, width: '37vw', height: '100vh' },
      hints: { aspect: 'tall', minHeight: '50vh' },
    },
    chart: {
      style: { position: 'absolute', top: 0, left: '37vw', width: '63vw', height: '50vh' },
      hints: { aspect: 'wide' },
    },
    body: {
      style: { position: 'absolute', top: '50vh', left: '37vw', width: '63vw', height: '50vh' },
      hints: { aspect: 'wide' },
    },
  },
  portrait: {
    name: 'split-37-63-two-row.portrait',
    regions: {
      lead: {
        style: { position: 'absolute', top: 0, left: 0, width: '100vw', height: '30vh' },
      },
      chart: {
        style: { position: 'absolute', top: '30vh', left: 0, width: '100vw', height: '35vh' },
      },
      body: {
        style: { position: 'absolute', top: '65vh', left: 0, width: '100vw', height: '35vh' },
      },
    },
  },
}

/**
 * Deck-format layouts. Each name encodes the canonical region split
 * (text/chart/stat/quote left or right; stacked top/below), but the regions
 * collapse to a single absolute-fill box because the deck's vizslots
 * self-position via `style.position` + `style.size` (see
 * `ForegroundVizSlot.layerWrapperStyle`). Slot-level positioning is what
 * actually draws the layout — the named layout exists so authors signal
 * intent and the admin form / preview can render the right scaffolding.
 *
 * Layouts that need true region splits (where slots map to named regions
 * positionally) can be added later with proper `regions` definitions —
 * the foreground dispatch in `ForegroundLayoutSlot` already supports it.
 */
const deckFreeLayouts: ForegroundLayoutDef[] = [
  'text-left-chart-right',
  'text-left-quote-right',
  'image-left-text-right',
  'stat-top-chart-below',
  'stat-left-chart-right',
  'chart-top-text-below',
  'centered',
  'free',
].map((name) => ({
  name,
  regions: {
    default: { style: FILL },
  },
}))

const registry = new Map<string, ForegroundLayoutDef>([
  [singleFill.name, singleFill],
  [splitThreeSevenTwoRow.name, splitThreeSevenTwoRow],
  ...deckFreeLayouts.map((l): [string, ForegroundLayoutDef] => [l.name, l]),
])

export function registerForegroundLayout(def: ForegroundLayoutDef): void {
  registry.set(def.name, def)
}

export function getForegroundLayout(name: string): ForegroundLayoutDef | undefined {
  return registry.get(name)
}

export function listForegroundLayouts(): ForegroundLayoutDef[] {
  return Array.from(registry.values())
}

export const DEFAULT_FOREGROUND_LAYOUT = 'split-37-63-two-row'
export const FLAT_FOREGROUND_LAYOUT = 'single-fill'
