import type { Theme } from '../types';

export const terrace: Theme = {
  name: 'terrace',
  scheme: 'light',
  colors: {
    bg: '#FAF7F2',
    surface: '#FFFFFF',
    border: '#E5DFD3',
    text: '#1B1A17',
    muted: '#6B675E',
    accent: '#C2410C',
    accentText: '#FFFFFF',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '36px',
  },
  radius: {
    none: '0px',
    sm: '2px',
    md: '4px',
    lg: '8px',
    xl: '12px',
    full: '9999px',
  },
  typography: {
    fontFamily: {
      sans: '"IBM Plex Sans", Georgia, serif',
      display: '"Playfair Display", Georgia, serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    fontSize: {
      xs: ['12px', '16px'],
      sm: ['14px', '20px'],
      base: ['16px', '24px'],
      lg: ['18px', '26px'],
      xl: ['22px', '30px'],
      '2xl': ['28px', '36px'],
      '3xl': ['36px', '44px'],
    },
    fontWeight: {
      regular: '400',
      medium: '500',
      bold: '700',
    },
  },
};
