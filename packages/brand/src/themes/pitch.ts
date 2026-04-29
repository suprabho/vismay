import type { Theme } from '../types';

export const pitch: Theme = {
  name: 'pitch',
  colors: {
    bg: '#06140C',
    surface: '#0E2517',
    border: '#1B3A26',
    text: '#ECFDF1',
    muted: '#7FA48C',
    accent: '#34D399',
    accentText: '#06140C',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '14px',
    lg: '20px',
    xl: '28px',
    '2xl': '40px',
  },
  radius: {
    none: '0px',
    sm: '6px',
    md: '12px',
    lg: '18px',
    xl: '28px',
    full: '9999px',
  },
  typography: {
    fontFamily: {
      sans: '"Inter", system-ui, sans-serif',
      display: '"Inter", system-ui, sans-serif',
      mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    },
    fontSize: {
      xs: ['12px', '18px'],
      sm: ['14px', '22px'],
      base: ['16px', '26px'],
      lg: ['19px', '28px'],
      xl: ['22px', '30px'],
      '2xl': ['28px', '36px'],
      '3xl': ['34px', '42px'],
    },
    fontWeight: {
      regular: '400',
      medium: '600',
      bold: '800',
    },
  },
};
