// Palette for the /coke-studio epic landing. A qawwali-night scheme —
// midnight indigo ground with saffron/marigold accents, evoking string lights
// at a sufi shrine. Picked to sit visually apart from the warm-beige Energy
// Profile and the cyber-teal Wallet Geography palettes.
//
// Admin overrides per epic row in the `epics.theme` JSONB column win over
// these defaults. The resolver below merges any override that's a valid hex
// string back over the defaults.

import type { MapPalette } from '@vismay/viz-engine'

export type CokeStudioTheme = {
  ink: string
  surface: string
  elevated: string
  bone: string
  muted: string
  line: string
  accent: string
  accentMid: string
  accentHi: string
  accentLo: string
  accentEdge: string
  // Pin colour-by-category. The landing groups the 9 gazetteer place_type
  // values into three visual buckets — settlement, sacred, nature — so the
  // pin legend stays parseable.
  pinSettlement: string
  pinSacred: string
  pinNature: string
  mapLand: string
  mapWater: string
  mapBorder: string
  mapLabelText: string
  mapLabelHalo: string
  mapBuilding: string
}

export const COKE_STUDIO_THEME_DEFAULTS: CokeStudioTheme = {
  ink: '#0a0f1e',
  surface: '#111729',
  elevated: '#1a2238',
  bone: '#f3ede0',
  muted: '#8a8e9c',
  line: '#222b44',
  accent: '#f4a82e', // saffron — primary accent (selected pin, story chips hover)
  accentMid: '#ffc56a', // marigold — hovered pin
  accentHi: '#ffe1a3', // pale gold — selected pin core / labels
  accentLo: '#a26a16', // burnt amber — low-mention pin fill
  accentEdge: '#fff5d6', // ivory — pin stroke
  pinSettlement: '#f4a82e', // saffron — cities, provinces, countries
  pinSacred: '#e85d75', // rose — shrines, historical (Coke red, softened)
  pinNature: '#7fc8a9', // pistachio — rivers, mountains, deserts
  mapLand: '#111729',
  mapWater: '#0a0f1e',
  mapBorder: '#222b44',
  mapLabelText: '#f3ede0',
  mapLabelHalo: '#0a0f1e',
  mapBuilding: '#1a2238',
}

export const COKE_STUDIO_THEME_LABELS: Record<keyof CokeStudioTheme, { label: string; hint: string }> = {
  ink: { label: 'Ink', hint: 'Page background, text halo' },
  surface: { label: 'Surface', hint: 'Side panel background' },
  elevated: { label: 'Elevated', hint: 'Card / hover state' },
  bone: { label: 'Bone', hint: 'Primary text, logo' },
  muted: { label: 'Muted', hint: 'Secondary text' },
  line: { label: 'Line', hint: 'Dividers and borders' },
  accent: { label: 'Accent', hint: 'Saffron — primary accent' },
  accentMid: { label: 'Accent Mid', hint: 'Hovered pin' },
  accentHi: { label: 'Accent High', hint: 'Selected pin core / labels' },
  accentLo: { label: 'Accent Low', hint: 'Low-mention pin fill' },
  accentEdge: { label: 'Accent Edge', hint: 'Pin stroke + label text' },
  pinSettlement: { label: 'Pin Settlement', hint: 'Cities, provinces, countries' },
  pinSacred: { label: 'Pin Sacred', hint: 'Shrines and historical places' },
  pinNature: { label: 'Pin Nature', hint: 'Rivers, mountains, deserts' },
  mapLand: { label: 'Map Land', hint: 'Country / land fill on the base map' },
  mapWater: { label: 'Map Water', hint: 'Ocean + waterway fill' },
  mapBorder: { label: 'Map Border', hint: 'Country boundary lines' },
  mapLabelText: { label: 'Map Label Text', hint: 'Country / place label color' },
  mapLabelHalo: { label: 'Map Label Halo', hint: 'Outline behind label text' },
  mapBuilding: { label: 'Map Building', hint: '3D / 2D building fill' },
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function resolveCokeStudioTheme(override: unknown): CokeStudioTheme {
  if (!override || typeof override !== 'object') return COKE_STUDIO_THEME_DEFAULTS
  const out: CokeStudioTheme = { ...COKE_STUDIO_THEME_DEFAULTS }
  for (const key of Object.keys(COKE_STUDIO_THEME_DEFAULTS) as (keyof CokeStudioTheme)[]) {
    const v = (override as Record<string, unknown>)[key]
    if (typeof v === 'string' && HEX.test(v)) out[key] = v
  }
  return out
}

export const COKE_STUDIO_MAP_STYLE_DEFAULT = 'mapbox://styles/mapbox/dark-v11'

export function resolveCokeStudioMapStyle(override: unknown): string {
  if (!override || typeof override !== 'object') return COKE_STUDIO_MAP_STYLE_DEFAULT
  const v = (override as Record<string, unknown>).mapStyle
  return typeof v === 'string' && v.length > 0 ? v : COKE_STUDIO_MAP_STYLE_DEFAULT
}

export function cokeStudioMapPalette(theme: CokeStudioTheme): MapPalette {
  return {
    land: theme.mapLand,
    water: theme.mapWater,
    border: theme.mapBorder,
    labelText: theme.mapLabelText,
    labelHalo: theme.mapLabelHalo,
    building: theme.mapBuilding,
  }
}

export function cokeStudioLogoPalette(theme: CokeStudioTheme) {
  return {
    text: theme.bone,
    teal: theme.accentMid,
    accent: theme.accent,
    accent2: theme.accentHi,
    surface: theme.surface,
    muted: theme.muted,
    line: theme.bone,
  }
}

// Group the 9 gazetteer place_type values into three visual buckets so the
// pin legend stays small. The landing reads this and exposes one colour per
// bucket — keeps the map legible at low zoom where a 9-colour key would be
// noise.
export const SETTLEMENT_TYPES = ['city', 'region', 'province', 'country'] as const
export const SACRED_TYPES = ['shrine', 'historical'] as const
export const NATURE_TYPES = ['river', 'mountain', 'desert'] as const

export type PinCategory = 'settlement' | 'sacred' | 'nature'

export function pinCategoryFor(placeType: string): PinCategory {
  if ((SACRED_TYPES as readonly string[]).includes(placeType)) return 'sacred'
  if ((NATURE_TYPES as readonly string[]).includes(placeType)) return 'nature'
  return 'settlement'
}

export function pinColorFor(theme: CokeStudioTheme, placeType: string): string {
  const cat = pinCategoryFor(placeType)
  if (cat === 'sacred') return theme.pinSacred
  if (cat === 'nature') return theme.pinNature
  return theme.pinSettlement
}
