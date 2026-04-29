'use client';

import {
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

export type ThemeProviderProps = {
  initialTheme?: ThemeName;
  children: ReactNode;
};

/**
 * Web ThemeProvider. Applies the active theme's CSS variables on a wrapping
 * <div> so descendant Tailwind utilities resolve correctly, and mirrors them
 * on documentElement so styles outside the wrapper (e.g. <body>) follow too.
 */
export function ThemeProvider({
  initialTheme = defaultTheme,
  children,
}: ThemeProviderProps) {
  const [themeName, setTheme] = useState<ThemeName>(initialTheme);

  const value = useMemo(() => {
    return { themeName, theme: themes[themeName], setTheme };
  }, [themeName]);

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
