'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowCounterClockwise, Check, Warning, X } from '@phosphor-icons/react'
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
import {
  FONT_LABELS,
  FONT_SUGGESTIONS,
  SLOT_LABELS,
  contrast,
} from '@/components/footshorts/asset-studio/StoryStyleEditor'

type Slot = keyof StylePalette
const SLOTS = [...PALETTE_REQUIRED_SLOTS, ...PALETTE_OPTIONAL_SLOTS] as Slot[]
const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Draft values kept as typed, so a half-typed hex isn't lost; empty = unset optional slot. */
interface Draft {
  palette: Record<Slot, string>
  fonts: StyleFonts
}

/** Expand #rgb to #RRGGBB and upper-case, so stories' shorthand hexes pass the editor's checks. */
function normalizeHex(v: string | undefined): string {
  const t = (v ?? '').trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t)
  return (short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : t).toUpperCase()
}

function toDraft(style: EntityStyle): Draft {
  return {
    palette: Object.fromEntries(SLOTS.map((k) => [k, normalizeHex(style.palette[k])])) as Record<Slot, string>,
    fonts: { ...style.fonts },
  }
}

/**
 * Edit the colours and fonts the agent brief carries: every palette slot
 * (colour picker or hex) and the font trio (any Google Fonts family), with a
 * live sample and contrast readouts. Opens on the style in use (`initial`);
 * `house` is the app's house look, for "Reset to house". Apply hands back a
 * validated style; nothing is saved anywhere but the brief.
 */
export function StyleEditDialog({
  initial,
  house,
  basedOn,
  onApply,
  onClose,
}: {
  initial: EntityStyle
  house: EntityStyle
  basedOn: string
  onApply: (style: EntityStyle) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const parsed = useMemo(() => parseEntityStyle(draft), [draft])
  const valid = 'style' in parsed ? parsed.style : null

  // The sample draws the last valid draft, so a half-typed hex doesn't blank it.
  const [shown, setShown] = useState<EntityStyle>(() => {
    const p = parseEntityStyle(toDraft(initial))
    return 'style' in p ? p.style : house
  })
  if (valid && JSON.stringify(valid) !== JSON.stringify(shown)) setShown(valid)
  const fontsUrl = getFontImportUrl(shown.fonts)
  const textRatio = contrast(shown.palette.text, shown.palette.background)
  const mutedRatio = contrast(shown.palette.muted, shown.palette.background)
  const accentRatio = contrast(shown.palette.accent, shown.palette.background)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const setSlot = (slot: Slot, value: string) =>
    setDraft((d) => ({ ...d, palette: { ...d.palette, [slot]: value.trim().toUpperCase() } }))
  const setFont = (role: keyof StyleFonts, value: string) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, [role]: value } }))

  const btn =
    'inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
  const mono = { fontFamily: `'${shown.fonts.mono}', monospace` }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      {fontsUrl ? <link rel="stylesheet" href={fontsUrl} /> : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit brief style"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div>
            <div className="text-sm font-semibold">Edit style</div>
            <p className="mt-0.5 text-xs text-neutral-400">
              The colours and fonts the agent brief hands over. Starting from {basedOn}. Only this brief changes.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-500 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-2 text-xs font-medium text-neutral-300">Palette</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SLOTS.map((slot) => {
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
              <datalist id="brief-style-fonts">
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
                      list="brief-style-fonts"
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
              <div className="text-[11px] uppercase tracking-widest" style={{ ...mono, color: shown.palette.muted }}>
                Chapter 2 · the numbers
              </div>
              <div className="mt-2 text-3xl leading-tight" style={{ fontFamily: `'${shown.fonts.serif}', serif` }}>
                A headline that sets the story up
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Body copy carries the argument, and the <span style={{ color: shown.palette.accent }}>accent</span> marks
                the one thing to look at.
              </p>
              <div className="mt-4 rounded-md p-3" style={{ background: shown.palette.surface }}>
                <div className="flex items-end gap-2" style={{ height: 72 }}>
                  {(
                    [
                      [62, 'accent'],
                      [48, 'accent2'],
                      [40, 'teal'],
                      [30, 'muted'],
                    ] as const
                  ).map(([h, slot]) => (
                    <div key={slot} className="flex-1 rounded-sm" style={{ height: h, background: shown.palette[slot] }} />
                  ))}
                </div>
                <div
                  className="mt-2 border-t pt-2 text-[11px]"
                  style={{ ...mono, borderColor: shown.palette.line || shown.palette.muted, color: shown.palette.muted }}
                >
                  Accent · secondary · tertiary · muted
                </div>
              </div>
              {(shown.palette.positive || shown.palette.amber || shown.palette.red) && (
                <div className="mt-3 flex gap-3 text-xs" style={mono}>
                  {shown.palette.positive && <span style={{ color: shown.palette.positive }}>▲ +4</span>}
                  {shown.palette.amber && <span style={{ color: shown.palette.amber }}>● 0</span>}
                  {shown.palette.red && <span style={{ color: shown.palette.red }}>▼ −3</span>}
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
              <span>{isLightPalette(shown.palette) ? 'Light page' : 'Dark page'}</span>
              {(
                [
                  ['text', textRatio, 4.5],
                  ['muted', mutedRatio, 3],
                  ['accent', accentRatio, 3],
                ] as const
              ).map(([label, ratio, min]) =>
                ratio == null ? null : (
                  <span key={label} className={ratio < min ? 'text-amber-400' : undefined}>
                    {ratio < min && <Warning size={11} className="mr-0.5 inline" />}
                    {label} {ratio.toFixed(1)}:1
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={() => setDraft(toDraft(house))} className={btn} title="Start over from the house style">
            <ArrowCounterClockwise size={14} />
            Reset to house
          </button>
          <button type="button" onClick={() => setDraft(toDraft(initial))} className={btn} title={`Back to ${basedOn}`}>
            Undo edits
          </button>
          {'error' in parsed && <span className="text-xs text-red-400">{parsed.error}</span>}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => valid && onApply(valid)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={14} />
            Use in brief
          </button>
        </div>
      </div>
    </div>
  )
}
