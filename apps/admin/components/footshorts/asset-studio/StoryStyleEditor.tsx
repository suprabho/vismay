'use client'

import { useMemo, useState } from 'react'
import { ArrowCounterClockwise, Drop, FloppyDisk, Trash, Warning } from '@phosphor-icons/react'
import { builtinThemePresetsFor } from '@vismay/viz-engine'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import {
  FONT_ROLES,
  PALETTE_OPTIONAL_SLOTS,
  PALETTE_REQUIRED_SLOTS,
  isLightPalette,
  parseEntityStyle,
  type EntityStyle,
  type StyleFonts,
  type StylePalette,
} from '@vismay/html-stories/styles'
import type { AssetEntity } from './AssetStudio'

type Slot = keyof StylePalette

const SLOT_LABELS: Record<Slot, string> = {
  background: 'Background',
  surface: 'Surface',
  text: 'Text',
  muted: 'Muted',
  line: 'Hairlines',
  accent: 'Accent',
  accent2: 'Secondary',
  teal: 'Tertiary',
  positive: 'Positive',
  amber: 'Warning',
  red: 'Negative',
}

const FONT_LABELS: Record<keyof StyleFonts, string> = {
  serif: 'Headlines · big numbers',
  sans: 'Body',
  mono: 'Labels · data',
}

