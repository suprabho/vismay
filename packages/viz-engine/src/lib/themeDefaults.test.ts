/** Throwaway check: theme validators + the built-in presets stay valid.
 *  (run: npx tsx packages/viz-engine/src/lib/themeDefaults.test.ts) */
import {
  DEFAULT_THEME,
  STORY_THEME_PRESETS,
  builtinDefaultThemeFor,
  builtinThemePresetsFor,
  fillTheme,
  isDarkTheme,
  normalizeTheme,
  themeColorsKey,
} from './themeDefaults'

let failed = 0
function ok(label: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failed++
}

// Every seed is a complete, valid theme and round-trips unchanged.
for (const p of STORY_THEME_PRESETS) {
  const n = normalizeTheme(p.theme)
  ok(`seed ${p.slug}: valid`, n !== null)
  // Same tokens + fonts (key order is the validator's, not the literal's).
  ok(
    `seed ${p.slug}: round-trips`,
    n !== null &&
      themeColorsKey(n) === themeColorsKey(p.theme) &&
      Object.keys(n.colors).length === Object.keys(p.theme.colors).length &&
      JSON.stringify(n.fonts) === JSON.stringify(p.theme.fonts),
  )
}
ok('DEFAULT_THEME valid', normalizeTheme(DEFAULT_THEME) !== null)

// Exactly one default per app among the seeds; shared seeds are never default.
const defaults = STORY_THEME_PRESETS.filter((p) => p.isDefault)
ok('one default per app', new Set(defaults.map((p) => p.appSlug)).size === defaults.length)
ok('no shared default', defaults.every((p) => p.appSlug !== null))
ok('footshorts default = classic', builtinDefaultThemeFor('footshorts') === STORY_THEME_PRESETS[0]!.theme)
ok('vizf1 default = paddock', builtinDefaultThemeFor('vizf1')?.colors.accent === '#ff4346')
ok('unknown app has no builtin default', builtinDefaultThemeFor('umami') === null)
ok('footshorts sees 3 presets', builtinThemePresetsFor('footshorts').length === 3)
ok('vizf1 sees 1 preset', builtinThemePresetsFor('vizf1').length === 1)

// Validation rules.
ok('rejects bad hex', normalizeTheme({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, accent: 'red' } }) === null)
ok('rejects missing required', normalizeTheme({ colors: { background: '#000' }, fonts: DEFAULT_THEME.fonts }) === null)
ok('rejects empty font', normalizeTheme({ ...DEFAULT_THEME, fonts: { ...DEFAULT_THEME.fonts, sans: '' } }) === null)
ok('rejects long font', normalizeTheme({ ...DEFAULT_THEME, fonts: { ...DEFAULT_THEME.fonts, sans: 'x'.repeat(61) } }) === null)
ok('rejects non-object', normalizeTheme('nope') === null && normalizeTheme(null) === null)
const dropped = normalizeTheme({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, line: '', amber: 'bad' } })
ok('drops empty/invalid optional', dropped !== null && !('line' in dropped.colors) && !('amber' in dropped.colors))
ok('trims + keeps 3-digit hex', normalizeTheme({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, accent: ' #abc ' } })?.colors.accent === '#abc')

// fillTheme never leaves a required key missing.
const filled = fillTheme({ colors: { background: '#111111' } as never })
ok('fillTheme fills required', filled.colors.text === DEFAULT_THEME.colors.text && filled.colors.background === '#111111')
ok('fillTheme fills fonts', fillTheme(undefined).fonts.sans === 'Inter')

// Dark detection.
ok('classic is dark', isDarkTheme(STORY_THEME_PRESETS[0]!.theme))
ok('pitch is dark', isDarkTheme(STORY_THEME_PRESETS[1]!.theme))
ok('terrace is light', !isDarkTheme(STORY_THEME_PRESETS[2]!.theme))
ok('paddock is dark', isDarkTheme(STORY_THEME_PRESETS[3]!.theme))
ok('DEFAULT_THEME is light', !isDarkTheme(DEFAULT_THEME))

// Palette identity ignores fonts, case, key order and unset optionals.
const a = STORY_THEME_PRESETS[0]!.theme
const b = { colors: Object.fromEntries(Object.entries(a.colors).reverse().map(([k, v]) => [k, v.toUpperCase()])), fonts: { serif: 'x', sans: 'y', mono: 'z' } } as typeof a
ok('themeColorsKey stable', themeColorsKey(a) === themeColorsKey(b))
ok('themeColorsKey differs across presets', themeColorsKey(a) !== themeColorsKey(STORY_THEME_PRESETS[1]!.theme))

console.log(failed === 0 ? '\nall passed' : `\n${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
