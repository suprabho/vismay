'use client'

import type { Theme } from '@vismay/viz-engine'
import { labelCls } from './controls'

/**
 * Theme category panel for the share-card composer. Edits the per-card theme
 * override (`composition.theme`) — palette + fonts — which the ThemeProvider
 * turns into the `--color-*` / `--font-*` vars the renderer reads. Shows the
 * EFFECTIVE theme (story / default when there's no override) so it always has a
 * concrete starting point; the first edit promotes that into an override.
 */

/** Curated full-theme presets for one-click application. Fonts are limited to
 *  families the font-import resolver knows (Google + system), so a preset that
 *  changes fonts loads cleanly into both the live preview and the PNG capture. */
interface ThemePreset {
  id: string
  label: string
  theme: Theme
}

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'editorial',
    label: 'Editorial',
    theme: {
      colors: { background: '#f4efe6', text: '#1a1a1a', accent: '#d85a30', accent2: '#3a6ea5', teal: '#3a9e8c', surface: '#e7dfd0', muted: '#6b6b6b', positive: '#3a9e8c', amber: '#e0a93a', red: '#c0392b' },
      fonts: { serif: 'Georgia', sans: '-apple-system, "Segoe UI", Helvetica', mono: 'ui-monospace, Menlo' },
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    theme: {
      colors: { background: '#0d1220', text: '#e4e8f0', accent: '#d9a84a', accent2: '#4f8aa8', teal: '#3a6f8a', surface: '#1a2133', muted: '#7f8a9c', positive: '#46b88a', amber: '#e0a93a', red: '#e0584a' },
      fonts: { serif: 'Playfair Display', sans: 'Inter', mono: 'JetBrains Mono' },
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    theme: {
      colors: { background: '#ffffff', text: '#0a0a0a', accent: '#e5322b', accent2: '#2b6be5', teal: '#1f9e8c', surface: '#f2f2f2', muted: '#737373', positive: '#1f9e6a', amber: '#d99a1f', red: '#e5322b' },
      fonts: { serif: 'Fraunces', sans: 'Geist', mono: 'Geist Mono' },
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    theme: {
      colors: { background: '#11231b', text: '#eef3ec', accent: '#e0a93a', accent2: '#6fae8e', teal: '#3a9e8c', surface: '#1c3328', muted: '#8fa595', positive: '#7bc89b', amber: '#e0a93a', red: '#d9694a' },
      fonts: { serif: 'Lora', sans: 'Work Sans', mono: 'IBM Plex Mono' },
    },
  },
  {
    id: 'sand',
    label: 'Sand',
    theme: {
      colors: { background: '#efe3d2', text: '#3a2f25', accent: '#c4592e', accent2: '#7a6a4f', teal: '#6f8a6a', surface: '#e2d3bd', muted: '#8a7a64', positive: '#6f8a6a', amber: '#cf9a3a', red: '#bf4a32' },
      fonts: { serif: 'EB Garamond', sans: 'Manrope', mono: 'IBM Plex Mono' },
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    theme: {
      colors: { background: '#13171c', text: '#dfe5ec', accent: '#5db0c9', accent2: '#9a7fd1', teal: '#3a9e8c', surface: '#1e242c', muted: '#7c8794', positive: '#4fb88a', amber: '#d9a84a', red: '#d9594a' },
      fonts: { serif: 'Merriweather', sans: 'IBM Plex Sans', mono: 'JetBrains Mono' },
    },
  },
]

/** Always-shown palette tokens, ordered to read the way they compose on screen. */
const CORE_FIELDS: { key: keyof Theme['colors']; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted' },
  { key: 'accent', label: 'Accent' },
  { key: 'accent2', label: 'Accent 2' },
  { key: 'teal', label: 'Teal' },
]

/** Optional semantic tokens, tucked behind a disclosure to keep the panel calm. */
const EXTRA_FIELDS: { key: keyof Theme['colors']; label: string }[] = [
  { key: 'positive', label: 'Positive' },
  { key: 'amber', label: 'Amber' },
  { key: 'red', label: 'Red' },
  { key: 'line', label: 'Line' },
]

const FONT_PRESETS: Record<'serif' | 'sans' | 'mono', string[]> = {
  serif: ['Merriweather', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'Lora', 'EB Garamond', 'Georgia'],
  sans: ['Inter', 'Geist', 'IBM Plex Sans', 'Work Sans', 'Manrope'],
  mono: ['JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'Geist Mono'],
}

/** Coerce a CSS color to 6-digit hex for the native color input (mirrors the
 *  helper in ./controls; kept local so the font-stack strings don't break it). */
function toHex6(v: string): string {
  const s = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  const m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`
  return '#ffffff'
}

export function ThemePanel({
  theme,
  isOverride,
  storyAttached,
  onChange,
  onReset,
}: {
  /** Effective theme to display (the override, or the story/default fallback). */
  theme: Theme
  /** Whether `composition.theme` is set (vs. inheriting story/default). */
  isOverride: boolean
  /** Whether a story is attached (changes the reset affordance copy). */
  storyAttached: boolean
  onChange: (next: Theme) => void
  onReset: () => void
}) {
  const setColor = (key: keyof Theme['colors'], v: string) =>
    onChange({ ...theme, colors: { ...theme.colors, [key]: v } })
  const setFont = (key: keyof Theme['fonts'], v: string) =>
    onChange({ ...theme, fonts: { ...theme.fonts, [key]: v } })

  // A preset is "active" when its palette matches the current one (fonts can be
  // tweaked independently, so colors alone decide the highlight).
  const activePresetId = THEME_PRESETS.find(
    (p) => JSON.stringify(p.theme.colors) === JSON.stringify(theme.colors),
  )?.id

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <span className={labelCls}>Presets</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.theme)}
              title={`Apply the ${p.label} theme`}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                activePresetId === p.id
                  ? 'border-sky-400/60 bg-white/10 text-neutral-100'
                  : 'border-white/10 text-neutral-300 hover:bg-white/5'
              }`}
            >
              <span className="flex shrink-0 overflow-hidden rounded-sm border border-white/15">
                {[p.theme.colors.background, p.theme.colors.accent, p.theme.colors.text].map((c, i) => (
                  <span key={i} style={{ background: c }} className="h-4 w-2.5" />
                ))}
              </span>
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Override banner + reset */}
      {isOverride && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-sky-400/30 bg-sky-400/5 px-2.5 py-1.5">
          <span className="min-w-0 truncate text-[10px] text-sky-200/90">
            {storyAttached ? 'Overriding the story theme' : 'Custom theme'}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            {storyAttached ? 'Use story theme' : 'Reset'}
          </button>
        </div>
      )}

      {/* Colors */}
      <div className="space-y-2">
        <span className={labelCls}>Colors</span>
        <div className="space-y-1.5">
          {CORE_FIELDS.map((f) => (
            <ColorRow key={f.key} label={f.label} value={theme.colors[f.key] ?? '#000000'} onChange={(v) => setColor(f.key, v)} />
          ))}
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] text-neutral-500 transition-colors hover:text-neutral-300">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> Semantic colors
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {EXTRA_FIELDS.map((f) => (
              <ColorRow key={f.key} label={f.label} value={theme.colors[f.key] ?? '#000000'} onChange={(v) => setColor(f.key, v)} />
            ))}
          </div>
        </details>
      </div>

      {/* Fonts */}
      <div className="space-y-2">
        <span className={labelCls}>Fonts</span>
        <div className="space-y-1.5">
          {(['serif', 'sans', 'mono'] as const).map((k) => (
            <FontRow key={k} label={k} value={theme.fonts[k]} presets={FONT_PRESETS[k]} onChange={(v) => setFont(k, v)} />
          ))}
        </div>
        <p className="text-[10px] text-neutral-600">
          Any project-loaded font renders; unknown names fall back. System stacks need no import.
        </p>
      </div>
    </div>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={toHex6(value)}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} color`}
        className="h-7 w-9 shrink-0 rounded border border-white/10 bg-transparent"
      />
      <span className="w-16 shrink-0 text-[11px] text-neutral-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 font-mono text-[11px] text-neutral-100 outline-none focus:border-white/30"
      />
    </div>
  )
}

function FontRow({
  label,
  value,
  presets,
  onChange,
}: {
  label: string
  value: string
  presets: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] capitalize text-neutral-400">{label}</span>
      <input
        list={`tp-font-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-100 outline-none focus:border-white/30"
      />
      <datalist id={`tp-font-${label}`}>
        {presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  )
}
