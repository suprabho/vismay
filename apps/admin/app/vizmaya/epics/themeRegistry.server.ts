// Server-safe registry of per-epic theme metadata. Keeps API routes and other
// server contexts free of any client React components (Deck.GL, Mapbox, etc.).
// The client registry in themeRegistry.tsx re-exports this with preview components.

import { EPSTEIN_THEME_DEFAULTS, EPSTEIN_THEME_LABELS } from '@/app/epstein/theme'
import { ENERGY_PROFILE_THEME_DEFAULTS, ENERGY_PROFILE_THEME_LABELS } from '@/app/energy-profile/theme'
import { FIFA_WC26_THEME_DEFAULTS, FIFA_WC26_THEME_LABELS } from '@/app/fifa-wc26/theme'
import { WALLET_GEO_THEME_DEFAULTS, WALLET_GEO_THEME_LABELS } from '@/app/wallet-geo/theme'

export interface ThemeMeta {
  defaults: Record<string, string>
  labels: Record<string, { label: string; hint: string }>
}

export const THEME_REGISTRY_SERVER: Record<string, ThemeMeta> = {
  epstein: {
    defaults: EPSTEIN_THEME_DEFAULTS,
    labels: EPSTEIN_THEME_LABELS,
  },
  'energy-profile': {
    defaults: ENERGY_PROFILE_THEME_DEFAULTS,
    labels: ENERGY_PROFILE_THEME_LABELS,
  },
  'fifa-wc26': {
    defaults: FIFA_WC26_THEME_DEFAULTS,
    labels: FIFA_WC26_THEME_LABELS,
  },
  'wallet-geo': {
    defaults: WALLET_GEO_THEME_DEFAULTS,
    labels: WALLET_GEO_THEME_LABELS,
  },
}

export function getThemeMeta(slug: string): ThemeMeta | null {
  return THEME_REGISTRY_SERVER[slug] ?? null
}
