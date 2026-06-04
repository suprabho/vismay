import type { CSSProperties } from 'react'
import type { ForegroundLayoutDef, ForegroundLayoutRegion } from './types'

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
 *   - the deck layouts (`text-left-chart-right`, `stat-left-chart-right`, …):
 *     real two-region splits inside a safe area, plus a back-compat `default`
 *     region — see the deck section below.
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
 * Deck-format layouts.
 *
 * Each deck layout now carries REAL region geometry so the layout NAME does the
 * positioning — `text-left-chart-right` actually places a `text` region on the
 * left and a `chart` region on the right, inside a safe area that:
 *   - clears the fixed top-left Vizmaya logo (top 96px),
 *   - keeps closing copy off the lower edge (bottom 64px),
 *   - holds a 6vw horizontal gutter so columns don't graze the viewport edge.
 *
 * Back-compat: every deck layout ALSO keeps a full-safe-area `default` region.
 * A legacy deck that passes a flat `foreground:` array resolves into `default`
 * (see `resolveSlots.resolveForeground`) and therefore renders exactly as
 * before — the named regions are additive/opt-in. Authors target a named
 * region via the `regions:` map:
 *
 *   foreground:
 *     layout: text-left-chart-right
 *     regions:
 *       text:  [ { type: bodyText, ... } ]
 *       chart: [ { type: chart, id: ... } ]
 *
 * `default` is declared first so the named regions paint above it (the empty
 * `default` box stays behind, `pointerEvents: none`). Portrait stacks the two
 * regions vertically; `default` slots still self-flow full-width via
 * `stackOnPortrait`.
 */
const SAFE = { top: '96px', bottom: '64px', left: '6vw', right: '6vw' } as const
const SAFE_P = { top: '96px', bottom: '48px', left: '4vw', right: '4vw' } as const

const DECK_SAFE_AREA: CSSProperties = { position: 'absolute', ...SAFE }
const DECK_SAFE_AREA_PORTRAIT: CSSProperties = { position: 'absolute', ...SAFE_P }

// Landscape region boxes inside the safe area.
const colLeft = (width: string): CSSProperties => ({
  position: 'absolute',
  top: SAFE.top,
  bottom: SAFE.bottom,
  left: SAFE.left,
  width,
})
const colRight = (width: string): CSSProperties => ({
  position: 'absolute',
  top: SAFE.top,
  bottom: SAFE.bottom,
  right: SAFE.right,
  width,
})
const rowTop = (height: string): CSSProperties => ({
  position: 'absolute',
  top: SAFE.top,
  left: SAFE.left,
  right: SAFE.right,
  height,
})
const rowBelow = (top: string): CSSProperties => ({
  position: 'absolute',
  top,
  left: SAFE.left,
  right: SAFE.right,
  bottom: SAFE.bottom,
})
const centeredBox: CSSProperties = {
  position: 'absolute',
  top: SAFE.top,
  bottom: SAFE.bottom,
  left: '20vw',
  right: '20vw',
}

// Portrait: stack the two regions into top/bottom halves of the safe area.
const P_TOP: CSSProperties = {
  position: 'absolute',
  top: SAFE_P.top,
  left: SAFE_P.left,
  right: SAFE_P.right,
  height: '40vh',
}
const P_BOTTOM: CSSProperties = {
  position: 'absolute',
  top: '54vh',
  left: SAFE_P.left,
  right: SAFE_P.right,
  bottom: SAFE_P.bottom,
}

interface DeckRegionSpec {
  key: string
  land: CSSProperties
  port: CSSProperties
  /** Advisory viz-type hint surfaced to the admin region picker. */
  accepts?: readonly string[]
}

/** Build a deck layout: named regions + a back-compat full-safe-area `default`. */
function deckLayout(name: string, specs: DeckRegionSpec[]): ForegroundLayoutDef {
  const regions: Record<string, ForegroundLayoutRegion> = {
    default: { style: DECK_SAFE_AREA },
  }
  const portraitRegions: Record<string, ForegroundLayoutRegion> = {
    default: { style: DECK_SAFE_AREA_PORTRAIT },
  }
  for (const s of specs) {
    regions[s.key] = { style: s.land, ...(s.accepts ? { accepts: s.accepts } : {}) }
    portraitRegions[s.key] = { style: s.port, ...(s.accepts ? { accepts: s.accepts } : {}) }
  }
  return {
    name,
    stackOnPortrait: true,
    regions,
    portrait: { name: `${name}.portrait`, regions: portraitRegions },
  }
}

const deckLayouts: ForegroundLayoutDef[] = [
  deckLayout('text-left-chart-right', [
    { key: 'text', land: colLeft('38vw'), port: P_TOP, accepts: ['text', 'bodyText', 'quote'] },
    { key: 'chart', land: colRight('44vw'), port: P_BOTTOM, accepts: ['chart', 'map', 'image'] },
  ]),
  deckLayout('text-left-quote-right', [
    { key: 'text', land: colLeft('40vw'), port: P_TOP, accepts: ['text', 'bodyText'] },
    { key: 'quote', land: colRight('42vw'), port: P_BOTTOM, accepts: ['quote'] },
  ]),
  deckLayout('image-left-text-right', [
    { key: 'image', land: colLeft('46vw'), port: P_TOP, accepts: ['image', 'imageGrid'] },
    { key: 'text', land: colRight('36vw'), port: P_BOTTOM, accepts: ['text', 'bodyText'] },
  ]),
  deckLayout('stat-left-chart-right', [
    { key: 'stat', land: colLeft('32vw'), port: P_TOP, accepts: ['bigStat', 'keyValue'] },
    { key: 'chart', land: colRight('50vw'), port: P_BOTTOM, accepts: ['chart', 'map'] },
  ]),
  deckLayout('stat-top-chart-below', [
    { key: 'stat', land: rowTop('28vh'), port: P_TOP, accepts: ['bigStat', 'keyValue'] },
    { key: 'chart', land: rowBelow('36vh'), port: P_BOTTOM, accepts: ['chart', 'map'] },
  ]),
  deckLayout('chart-top-text-below', [
    { key: 'chart', land: rowTop('46vh'), port: P_TOP, accepts: ['chart', 'map', 'image'] },
    { key: 'text', land: rowBelow('54vh'), port: P_BOTTOM, accepts: ['text', 'bodyText'] },
  ]),
  // Single centered column. `content` is the named region; `default` (back-compat)
  // still fills the whole safe area.
  {
    name: 'centered',
    stackOnPortrait: true,
    regions: {
      default: { style: DECK_SAFE_AREA },
      content: { style: centeredBox },
    },
    portrait: {
      name: 'centered.portrait',
      regions: {
        default: { style: DECK_SAFE_AREA_PORTRAIT },
        content: { style: DECK_SAFE_AREA_PORTRAIT },
      },
    },
  },
  // `free`: the explicit escape hatch — only the safe-area `default` box; slots
  // self-position via `style.position` + `style.size`.
  {
    name: 'free',
    stackOnPortrait: true,
    regions: { default: { style: DECK_SAFE_AREA } },
    portrait: { name: 'free.portrait', regions: { default: { style: DECK_SAFE_AREA_PORTRAIT } } },
  },
]

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
  ...deckLayouts.map((l): [string, ForegroundLayoutDef] => [l.name, l]),
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
