import type { Config, PluginAPI } from 'tailwindcss/types/config';
import { defaultTheme, themes } from './themes';
import type { Theme, ThemeName } from './types';
import { themeToVars } from './vars';

/**
 * Build a Tailwind preset whose theme keys point to CSS variables. The
 * variables themselves are emitted as a `:root` declaration seeded with
 * `defaultThemeName` (so utility classes work before JS hydrates), and the
 * runtime ThemeProvider rewrites them to switch themes live.
 */
export function brandPreset(opts?: {
  defaultThemeName?: ThemeName;
}): Partial<Config> {
  const seed = themes[opts?.defaultThemeName ?? defaultTheme];
  const seedVars = themeToVars(seed);

  return {
    theme: {
      extend: {
        colors: cssVarMap(seed.colors, 'color'),
        spacing: cssVarMap(seed.spacing, 'spacing'),
        borderRadius: cssVarMap(seed.radius, 'radius'),
        fontFamily: {
          sans: 'var(--sf-font-sans)',
          display: 'var(--sf-font-display)',
          mono: 'var(--sf-font-mono)',
        },
        fontSize: fontSizeVarMap(seed),
        fontWeight: {
          regular: 'var(--sf-weight-regular)',
          medium: 'var(--sf-weight-medium)',
          bold: 'var(--sf-weight-bold)',
        },
      },
    },
    plugins: [
      // Emit seed CSS variables on :root so classes resolve before JS runs.
      function ({ addBase }: PluginAPI) {
        addBase({ ':root': seedVars });
      },
    ],
  };
}

function cssVarMap<T extends Record<string, unknown>>(
  source: T,
  prefix: string,
): Record<keyof T & string, string> {
  const out = {} as Record<keyof T & string, string>;
  for (const key of Object.keys(source) as Array<keyof T & string>) {
    out[key] = `var(--sf-${prefix}-${kebab(key)})`;
  }
  return out;
}

function fontSizeVarMap(theme: Theme): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const key of Object.keys(theme.typography.fontSize)) {
    out[key] = [`var(--sf-text-${key})`, `var(--sf-leading-${key})`];
  }
  return out;
}

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
