'use client';

import { useMemo, type ReactNode } from 'react';
import {
  ThemeProvider as BrandThemeProvider,
  type ThemeStorage,
} from '@shortfoot/brand/web';
import type { ThemeName } from '@shortfoot/brand';

const STORAGE_KEY = 'sf:theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const storage = useMemo<ThemeStorage>(
    () => ({
      load: () => {
        if (typeof window === 'undefined') return null;
        return (window.localStorage.getItem(STORAGE_KEY) as ThemeName | null) ?? null;
      },
      save: (name) => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STORAGE_KEY, name);
      },
    }),
    [],
  );

  return <BrandThemeProvider storage={storage}>{children}</BrandThemeProvider>;
}
