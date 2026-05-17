import { createContext, useContext } from 'react';
import { defaultTheme, themes } from './themes';
import type { Theme, ThemeName } from './types';

export type ThemeContextValue = {
  themeName: ThemeName;
  theme: Theme;
  setTheme: (name: ThemeName) => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  themeName: defaultTheme,
  theme: themes[defaultTheme],
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
