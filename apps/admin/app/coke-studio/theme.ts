// Admin-side mirror of the /coke-studio theme. The admin doesn't render the
// actual epic map, only the theme editor — so this copy intentionally drops
// the map-style resolver and the palette helper. The fields admin reads:
//   - COKE_STUDIO_THEME_DEFAULTS — seed values for the editor
//   - COKE_STUDIO_THEME_LABELS   — display labels in the editor's swatch grid
//   - CokeStudioTheme            — type for the ThemePreview prop
//
// Source of truth: apps/vizmaya-fyi/app/coke-studio/theme.ts. Keep in sync
// when adding or renaming theme keys.

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
  accent: '#f4a82e',
  accentMid: '#ffc56a',
  accentHi: '#ffe1a3',
  accentLo: '#a26a16',
  accentEdge: '#fff5d6',
  pinSettlement: '#f4a82e',
  pinSacred: '#e85d75',
  pinNature: '#7fc8a9',
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
