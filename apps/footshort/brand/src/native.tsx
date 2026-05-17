import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
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
 * Native ThemeProvider. Uses NativeWind's `vars()` to expose CSS variables
 * to descendants, mirroring the web provider so utility classes that
 * reference var(--sf-*) resolve to the active theme on both platforms.
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

  const style = useMemo(() => vars(themeToVars(themes[themeName])), [themeName]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export { useTheme } from './context';
