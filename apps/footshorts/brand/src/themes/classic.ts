import type { Theme } from '../types';

export const classic: Theme = {
  name: 'classic',
  scheme: 'dark',
  colors: {
    bg: '#0B0B0F',
    surface: '#16161D',
    border: '#24242E',
    text: '#F4F4F5',
    muted: '#8E8E99',
    accent: '#00D26A',
    accentText: '#0B0B0F',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
  },
  radius: {
    none: '0px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '20px',
    full: '9999px',
  },
  typography: {
    fontFamily: {
      sans: 'System, -apple-system, "Segoe UI", Roboto, sans-serif',
      display: 'System, -apple-system, "Segoe UI", Roboto, sans-serif',
      mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    },
    fontSize: {
      xs: ['12px', '16px'],
      sm: ['14px', '20px'],
      base: ['16px', '24px'],
      lg: ['18px', '26px'],
      xl: ['20px', '28px'],
      '2xl': ['24px', '32px'],
      '3xl': ['30px', '36px'],
    },
    fontWeight: {
      regular: '400',
      medium: '500',
      bold: '700',
    },
  },
};