/** Families the brief's agents already use well; any Google Font works. */
const FONT_SUGGESTIONS = [
  'Forum',
  'Fraunces',
  'Instrument Serif',
  'Lora',
  'Playfair Display',
  'Space Grotesk',
  'Inter',
  'Manrope',
  'Saira',
  'IBM Plex Sans',
  'Space Mono',
  'JetBrains Mono',
  'IBM Plex Mono',
  'Martian Mono',
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** The footshorts story presets (Classic / Pitch / Terrace) as starting points. */
const PRESETS = builtinThemePresetsFor('footshorts').flatMap((p) => {
  const parsed = parseEntityStyle({ palette: p.theme.colors, fonts: p.theme.fonts })
  return 'style' in parsed ? [{ name: p.name, style: parsed.style }] : []
})

/** Draft colours are kept as typed (so a half-typed hex isn't lost); empty = unset optional slot. */
type DraftPalette = Record<Slot, string>

function toDraft(style: EntityStyle): { palette: DraftPalette; fonts: StyleFonts } {
  const palette = Object.fromEntries(
    [...PALETTE_REQUIRED_SLOTS, ...PALETTE_OPTIONAL_SLOTS].map((k) => [k, style.palette[k] ?? '']),
  ) as DraftPalette
  return { palette, fonts: { ...style.fonts } }
}

/** What the editor opens on: the saved style, else Classic with the brand colour as accent. */
function seedFor(entity: AssetEntity): EntityStyle {
  const saved = entity.story_style ? parseEntityStyle(entity.story_style) : null
  if (saved && 'style' in saved) return saved.style
  const base = PRESETS[0]?.style
  if (!base) {
    return {
      palette: { background: '#0B0B0F', surface: '#16161D', text: '#F4F4F5', muted: '#8E8E99', accent: '#F26A3C', accent2: '#00D26A', teal: '#38BDF8' },
      fonts: { serif: 'Forum', sans: 'Space Grotesk', mono: 'Space Mono' },
    }
  }
  const brand = entity.primary_color && HEX_RE.test(entity.primary_color) ? entity.primary_color.toUpperCase() : null
  return brand ? { ...base, palette: { ...base.palette, accent: brand } } : base
}

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number | null {
  const lum = (hex: string) => {
    if (!HEX_RE.test(hex)) return null
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const la = lum(a)
  const lb = lum(b)
  if (la == null || lb == null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function sameStyle(a: EntityStyle | null, b: EntityStyle | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * A competition's or team's HTML-story style: the full palette (the
 * `vizmaya:theme` slots) and a font trio, saved to `entities.story_style` and
 * offered by the HTML-stories brief's "Story style" menu, so every story about
 * the competition or club can share one look. Start from a footshorts preset,
 * tune each slot, check contrast on the live sample, then Save.
 */
export function StoryStyleEditor({
  entity,
  onSaved,
}: {
  entity: AssetEntity
  onSaved: (updated: AssetEntity) => void
}) {
  const [draft, setDraft] = useState(() => toDraft(seedFor(entity)))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  const parsed = useMemo(() => parseEntityStyle(draft), [draft])
  const valid = 'style' in parsed ? parsed.style : null
  const saved = useMemo(() => {
    if (!entity.story_style) return null
    const p = parseEntityStyle(entity.story_style)
    return 'style' in p ? p.style : null
  }, [entity.story_style])
  const dirty = !!valid && !sameStyle(valid, saved)

  // The sample renders the last valid draft so a half-typed hex doesn't blank it.
  const [shown, setShown] = useState<EntityStyle>(() => seedFor(entity))
  if (valid && !sameStyle(valid, shown)) setShown(valid)
  const fontsUrl = getFontImportUrl(shown.fonts)
  const textRatio = contrast(shown.palette.text, shown.palette.background)
  const mutedRatio = contrast(shown.palette.muted, shown.palette.background)

  function setSlot(slot: Slot, value: string) {
    setDraft((d) => ({ ...d, palette: { ...d.palette, [slot]: value.trim().toUpperCase() } }))
    setMsg(null)
  }
  function setFont(role: keyof StyleFonts, value: string) {
    setDraft((d) => ({ ...d, fonts: { ...d.fonts, [role]: value } }))
    setMsg(null)
  }
  function load(style: EntityStyle) {
    setDraft(toDraft(style))
    setMsg(null)
  }

  async function persist(storyStyle: EntityStyle | null) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/footshorts/assets/entities/${entity.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ story_style: storyStyle }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'save failed')
      onSaved(json.entity as AssetEntity)
      setMsg({ text: storyStyle ? 'Story style saved' : 'Story style cleared', error: false })
      if (!storyStyle) load(seedFor({ ...entity, story_style: null }))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'save failed', error: true })
    } finally {
      setSaving(false)
    }
  }

  const isTeam = entity.type === 'team'
  const brand = entity.primary_color && HEX_RE.test(entity.primary_color) ? entity.primary_color.toUpperCase() : null
  const btn =
    'inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
  const chip =
    'rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100'

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-neutral-900/40 p-4">
      {fontsUrl ? <link rel="stylesheet" href={fontsUrl} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-100">HTML story style</div>
          <p className="mt-0.5 max-w-xl text-xs text-neutral-400">
            The palette and fonts the HTML-stories brief offers as the{' '}
            <span className="text-neutral-300">{entity.name}</span> style, so every story about this{' '}
            {entity.type === 'team' ? 'club' : 'competition'} shares one look. {saved ? 'Saved.' : 'Not set yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-500">Start from</span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className={chip}
              onClick={() => load(brand ? { ...p.style, palette: { ...p.style.palette, accent: brand } } : p.style)}
              title={brand ? `${p.name}, with the brand colour as accent` : p.name}
            >
              {p.name}
            </button>
          ))}
          {brand && (
            <button
              type="button"
              className={`${chip} inline-flex items-center gap-1`}
              onClick={() => setSlot('accent', brand)}
              title="Use the primary colour as the accent"
            >
              <Drop size={12} weight="fill" style={{ color: brand }} />
              Brand accent
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-neutral-300">Palette</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[...PALETTE_REQUIRED_SLOTS, ...PALETTE_OPTIONAL_SLOTS].map((slot) => {
                const value = draft.palette[slot]
                const optional = (PALETTE_OPTIONAL_SLOTS as readonly string[]).includes(slot)
                const ok = HEX_RE.test(value) || (optional && value === '')
                return (
                  <label key={slot} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_RE.test(value) ? value : '#000000'}
                      onChange={(e) => setSlot(slot, e.target.value)}
                      aria-label={`Pick ${SLOT_LABELS[slot].toLowerCase()}`}
                      className="h-8 w-9 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent p-0.5"
                    />
                    <span className="w-20 shrink-0 text-xs text-neutral-400">
                      {SLOT_LABELS[slot]}
                      {optional ? <span className="text-neutral-600"> · opt</span> : null}
                    </span>
                    <input
                      type="text"
                      value={value}
                      placeholder={optional ? 'unset' : '#RRGGBB'}
                      onChange={(e) => setSlot(slot, e.target.value)}
                      spellCheck={false}
                      className={`w-24 min-w-0 rounded-md border bg-neutral-900 px-2 py-1 font-mono text-xs uppercase text-neutral-100 placeholder:normal-case placeholder:text-neutral-600 focus:outline-none ${
                        ok ? 'border-white/15 focus:border-white/30' : 'border-red-500/60'
                      }`}
                    />
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-neutral-300">Fonts (Google Fonts families)</div>
            <datalist id="story-style-fonts">
              {FONT_SUGGESTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <div className="grid gap-2 sm:grid-cols-3">
              {FONT_ROLES.map((role) => (
                <label key={role} className="block min-w-0">
                  <span className="mb-1 block text-[11px] text-neutral-500">{FONT_LABELS[role]}</span>
                  <input
                    type="text"
                    list="story-style-fonts"
                    value={draft.fonts[role]}
                    onChange={(e) => setFont(role, e.target.value)}
                    spellCheck={false}
                    className="w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:border-white/30 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* live sample: a story card drawn in the draft style */}
        <div className="min-w-0">
          <div
            className="overflow-hidden rounded-lg border p-5"
            style={{
              background: shown.palette.background,
              borderColor: shown.palette.line || shown.palette.surface,
              color: shown.palette.text,
              fontFamily: `'${shown.fonts.sans}', sans-serif`,
            }}
          >
            <div
              className="text-[11px] uppercase tracking-widest"
              style={{ color: shown.palette.muted, fontFamily: `'${shown.fonts.mono}', monospace` }}
            >
              {entity.name} · matchweek 12
            </div>
            <div
              className="mt-2 text-2xl leading-tight"
              style={{ fontFamily: `'${shown.fonts.serif}', serif` }}
            >
              {isTeam ? `${entity.name} make it five without defeat` : 'The title race tightens at the top'}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: shown.palette.text }}>
              {isTeam ? (
                <>
                  Another clean sheet and a{' '}
                  <span style={{ color: shown.palette.accent }}>late winner</span> keep the run going.
                </>
              ) : (
                <>
                  Three points separate the top three after a weekend of{' '}
                  <span style={{ color: shown.palette.accent }}>late winners</span> and dropped points.
                </>
              )}
            </p>
            <div className="mt-4 rounded-md p-3" style={{ background: shown.palette.surface }}>
              <div className="flex items-end gap-2" style={{ height: 72 }}>
                {[
                  [62, 'accent'],
                  [48, 'accent2'],
                  [40, 'teal'],
                  [30, 'muted'],
                ].map(([h, slot]) => (
                  <div key={slot as string} className="flex-1 rounded-sm" style={{ height: `${h}px`, background: shown.palette[slot as Slot] }} />
                ))}
              </div>
              <div
                className="mt-2 border-t pt-2 text-[11px]"
                style={{ borderColor: shown.palette.line || shown.palette.muted, color: shown.palette.muted, fontFamily: `'${shown.fonts.mono}', monospace` }}
              >
                Points per game, last 10
              </div>
            </div>
            {(shown.palette.positive || shown.palette.amber || shown.palette.red) && (
              <div className="mt-3 flex gap-3 text-xs" style={{ fontFamily: `'${shown.fonts.mono}', monospace` }}>
                {shown.palette.positive && <span style={{ color: shown.palette.positive }}>▲ +4</span>}
                {shown.palette.amber && <span style={{ color: shown.palette.amber }}>● 0</span>}
                {shown.palette.red && <span style={{ color: shown.palette.red }}>▼ −3</span>}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
            <span>{isLightPalette(shown.palette) ? 'Light page' : 'Dark page'}</span>
            {textRatio != null && (
              <span className={textRatio < 4.5 ? 'text-amber-400' : undefined}>
                {textRatio < 4.5 && <Warning size={11} className="mr-0.5 inline" />}
                text {textRatio.toFixed(1)}:1
              </span>
            )}
            {mutedRatio != null && (
              <span className={mutedRatio < 3 ? 'text-amber-400' : undefined}>
                {mutedRatio < 3 && <Warning size={11} className="mr-0.5 inline" />}
                muted {mutedRatio.toFixed(1)}:1
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => valid && persist(valid)}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FloppyDisk size={14} />
          {saving ? 'Saving…' : 'Save style'}
        </button>
        <button
          type="button"
          disabled={saving || (!saved && !dirty)}
          onClick={() => load(seedFor(entity))}
          className={btn}
          title="Back to the saved style"
        >
          <ArrowCounterClockwise size={14} />
          Reset
        </button>
        <button type="button" disabled={saving || !saved} onClick={() => persist(null)} className={btn} title="Remove the saved style">
          <Trash size={14} />
          Clear
        </button>
        {'error' in parsed && <span className="text-xs text-red-400">{parsed.error}</span>}
        {msg && <span className={`text-xs ${msg.error ? 'text-red-400' : 'text-emerald-400'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
