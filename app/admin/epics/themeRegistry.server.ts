// Server-safe registry of per-epic theme metadata. Keeps API routes and other
// server contexts free of any client React components (Deck.GL, Mapbox, etc.).
// The client registry in themeRegistry.tsx re-exports this with preview components.

import { EPSTEIN_THEME_DEFAULTS, EPSTEIN_THEME_LABELS } from '@/app/epstein/theme'
import { IEA_THEME_DEFAULTS, IEA_THEME_LABELS } from '@/app/iea/theme'

export interface ThemeMeta {
  defaults: Record<string, string>
  labels: Record<string, { label: string; hint: string }>
}

export const THEME_REGISTRY_SERVER: Record<string, ThemeMeta> = {
  epstein: {
    defaults: EPSTEIN_THEME_DEFAULTS,
    labels: EPSTEIN_THEME_LABELS,
  },
  iea: {
    defaults: IEA_THEME_DEFAULTS,
    labels: IEA_THEME_LABELS,
  },
}

export function getThemeMeta(slug: string): ThemeMeta | null {
  return THEME_REGISTRY_SERVER[slug] ?? null
}
