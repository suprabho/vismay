'use client'

import type { ComponentType } from 'react'
import { EpsteinThemePreview } from '@/app/epstein/EpsteinThemePreview'
import { EnergyProfileThemePreview } from '@/app/energy-profile/EnergyProfileThemePreview'
import { FifaWc26ThemePreview } from '@/app/fifa-wc26/FifaWc26ThemePreview'
import { THEME_REGISTRY_SERVER, type ThemeMeta } from './themeRegistry.server'

export interface ThemeRegistryEntry extends ThemeMeta {
  Preview: ComponentType<{ theme: Record<string, string> }>
}

export const THEME_REGISTRY: Record<string, ThemeRegistryEntry> = {
  epstein: { ...THEME_REGISTRY_SERVER.epstein, Preview: EpsteinThemePreview },
  'energy-profile': { ...THEME_REGISTRY_SERVER['energy-profile'], Preview: EnergyProfileThemePreview },
  'fifa-wc26': { ...THEME_REGISTRY_SERVER['fifa-wc26'], Preview: FifaWc26ThemePreview },
}

export function getThemeEntry(slug: string): ThemeRegistryEntry | null {
  return THEME_REGISTRY[slug] ?? null
}
