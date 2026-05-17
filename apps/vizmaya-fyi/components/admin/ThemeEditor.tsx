'use client'

import { useMemo, useEffect, useState } from 'react'
import type { Theme } from '@/types/story'
import { getFontImportUrl } from '@/lib/getFontImports'

interface Props {
  theme: Partial<Theme> | undefined
  onChange: (next: Theme) => void
}

/** Ordered so color swatches read left-to-right the way they compose on screen. */
const COLOR_FIELDS: {
  key: keyof Theme['colors']
  label: string
  required: boolean
  hint?: string
}[] = [
  { key: 'background', label: 'Background', required: true },
  { key: 'surface', label: 'Surface', required: true, hint: 'cards & panels' },
  { key: 'text', label: 'Text', required: true },
  { key: 'muted', label: 'Muted', required: true, hint: 'secondary text' },
  { key: 'line', label: 'Line', required: false, hint: 'borders' },
  { key: 'accent', label: 'Accent', required: true },
  { key: 'accent2', label: 'Accent 2', required: true },
  { key: 'teal', label: 'Teal', required: true },
  { key: 'positive', label: 'Positive', required: false },
  { key: 'amber', label: 'Amber', required: false },
  { key: 'red', label: 'Red', required: false },
]

const FONT_PRESETS: { serif: string[]; sans: string[]; mono: string[] } = {
  serif: ['Merriweather', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'Lora', 'EB Garamond'],
  sans: ['Inter', 'Geist', 'IBM Plex Sans', 'Work Sans', 'Manrope'],
  mono: ['JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'Geist Mono'],
}

const EMPTY_THEME: Theme = {
  colors: {
    background: '#0d1220',
    text: '#e4e8f0',
    accent: '#d9a84a',
    accent2: '#4f8aa8',
    teal: '#3a6f8a',
    surface: '#1a2133',
    muted: '#7f8a9c',
  },
  fonts: { serif: 'Merriweather', sans: 'Inter', mono: 'JetBrains Mono' },
}

function mergeTheme(partial: Partial<Theme> | undefined): Theme {
  return {
    colors: { ...EMPTY_THEME.colors, ...(partial?.colors ?? {}) },
    fonts: { ...EMPTY_THEME.fonts, ...(partial?.fonts ?? {}) },
  }
}

type FontStatus = 'loading' | 'loaded' | 'error'

export default function ThemeEditor({ theme, onChange }: Props) {
  const t = useMemo(() => mergeTheme(theme), [theme])
  const [fontStatus, setFontStatus] = useState<Record<string, FontStatus>>({})

  // Inject Google Fonts link for admin preview
  useEffect(() => {
    const url = getFontImportUrl(t.fonts)
    const existing = document.getElementById('admin-theme-fonts')
    if (existing) existing.remove()
    if (!url) return
    const link = document.createElement('link')
    link.id = 'admin-theme-fonts'
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
    return () => { link.remove() }
  }, [t.fonts.serif, t.fonts.sans, t.fonts.mono])

  // Check load status for each font — use check() as final verdict since load()
  // returns [] for system fonts even though they're available
  useEffect(() => {
    setFontStatus({ serif: 'loading', sans: 'loading', mono: 'loading' })
    ;(['serif', 'sans', 'mono'] as const).forEach(async (k) => {
      const name = t.fonts[k]
      if (!name) return
      try {
        if (document.fonts.check(`16px "${name}"`)) {
          setFontStatus(s => ({ ...s, [k]: 'loaded' }))
          return
        }
        await document.fonts.load(`16px "${name}"`)
        setFontStatus(s => ({ ...s, [k]: document.fonts.check(`16px "${name}"`) ? 'loaded' : 'error' }))
      } catch {
        setFontStatus(s => ({ ...s, [k]: 'error' }))
      }
    })
  }, [t.fonts.serif, t.fonts.sans, t.fonts.mono])

  function setColor(key: keyof Theme['colors'], value: string) {
    onChange({ ...t, colors: { ...t.colors, [key]: value } })
  }
  function clearColor(key: keyof Theme['colors']) {
    const next = { ...t.colors }
    delete next[key]
    onChange({ ...t, colors: next })
  }
  function setFont(key: keyof Theme['fonts'], value: string) {
    onChange({ ...t, fonts: { ...t.fonts, [key]: value } })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4 space-y-8">
        <ThemePreview theme={t} />

        <Section title="Colors">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {COLOR_FIELDS.map((f) => (
              <ColorField
                key={f.key}
                label={f.label}
                hint={f.hint}
                value={t.colors[f.key]}
                required={f.required}
                onChange={(v) => setColor(f.key, v)}
                onClear={f.required ? undefined : () => clearColor(f.key)}
              />
            ))}
          </div>
        </Section>

        <Section title="Fonts">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['serif', 'sans', 'mono'] as const).map((k) => (
              <FontField
                key={k}
                label={k}
                value={t.fonts[k]}
                presets={FONT_PRESETS[k]}
                status={fontStatus[k]}
                onChange={(v) => setFont(k, v)}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Font names are free text — anything loaded in the project will render; others fall back.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-400">{title}</h2>
      {children}
    </section>
  )
}

function ColorField({
  label,
  hint,
  value,
  required,
  onChange,
  onClear,
}: {
  label: string
  hint?: string
  value: string | undefined
  required: boolean
  onChange: (v: string) => void
  onClear?: () => void
}) {
  const resolved = value ?? '#000000'
  return (
    <label className="block bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          {hint && <div className="text-[11px] text-neutral-500 truncate">{hint}</div>}
        </div>
        {!required && onClear && value !== undefined && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onClear()
            }}
            className="text-[11px] text-neutral-500 hover:text-white px-2 py-0.5 rounded border border-white/10"
          >
            clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={resolved}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded cursor-pointer bg-transparent border border-white/10"
          style={{ padding: 0 }}
          aria-label={`${label} color`}
        />
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={required ? '#000000' : '(unset)'}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 bg-black/30 rounded px-2 py-1.5 font-mono text-[13px] border border-white/10 focus:outline-none focus:border-white/30"
        />
      </div>
    </label>
  )
}

function FontField({
  label,
  value,
  presets,
  status,
  onChange,
}: {
  label: string
  value: string
  presets: string[]
  status?: FontStatus
  onChange: (v: string) => void
}) {
  return (
    <label className="block bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium capitalize shrink-0">{label}</span>
          {status === 'error' && (
            <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 shrink-0">
              not loaded
            </span>
          )}
          {status === 'loading' && (
            <span className="text-[10px] text-neutral-500 shrink-0">…</span>
          )}
        </div>
        <span
          className="text-[11px] text-neutral-400 truncate max-w-[55%]"
          style={{ fontFamily: `"${value}", ${label}` }}
        >
          AaBb 123
        </span>
      </div>
      <input
        list={`font-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
      />
      <datalist id={`font-${label}`}>
        {presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </label>
  )
}

function ThemePreview({ theme }: { theme: Theme }) {
  const c = theme.colors
  const f = theme.fonts

  const style: React.CSSProperties = {
    backgroundColor: c.background,
    color: c.text,
    // Load the fonts dynamically so the preview shows them if available on the system or already loaded in the app.
    '--serif': `"${f.serif}", Georgia, serif`,
    '--sans': `"${f.sans}", system-ui, sans-serif`,
    '--mono': `"${f.mono}", ui-monospace, monospace`,
  } as React.CSSProperties

  const boxStyle = (bg: string, border?: string): React.CSSProperties => ({
    backgroundColor: bg,
    borderColor: border ?? 'transparent',
  })

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-white/10"
      style={style}
    >
      <div className="p-6 sm:p-8 space-y-5">
        <div className="text-[11px] tracking-[0.2em]" style={{ color: c.muted }}>
          THEME PREVIEW
        </div>
        <h1
          className="text-3xl sm:text-4xl leading-tight"
          style={{ fontFamily: 'var(--serif)' }}
        >
          A title set in your serif
        </h1>
        <p
          className="text-base sm:text-lg leading-snug"
          style={{ color: c.muted, fontFamily: 'var(--sans)' }}
        >
          The subtitle explains the gist in a calmer voice, one size smaller than the headline.
        </p>
        <p className="text-sm leading-relaxed" style={{ fontFamily: 'var(--sans)' }}>
          A body paragraph sits in <span style={{ color: c.accent }}>accent</span> occasionally, with{' '}
          <span style={{ color: c.accent2 }}>accent-2</span> for secondary emphasis and{' '}
          <span style={{ color: c.teal }}>teal</span> for tertiary notes. Muted text uses{' '}
          <span style={{ color: c.muted }}>muted</span> consistently.
        </p>

        <div
          className="rounded-xl p-4 border flex items-baseline gap-3"
          style={boxStyle(c.surface, c.line)}
        >
          <div
            className="text-4xl"
            style={{ fontFamily: 'var(--serif)', color: c.accent }}
          >
            +14.8%
          </div>
          <div
            className="text-[11px] uppercase tracking-wider"
            style={{ fontFamily: 'var(--mono)', color: c.muted }}
          >
            stat caption
          </div>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
          {Object.entries(c).map(([key, value]) => {
            if (!value) return null
            return (
              <div key={key} className="space-y-1">
                <div
                  className="aspect-square rounded border"
                  style={boxStyle(value, c.line)}
                  title={`${key}: ${value}`}
                />
                <div
                  className="text-[9px] truncate text-center"
                  style={{ color: c.muted, fontFamily: 'var(--mono)' }}
                >
                  {key}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
