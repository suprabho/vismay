import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { ThemeContext } from './context';
import { defaultTheme, themes } from './themes';
import type { ThemeName } from './types';
import { themeToVars } from './vars';

export type ThemeProviderProps = {
  initialTheme?: ThemeName;
  children: ReactNode;
};

/**
 * Native ThemeProvider. Uses NativeWind's `vars()` to expose CSS variables
 * to descendants, mirroring the web provider so utility classes that
 * reference var(--sf-*) resolve to the active theme on both platforms.
 */
export function ThemeProvider({
  initialTheme = defaultTheme,
  children,
}: ThemeProviderProps) {
  const [themeName, setTheme] = useState<ThemeName>(initialTheme);

  const value = useMemo(() => {
    return { themeName, theme: themes[themeName], setTheme };
  }, [themeName]);

  const style = useMemo(() => vars(themeToVars(themes[themeName])), [themeName]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export { useTheme } from './context';
