import type { Theme, ThemeName } from '../types';
import { classic } from './classic';
import { pitch } from './pitch';
import { terrace } from './terrace';

export const themes: Record<ThemeName, Theme> = {
  classic,
  pitch,
  terrace,
};

export { classic, pitch, terrace };

export const defaultTheme: ThemeName = 'classic';
