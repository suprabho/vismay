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
 *
 * The region box is inset from the viewport edges by a safe area:
 *   - top 96px clears the fixed top-left Vizmaya logo (64px tall + 16px
 *     padding + a hair of breathing room)
 *   - bottom 64px keeps the closing copy off the lower edge
 *   - 6vw horizontal gutter on both sides so slots positioned with
 *     `{ x: left }` / `{ x: right }` don't graze the viewport edge
 *
 * Portrait variant tightens the horizontal gutter (mobile real estate is
 * scarcer) but keeps the same vertical clearance.
 */
const DECK_SAFE_AREA: CSSProperties = {
  position: 'absolute',
  top: '96px',
  bottom: '64px',
  left: '6vw',
  right: '6vw',
}

const DECK_SAFE_AREA_PORTRAIT: CSSProperties = {
  position: 'absolute',
  top: '96px',
  bottom: '48px',
  left: '4vw',
  right: '4vw',
}

const DECK_LAYOUT_NAMES = [
  'text-left-chart-right',
  'text-left-quote-right',
  'image-left-text-right',
  'stat-top-chart-below',
  'stat-left-chart-right',
  'chart-top-text-below',
  'centered',
  'free',
]

const deckFreeLayouts: ForegroundLayoutDef[] = DECK_LAYOUT_NAMES.map((name) => ({
  name,
  regions: {
    default: { style: DECK_SAFE_AREA },
  },
  portrait: {
    name: `${name}.portrait`,
    regions: {
      default: { style: DECK_SAFE_AREA_PORTRAIT },
    },
  },
}))

// Editorial hero variant — the foreground region fills the viewport with
// NO safe-area inset, so an image layer sized `{ width: 100%, height: 100vh }`
// goes truly edge-to-edge. The accompanying text + scrim are painted as a
// z-20 overlay inside `MapStorySection` (so the order is image → scrim →
// headline group from bottom to top in z-stacking).
const heroFullBleed: ForegroundLayoutDef = {
  name: 'hero-full-bleed',
  regions: {
    default: { style: FILL },
  },
  portrait: {
    name: 'hero-full-bleed.portrait',
    regions: {
      default: { style: FILL },
    },
  },
}

const registry = new Map<string, ForegroundLayoutDef>([
  [singleFill.name, singleFill],
  [splitThreeSevenTwoRow.name, splitThreeSevenTwoRow],
  [heroFullBleed.name, heroFullBleed],
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
