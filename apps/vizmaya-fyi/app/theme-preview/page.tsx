'use client'

import { useState, useEffect } from 'react'
import { Theme } from '@/types/story'

interface StoryThemeEntry {
  slug: string
  title: string
  theme: Theme
}

const DEFAULT_THEME: Theme = {
  colors: {
    background: '#052f4a',
    text: '#e0ddd5',
    accent: '#f54900',
    accent2: '#155dfc',
    teal: '#00d5be',
    surface: '#023555',
    muted: '#aca286',
    positive: '#009966',
    amber: '#EF9F27',
    red: '#E24B4A',
    line: '#1a2830',
  },
  fonts: {
    serif: 'Georgia',
    sans: 'Inter',
    mono: 'JetBrains Mono',
  },
}

const COLOR_LABELS: Record<string, string> = {
  background: 'Background',
  text: 'Text',
  accent: 'Accent',
  accent2: 'Accent 2',
  teal: 'Teal',
  surface: 'Surface',
  muted: 'Muted',
  positive: 'Positive',
  amber: 'Amber',
  red: 'Red',
  line: 'Line',
}

function contrastColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? '#000' : '#fff'
}

function ColorSwatch({
  name,
  color,
  onChange,
}: {
  name: string
  color: string
  onChange: (val: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5 cursor-pointer group">
      <div
        className="relative w-full aspect-square rounded-lg border border-white/10 overflow-hidden transition-transform group-hover:scale-105"
        style={{ background: color }}
      >
        <span
          className="absolute bottom-1.5 left-2 text-xs font-mono opacity-80"
          style={{ color: contrastColor(color) }}
        >
          {color}
        </span>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <span className="text-xs font-medium" style={{ color: '#e0ddd5' }}>
        {name}
      </span>
    </label>
  )
}

function YamlOutput({ theme }: { theme: Theme }) {
  const [copied, setCopied] = useState(false)

  const yaml = [
    'theme:',
    '  colors:',
    ...Object.entries(theme.colors)
      .filter(([, v]) => v)
      .map(([k, v]) => `    ${k}: "${v}"`),
    '  fonts:',
    ...Object.entries(theme.fonts).map(([k, v]) => `    ${k}: "${v}"`),
  ].join('\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 text-xs px-2 py-1 rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{ background: theme.colors.surface, color: theme.colors.text }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre
        className="text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed select-all"
        style={{ background: theme.colors.surface, color: theme.colors.muted }}
      >
        {yaml}
      </pre>
    </div>
  )
}

export default function ThemePreviewPage() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [stories, setStories] = useState<StoryThemeEntry[]>([])
  const [activeSlug, setActiveSlug] = useState<string>('')

  useEffect(() => {
    fetch('/api/stories/themes')
      .then((r) => r.json())
      .then((data: StoryThemeEntry[]) => setStories(data))
  }, [])

  const loadStory = (slug: string) => {
    const story = stories.find((s) => s.slug === slug)
    if (story) {
      setTheme(story.theme)
      setActiveSlug(slug)
    } else {
      setTheme(DEFAULT_THEME)
      setActiveSlug('')
    }
  }

  const setColor = (key: string, value: string) => {
    setTheme((t) => ({ ...t, colors: { ...t.colors, [key]: value } }))
  }

  const setFont = (key: keyof Theme['fonts'], value: string) => {
    setTheme((t) => ({ ...t, fonts: { ...t.fonts, [key]: value } }))
  }

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: theme.fonts.serif }}
        >
          Theme Preview
        </h1>
        <p className="text-sm mb-6" style={{ color: theme.colors.muted }}>
          Edit colors and fonts, then copy the YAML into your story frontmatter.
        </p>

        {/* Story loader */}
        {stories.length > 0 && (
          <div className="flex items-center gap-3 mb-10">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.colors.muted }}>
              Load from story
            </span>
            <select
              value={activeSlug}
              onChange={(e) => loadStory(e.target.value)}
              className="text-sm px-3 py-2 rounded-md border border-white/10 bg-transparent outline-none cursor-pointer"
              style={{ color: theme.colors.text }}
            >
              <option value="" style={{ background: '#111' }}>Custom</option>
              {stories.map((s) => (
                <option key={s.slug} value={s.slug} style={{ background: '#111' }}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12">
          {/* Left: Controls */}
          <div className="space-y-8">
            {/* Color grid */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: theme.colors.muted }}>
                Colors
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {Object.entries(theme.colors)
                  .filter(([, v]) => v)
                  .map(([key, value]) => (
                    <ColorSwatch
                      key={key}
                      name={COLOR_LABELS[key] || key}
                      color={value!}
                      onChange={(v) => setColor(key, v)}
                    />
                  ))}
              </div>
            </section>

            {/* Fonts */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: theme.colors.muted }}>
                Fonts
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(theme.fonts) as (keyof Theme['fonts'])[]).map(
                  (key) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: theme.colors.muted }}>
                        {key}
                      </span>
                      <input
                        type="text"
                        value={theme.fonts[key]}
                        onChange={(e) => setFont(key, e.target.value)}
                        className="text-sm px-3 py-2 rounded-md border border-white/10 bg-transparent outline-none focus:border-white/30"
                        style={{ color: theme.colors.text, fontFamily: theme.fonts[key] }}
                      />
                    </label>
                  ),
                )}
              </div>
            </section>

            {/* YAML output */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: theme.colors.muted }}>
                Frontmatter YAML
              </h2>
              <YamlOutput theme={theme} />
            </section>
          </div>

          {/* Right: Live preview */}
          <div className="space-y-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: theme.colors.muted }}>
              Preview
            </h2>

            {/* Typography preview */}
            <div
              className="rounded-lg p-6 space-y-4"
              style={{ background: theme.colors.surface }}
            >
              <h3
                className="text-2xl font-bold"
                style={{ fontFamily: theme.fonts.serif }}
              >
                The Quiet Inflation
              </h3>
              <p className="text-sm leading-relaxed" style={{ fontFamily: theme.fonts.sans }}>
                How a strait reprices a GPU hour. This is body text in{' '}
                <strong>{theme.fonts.sans}</strong> showing how the main
                content of a story will look.
              </p>
              <p className="text-xs" style={{ color: theme.colors.muted, fontFamily: theme.fonts.sans }}>
                vizmaya &middot; March 2026
              </p>
              <code
                className="block text-xs px-3 py-2 rounded"
                style={{
                  fontFamily: theme.fonts.mono,
                  background: theme.colors.background,
                  color: theme.colors.muted,
                }}
              >
                const price = dram_spot * carrier_risk_premium;
              </code>
            </div>

            {/* Color usage preview: chart-like bars */}
            <div
              className="rounded-lg p-6 space-y-3"
              style={{ background: theme.colors.surface }}
            >
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.colors.muted }}>
                Chart palette
              </h4>
              {[
                { label: 'DRAM Spot', color: theme.colors.accent, w: '85%' },
                { label: 'HBM Share', color: theme.colors.accent2, w: '62%' },
                { label: 'LNG Capacity', color: theme.colors.teal, w: '74%' },
                { label: 'Recovery', color: theme.colors.positive || '#34D399', w: '55%' },
                { label: 'Risk Index', color: theme.colors.amber || '#EF9F27', w: '45%' },
                { label: 'Disruption', color: theme.colors.red || '#E24B4A', w: '30%' },
              ].map((bar) => (
                <div key={bar.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{bar.label}</span>
                    <span style={{ color: bar.color }}>{bar.color}</span>
                  </div>
                  <div
                    className="h-3 rounded-full transition-all duration-500"
                    style={{ width: bar.w, background: bar.color }}
                  />
                </div>
              ))}
            </div>

            {/* Accent contrast preview */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Accent', bg: theme.colors.accent },
                { label: 'Accent 2', bg: theme.colors.accent2 },
                { label: 'Positive', bg: theme.colors.positive || '#34D399' },
                { label: 'Teal', bg: theme.colors.teal },
                { label: 'Amber', bg: theme.colors.amber || '#EF9F27' },
                { label: 'Red', bg: theme.colors.red || '#E24B4A' },
              ].map((chip) => (
                <span
                  key={chip.label}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: chip.bg, color: contrastColor(chip.bg) }}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
