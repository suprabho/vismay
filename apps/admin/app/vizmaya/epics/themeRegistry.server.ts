// Server-safe registry of per-epic theme metadata. Keeps API routes and other
// server contexts free of any client React components (Deck.GL, Mapbox, etc.).
// The client registry in themeRegistry.tsx re-exports this with preview components.

import { COKE_STUDIO_THEME_DEFAULTS, COKE_STUDIO_THEME_LABELS } from '@/app/coke-studio/theme'
import { EPSTEIN_THEME_DEFAULTS, EPSTEIN_THEME_LABELS } from '@/app/epstein/theme'
import { ENERGY_PROFILE_THEME_DEFAULTS, ENERGY_PROFILE_THEME_LABELS } from '@/app/energy-profile/theme'
import { FIFA_WC26_THEME_DEFAULTS, FIFA_WC26_THEME_LABELS } from '@/app/fifa-wc26/theme'
import { WALLET_GEO_THEME_DEFAULTS, WALLET_GEO_THEME_LABELS } from '@/app/wallet-geo/theme'

export interface ThemeFontDefaults {
  serif: string
  sans: string
  mono: string
}

export interface ThemeMeta {
  defaults: Record<string, string>
  labels: Record<string, { label: string; hint: string }>
  fontDefaults: ThemeFontDefaults
  mapStyleDefault: string
}

// Shared defaults across all epics. Per-epic theme.ts files can override these
// later if a specific epic needs a different starting palette for fonts or the
// base Mapbox style.
const SHARED_FONT_DEFAULTS: ThemeFontDefaults = {
  serif: 'Merriweather',
  sans: 'Inter',
  mono: 'JetBrains Mono',
}
const SHARED_MAP_STYLE_DEFAULT = 'mapbox://styles/mapbox/dark-v11'

export const THEME_REGISTRY_SERVER: Record<string, ThemeMeta> = {
  'coke-studio': {
    defaults: COKE_STUDIO_THEME_DEFAULTS,
    labels: COKE_STUDIO_THEME_LABELS,
    fontDefaults: SHARED_FONT_DEFAULTS,
    mapStyleDefault: SHARED_MAP_STYLE_DEFAULT,
  },
  epstein: {
    defaults: EPSTEIN_THEME_DEFAULTS,
    labels: EPSTEIN_THEME_LABELS,
    fontDefaults: SHARED_FONT_DEFAULTS,
    mapStyleDefault: SHARED_MAP_STYLE_DEFAULT,
  },
  'energy-profile': {
    defaults: ENERGY_PROFILE_THEME_DEFAULTS,
    labels: ENERGY_PROFILE_THEME_LABELS,
    fontDefaults: SHARED_FONT_DEFAULTS,
    mapStyleDefault: SHARED_MAP_STYLE_DEFAULT,
  },
  'fifa-wc26': {
    defaults: FIFA_WC26_THEME_DEFAULTS,
    labels: FIFA_WC26_THEME_LABELS,
    fontDefaults: SHARED_FONT_DEFAULTS,
    mapStyleDefault: SHARED_MAP_STYLE_DEFAULT,
  },
  'wallet-geo': {
    defaults: WALLET_GEO_THEME_DEFAULTS,
    labels: WALLET_GEO_THEME_LABELS,
    fontDefaults: SHARED_FONT_DEFAULTS,
    mapStyleDefault: SHARED_MAP_STYLE_DEFAULT,
  },
}

export function getThemeMeta(slug: string): ThemeMeta | null {
  return THEME_REGISTRY_SERVER[slug] ?? null
}
