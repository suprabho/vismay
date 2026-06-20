'use client'

import { themes } from '@footshorts/brand'
import type { ColorTokens, Theme, ThemeName } from '@footshorts/brand'
import type { CardThemeOverride } from '../types'
import { labelCls, toHex6 } from './controls'

/**
 * Theme category panel for the footshorts share-card composer. Picks a base
 * preset (classic / pitch / terrace) and layers per-token color + font overrides
 * on top, emitted as a sparse `CardThemeOverride`. The canvas resolves it to a
 * full `Theme` (`resolveTheme`) and feeds `themeToVars`, so the override drives
 * the same `--sf-color-*` / `--sf-font-*` (+ un-prefixed `--font-*`) the card and
 * the html-to-image capture read.
 */

const PRESETS: ThemeName[] = ['classic', 'pitch', 'terrace']

/** Always-shown palette tokens, ordered the way they compose on screen. */
const CORE_FIELDS: { key: keyof ColorTokens; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted' },
  { key: 'brand', label: 'Brand' },
  { key: 'accent', label: 'Accent' },
]

/** Secondary tokens, tucked behind a disclosure to keep the panel calm. */
const EXTRA_FIELDS: { key: keyof ColorTokens; label: string }[] = [
  { key: 'border', label: 'Border' },
  { key: 'brandText', label: 'On brand' },
  { key: 'accentText', label: 'On accent' },
]

/** Families the font-import resolver knows (Google + the footshorts brand set),
 *  so a chosen font loads cleanly into both the live preview and the PNG. */
const FONT_PRESETS: Record<'sans' | 'display' | 'mono', string[]> = {
  sans: ['Space Grotesk', 'Inter', 'Manrope', 'IBM Plex Sans', 'Work Sans'],
  display: ['Forum', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'Lora'],
  mono: ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code'],
}

export function ThemePanel({
  theme,
  themeName,
  override,
  onPickPreset,
  onChange,
  onReset,
}: {
  /** Effective resolved theme to display (base preset + any override). */
  theme: Theme
  /** Selected base preset (the override layers on top of this). */
  themeName: ThemeName
  /** Current sparse override, if any. */
  override: CardThemeOverride | undefined
  /** Pick a base preset — clears the override for a clean preset. */
  onPickPreset: (name: ThemeName) => void
  onChange: (next: CardThemeOverride) => void
  onReset: () => void
}) {
  const isOverride = !!(override?.colors || override?.fonts)

  const setColor = (key: keyof ColorTokens, v: string) =>
    onChange({
      base: themeName,
      colors: { ...(override?.colors ?? {}), [key]: v },
      fonts: override?.fonts,
    })
  const setFont = (slot: 'sans' | 'display' | 'mono', v: string) =>
    onChange({
      base: themeName,
      colors: override?.colors,
      fonts: { ...(override?.fonts ?? {}), [slot]: v },
    })

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <span className={labelCls}>Presets</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {PRESETS.map((name) => {
            const p = themes[name]
            const active = !isOverride && themeName === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => onPickPreset(name)}
                title={`Apply the ${name} theme`}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] capitalize transition-colors ${
                  active
                    ? 'border-sky-400/60 bg-white/10 text-neutral-100'
                    : 'border-white/10 text-neutral-300 hover:bg-white/5'
                }`}
              >
                <span className="flex shrink-0 overflow-hidden rounded-sm border border-white/15">
                  {[p.colors.bg, p.colors.brand, p.colors.text].map((c, i) => (
                    <span key={i} style={{ background: c }} className="h-4 w-2" />
                  ))}
                </span>
                <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Override banner + reset */}
      {isOverride && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-sky-400/30 bg-sky-400/5 px-2.5 py-1.5">
          <span className="min-w-0 truncate text-[10px] text-sky-200/90">
            Custom theme · over {themeName}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            Reset
          </button>
        </div>
      )}

      {/* Colors */}
      <div className="space-y-2">
        <span className={labelCls}>Colors</span>
        <div className="space-y-1.5">
          {CORE_FIELDS.map((f) => (
            <ColorRow key={f.key} label={f.label} value={theme.colors[f.key]} onChange={(v) => setColor(f.key, v)} />
          ))}
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] text-neutral-500 transition-colors hover:text-neutral-300">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span> More colors
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {EXTRA_FIELDS.map((f) => (
              <ColorRow key={f.key} label={f.label} value={theme.colors[f.key]} onChange={(v) => setColor(f.key, v)} />
            ))}
          </div>
        </details>
      </div>

      {/* Fonts */}
      <div className="space-y-2">
        <span className={labelCls}>Fonts</span>
        <div className="space-y-1.5">
          {(['sans', 'display', 'mono'] as const).map((slot) => (
            <FontRow
              key={slot}
              label={slot}
              value={theme.typography.fontFamily[slot]}
              presets={FONT_PRESETS[slot]}
              onChange={(v) => setFont(slot, v)}
            />
          ))}
        </div>
        <p className="text-[10px] text-neutral-600">
          Known Google families load automatically; system stacks need no import.
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
        list={`fs-tp-font-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-100 outline-none focus:border-white/30"
      />
      <datalist id={`fs-tp-font-${label}`}>
        {presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  )
}
