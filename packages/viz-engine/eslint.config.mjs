import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Engine-isolation guardrails for the parallel D3 / ECharts setup.
 *
 * The folder split (charts/echarts, charts/d3, charts/_shared) only buys clean
 * code-splitting if one engine's imports can't leak into the other. These
 * `no-restricted-imports` rules enforce that mechanically so a story that uses
 * only one engine ships only that engine's JS.
 *
 * Syntax-only lint (no type-aware rules), so the parser runs without a
 * TS project — fast, and `eslint src` reports nothing unless a guardrail trips.
 */
const D3_PATTERNS = ['d3', 'd3-*', '@observablehq/plot']
const ECHARTS_PATTERNS = ['echarts', 'echarts-*', 'echarts/*']

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/.next/**']),
  {
    files: ['src/**/*.{ts,tsx}'],
    // Register the TS plugin so pre-existing `eslint-disable` comments that
    // name `@typescript-eslint/*` rules resolve, but leave its rules off — this
    // config only enforces the engine-isolation guardrails below.
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['src/charts/echarts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: D3_PATTERNS, message: 'ECharts charts must not import D3/Plot. Put D3 charts in charts/d3/.' }] },
      ],
    },
  },
  {
    files: ['src/charts/d3/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ECHARTS_PATTERNS, message: 'D3 charts must not import ECharts. Put ECharts charts in charts/echarts/.' }] },
      ],
    },
  },
  {
    files: ['src/charts/_shared/**/*.{ts,tsx}', 'src/lib/chartTheme.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: [...D3_PATTERNS, ...ECHARTS_PATTERNS], message: 'This module is engine-agnostic — it must not import ECharts or D3.' },
          ],
        },
      ],
    },
  },
])
