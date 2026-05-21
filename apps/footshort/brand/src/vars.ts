import type { Theme } from './types';

/**
 * Map a theme to a flat dictionary of CSS variable name -> value.
 * Variable names are stable across themes; only the values change,
 * which is what enables runtime theme switching.
 */
export function themeToVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--sf-color-${kebab(key)}`] = hexToRgbChannels(value);
  }
  for (const [key, value] of Object.entries(theme.spacing)) {
    vars[`--sf-spacing-${key}`] = value;
  }
  for (const [key, value] of Object.entries(theme.radius)) {
    vars[`--sf-radius-${key}`] = value;
  }
  for (const [key, value] of Object.entries(theme.typography.fontFamily)) {
    vars[`--sf-font-${key}`] = value;
  }
  for (const [key, [size, lh]] of Object.entries(theme.typography.fontSize)) {
    vars[`--sf-text-${key}`] = size;
    vars[`--sf-leading-${key}`] = lh;
  }
  for (const [key, value] of Object.entries(theme.typography.fontWeight)) {
    vars[`--sf-weight-${key}`] = value;
  }

  return vars;
}

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// Convert "#RRGGBB" / "#RGB" to "R G B" channels so Tailwind utilities can
// splice an alpha (`bg-accent/20`) via `rgb(var(...) / <alpha-value>)`.
function hexToRgbChannels(hex: string): string {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `${r} ${g} ${b}`;
}
