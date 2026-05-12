'use client'

import type { ComponentType } from 'react'
import { EpsteinThemePreview } from '@/app/epstein/EpsteinThemePreview'
import { IeaThemePreview } from '@/app/iea/IeaThemePreview'
import { THEME_REGISTRY_SERVER, type ThemeMeta } from './themeRegistry.server'

export interface ThemeRegistryEntry extends ThemeMeta {
  Preview: ComponentType<{ theme: Record<string, string> }>
}

export const THEME_REGISTRY: Record<string, ThemeRegistryEntry> = {
  epstein: { ...THEME_REGISTRY_SERVER.epstein, Preview: EpsteinThemePreview },
  iea: { ...THEME_REGISTRY_SERVER.iea, Preview: IeaThemePreview },
}

export function getThemeEntry(slug: string): ThemeRegistryEntry | null {
  return THEME_REGISTRY[slug] ?? null
}
