'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ThemeContext } from './context';
import { defaultTheme, themes } from './themes';
import type { ThemeName } from './types';
import { themeToVars } from './vars';

export type ThemeStorage = {
  load: () => ThemeName | null | Promise<ThemeName | null>;
  save: (name: ThemeName) => void | Promise<void>;
};

export type ThemeProviderProps = {
  initialTheme?: ThemeName;
  storage?: ThemeStorage;
  children: ReactNode;
};

/**
 * Web ThemeProvider. Applies the active theme's CSS variables on a wrapping
 * <div> so descendant Tailwind utilities resolve correctly, and mirrors them
 * on documentElement so styles outside the wrapper (e.g. <body>) follow too.
 *
 * If `storage` is provided, the provider rehydrates from it on mount and
 * persists every theme change.
 */
export function ThemeProvider({
  initialTheme = defaultTheme,
  storage,
  children,
}: ThemeProviderProps) {
  const [themeName, setThemeState] = useState<ThemeName>(initialTheme);

  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    Promise.resolve(storage.load()).then((name) => {
      if (cancelled || !name) return;
      if (name in themes) setThemeState(name);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setTheme = useCallback(
    (name: ThemeName) => {
      setThemeState(name);
      if (storage) void Promise.resolve(storage.save(name));
    },
    [storage],
  );

  const value = useMemo(() => {
    return { themeName, theme: themes[themeName], setTheme };
  }, [themeName, setTheme]);

  const varMap = useMemo(() => themeToVars(themes[themeName]), [themeName]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(varMap)) {
      root.style.setProperty(k, v);
    }
  }, [varMap]);

  return (
    <ThemeContext.Provider value={value}>
      <div style={varMap as CSSProperties} data-sf-theme={themeName}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export { useTheme } from './context';
