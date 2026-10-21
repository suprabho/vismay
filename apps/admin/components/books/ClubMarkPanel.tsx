'use client'

import { useId, useMemo, useState } from 'react'
import { ArrowClockwise, ArrowDown, ArrowSquareOut, ArrowUp, Check, CircleNotch, MagicWand, Plus, Trash, Warning } from '@phosphor-icons/react'
import { CHARGE_LABELS, chargeSlots, chargesFromText, chargesToText, normalizeCharge, rimFromText, rimToText } from '@vismay/club-marks/charges'
import { EMBLEM_IDS } from '@vismay/club-marks/emblems'
import { renderClubMark, withClipUid } from '@vismay/club-marks/render'
import {
  BOOK_PAPER, CHARGE_LIMITS, CHARGE_SHAPES, CREST_FAMILIES, INK, KIT_PATTERNS, RIM_LIMITS, WHITE,
  type Charge, type ChargeLayer, type CheckStatus, type ClubMarkRow, type ClubMarkTier, type CrestFamily, type KitPattern, type RimBand,
} from '@vismay/club-marks/types'
import { isHex, markCharges, markFamily, markKit, markRim, markRow, markState, type CrestView, type MarkState } from '@/lib/seasonBooks/crests'
import { BUTTON, INPUT, LABEL, PRIMARY, SELECT } from './shared'

/**
 * Club marks in the Crests viewer (toClubMark spec 2): the grid tile, its caption,
 * and the review-queue panel — the real crest (read once, for the family) beside the
 * layered mark (ring, white gap, kit field, the charges on it), the chip /
 * token / hero sizes in colour and greyscale, the checks, the CMYK, and the overrides
 * that are written back into the input. Marks are drawn here from the stored row by
 * the same pure renderer every surface uses.
 */

export type MarkAction =
  | { action: 'generate' }
  | { action: 'confirm' }
  | {
    action: 'override'
    /** Only the keys present are written. */
    overrides: Partial<{ family: CrestFamily | null; code: string | null; pattern: KitPattern | null; c1: string | null; c2: string | null; charge: string | null; rim: string | null }>
  }

const STATE_META: Record<MarkState, { label: string; className: string }> = {
  ok: { label: 'Mark ready', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  review: { label: 'Needs review', className: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  error: { label: 'No mark', className: 'border-rose-400/50 bg-rose-400/10 text-rose-200' },
  stale: { label: 'Stale', className: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  none: { label: 'Not generated', className: 'border-white/15 text-neutral-400' },
  nokit: { label: 'No kit', className: 'border-rose-400/40 text-rose-300' },
}

const CHECK_META: Record<CheckStatus, string> = {
  pass: 'text-emerald-300', fixed: 'text-sky-300', fail: 'text-rose-300', review: 'text-amber-200', skipped: 'text-neutral-500',
}

/**
 * The SVG string comes from renderClubMark() over a validated row (hex colours, known family/pattern, sanitised code).
 * Each copy gets its own clip id: the same mark appears several times on the page (grid tile, previews, greyscale
 * row), and if the first copy is hidden the browser drops the clip from all of them.
 */
function Svg({ markup, className }: { markup: string; className?: string }) {
  const uid = useId()
  return <span className={`inline-flex ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: withClipUid(markup, uid) }} />
}

export function markCaption(c: CrestView, dupes: Set<string>): { text: string; className: string } {
  const state = markState(c, dupes)
  const m = c.mark
  switch (state) {
    case 'ok': return { text: `${m!.code} · ${m!.crest}`, className: 'text-neutral-500' }
    case 'review': return { text: `${m!.code} · review`, className: 'text-amber-300' }
    case 'error': return { text: m?.error_code ?? 'Error', className: 'text-rose-300' }
    case 'stale': return { text: `Stale${m?.code ? ` · ${m.code}` : ''}`, className: 'text-amber-300' }
    case 'nokit': return { text: 'No kit', className: 'text-rose-300' }
    default: return { text: 'Not generated', className: 'text-neutral-500' }
  }
}

/** The grid tile: the token on the book's paper, or a dashed placeholder. */
export function MarkTile({ crest }: { crest: CrestView }) {
  const row = markRow(crest.mark)
  if (!row) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-white/20 text-neutral-500">
        {crest.mark?.status === 'error' || !markKit(crest.mark) ? <Warning size={22} /> : <MagicWand size={22} />}
      </div>
    )
  }
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-md border border-white/10" style={{ background: BOOK_PAPER }}>
      <Svg markup={renderClubMark(row, 'token', { size: 60 })} />
    </div>
  )
}

const wikiPage = (page: string) => {
  if (!page) return null
  const m = page.match(/^([a-z]{2}):(.+)$/)
  const [lang, title] = m ? [m[1], m[2]!] : ['en', page]
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

const KIT_SOURCE: Record<string, string> = {
  season: 'Wikipedia season article', club: 'Wikipedia club article (today’s kit)', override: 'kits_overrides.csv', none: 'No kit found',
}

const TIERS: [ClubMarkTier, number, string][] = [['chip', 24, 'Chip 24'], ['token', 120, 'Token 120'], ['hero', 160, 'Hero']]

export function ClubMarkPanel({ crest, busy, onMark, dupes }: {
  crest: CrestView
  busy: boolean
  onMark: (a: MarkAction) => void
  dupes: Set<string>
}) {
  const m = crest.mark
  const state = markState(crest, dupes)
  const row = markRow(m)
  const kit = markKit(m)
  const reasons = [...(m?.review_reasons ?? [])]
  if (m?.code && dupes.has(m.code) && !m.override_code && !reasons.some(r => r.includes('already used'))) {
    reasons.push(`Code ${m.code} is held by another club this season: set one by hand`)
  }

  // Override form, seeded from the stored overrides ('' = automatic / the kit's value).
  const seed = useMemo(() => ({
    family: m?.override_family ?? '', code: m?.override_code ?? '', pattern: m?.override_pattern ?? '',
    c1: m?.override_c1 ?? '', c2: m?.override_c2 ?? '', noC2: m?.override_c2 === '',
  }), [m?.override_family, m?.override_code, m?.override_pattern, m?.override_c1, m?.override_c2])
  // The draft resets whenever the club, its overrides or its mark change (timestamps too: clearing returns to old values).
  const seedKey = `${crest.wiki}|${m?.reviewed_at}|${m?.generated_at}|${JSON.stringify(seed)}`
  const [draft, setDraft] = useState({ key: seedKey, form: seed })
  const form = draft.key === seedKey ? draft.form : seed
  const setForm = (next: (f: typeof seed) => typeof seed) => setDraft({ key: seedKey, form: next(form) })
  const dirty = JSON.stringify(form) !== JSON.stringify(seed)
  const badHex = (v: string) => v !== '' && !isHex(v)

  // Charges: the editorial default (data/mark_overrides.csv) until edited here; the draft previews live.
  const chargeSeed = useMemo((): ChargeDraft => ({ mode: m?.override_charge == null ? 'default' : 'set', list: markCharges(m ?? null) }),
    [m?.override_charge, m?.seed_charge]) // eslint-disable-line react-hooks/exhaustive-deps
  const chargeKey = `${seedKey}|${JSON.stringify(chargeSeed)}`
  const [chargeDraft, setChargeDraft] = useState({ key: chargeKey, value: chargeSeed })
  const charges = chargeDraft.key === chargeKey ? chargeDraft.value : chargeSeed
  const setCharges = (list: Charge[]) => setChargeDraft({ key: chargeKey, value: { mode: 'set', list } })
  // The rim, the same way: undefined = the default ring + gap, [] = none.
  const rimSeed = useMemo((): RimDraft => ({ mode: m?.override_rim == null ? 'default' : 'set', rim: markRim(m ?? null) }),
    [m?.override_rim, m?.seed_rim]) // eslint-disable-line react-hooks/exhaustive-deps
  const rimKey = `${seedKey}|${JSON.stringify(rimSeed)}`
  const [rimDraft, setRimDraft] = useState({ key: rimKey, value: rimSeed })
  const rimState = rimDraft.key === rimKey ? rimDraft.value : rimSeed
  const setRim = (rim: RimBand[] | undefined) => setRimDraft({ key: rimKey, value: { mode: 'set', rim } })
  const designDirty = JSON.stringify(charges) !== JSON.stringify(chargeSeed) || JSON.stringify(rimState) !== JSON.stringify(rimSeed)
  const preview: ClubMarkRow | null = row ? { ...row, charges: charges.list, rim: rimState.rim } : null

  const save = () => onMark({
    action: 'override',
    overrides: {
      family: (form.family || null) as CrestFamily | null,
      code: form.code.trim() || null,
      pattern: (form.pattern || null) as KitPattern | null,
      c1: form.c1 || null,
      c2: form.noC2 ? '' : form.c2 || null,
    },
  })

  return (
    <section className="space-y-3 border-t border-white/10 pt-4" aria-label="Club mark">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Club mark</h3>
          <span className={`rounded border px-1.5 text-[11px] ${STATE_META[state].className}`}>{STATE_META[state].label}</span>
        </div>
        <div className="flex gap-1.5">
          {state === 'review' && (
            <button type="button" className={BUTTON} disabled={busy} onClick={() => onMark({ action: 'confirm' })}
              title="Accept the family and code as generated: they become overrides and the mark leaves the review queue">
              <Check size={14} /> Confirm
            </button>
          )}
          <button type="button" className={BUTTON} disabled={busy} onClick={() => onMark({ action: 'generate' })}>
            {busy ? <CircleNotch size={14} className="animate-spin" /> : row ? <ArrowClockwise size={14} /> : <MagicWand size={14} />}
            {row ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {m?.status === 'error' && (
        <div className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2.5 py-2 text-xs text-rose-200">
          <p className="font-mono font-semibold">{m.error_code}</p>
          <p className="mt-0.5">{m.error_message}</p>
          {m.error_code === 'E_NO_KIT' && <p className="mt-1 text-rose-100/80">Set the kit pattern and c1 below (colours are never taken from the crest).</p>}
        </div>
      )}
      {state === 'stale' && <p className="text-xs text-amber-200">Its crest, kit, overrides or the spec changed since it was generated. Regenerate it.</p>}
      {reasons.length > 0 && (
        <ul className="space-y-1">
          {reasons.map(r => (
            <li key={r} className="flex gap-2 text-xs text-amber-200"><Warning size={14} weight="fill" className="mt-0.5 shrink-0" /> {r}</li>
          ))}
        </ul>
      )}

      {row && (
        <>
          {/* Review: the real crest (read only for the family) beside the generated mark. */}
          <div className="grid grid-cols-2 gap-2">
            <figure className="flex flex-col items-center gap-1 rounded-lg border border-white/10 p-2" style={{ background: BOOK_PAPER }}>
              {crest.image_url
                // eslint-disable-next-line @next/next/no-img-element -- remote and signed URLs
                ? <img src={crest.image_url} alt="" className="h-24 w-24 object-contain" referrerPolicy="no-referrer" />
                : <span className="flex h-24 w-24 items-center justify-center text-xs text-neutral-500">No crest</span>}
              <figcaption className="text-[10px] text-neutral-600">Real crest · family only</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-1 rounded-lg border border-white/10 p-2" style={{ background: BOOK_PAPER }}>
              <Svg markup={renderClubMark(preview!, 'token', { size: 96 })} />
              <figcaption className="text-[10px] text-neutral-600">
                {row.crest} · {markFamily(m ?? null) ? 'set by hand' : `${Math.round((m?.family_confidence ?? 0) * 100)}% sure`}
              </figcaption>
            </figure>
          </div>

          {/* The sizes as printed, in colour and in greyscale (the spec checks both before a mark is accepted). */}
          <div className="space-y-1.5">
            {[false, true].map(grey => (
              <div key={String(grey)} className="overflow-x-auto rounded-lg border border-white/10 px-3 py-2" style={{ background: BOOK_PAPER }}>
                <div className="flex items-end gap-4" style={grey ? { filter: 'grayscale(1)' } : undefined}>
                  {TIERS.map(([tier, size, label]) => (
                    <figure key={tier} className="flex shrink-0 flex-col items-center gap-1">
                      <Svg markup={renderClubMark(preview!, tier, { size })} />
                      <figcaption className="text-[10px] text-neutral-600">{label}{grey ? ' · grey' : ''}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DesignEditor row={row} charges={charges} rim={rimState} busy={busy} dirty={designDirty} onCharges={setCharges} onRim={setRim}
            onDefault={() => {
              setChargeDraft({ key: chargeKey, value: { mode: 'default', list: chargesFromText(m?.seed_charge) } })
              setRimDraft({ key: rimKey, value: { mode: 'default', rim: rimFromText(m?.seed_rim) } })
            }}
            onSave={() => onMark({ action: 'override', overrides: {
              charge: charges.mode === 'default' ? null : chargesToText(charges.list),
              rim: rimState.mode === 'default' ? null : rimToText(rimState.rim),
            } })} />

          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-neutral-500">Row</dt>
            <dd className="font-mono text-[11px] text-neutral-300">
              {`{ code: '${row.code}', crest: '${row.crest}', pattern: '${row.pattern}', c1: '${row.c1}', c2: ${row.c2 ? `'${row.c2}'` : 'null'}, ring: '${row.ring}', rim: '${rimToText(row.rim) || 'default'}', charges: ${chargesToText(row.charges) ? `'${chargesToText(row.charges)}'` : '[]'}, league: '${row.league}', from: ${row.from}, to: ${row.to ?? 'null'} }`}
            </dd>
            <dt className="text-neutral-500">Alt text</dt><dd className="text-neutral-300">“{m?.alt}”, empty beside the printed name</dd>
            {m?.print && (
              <>
                <dt className="text-neutral-500">Print</dt>
                <dd className="space-y-0.5 text-neutral-300">
                  {(['c1', 'c2'] as const).map(k => m.print![k] && (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-sm border border-white/20" style={{ background: m.print![k]!.hex }} />
                      {k} → {m.print![k]!.token} <span className="text-neutral-500">{m.print![k]!.cmyk} · ΔE {m.print![k]!.deltaE}</span>
                    </div>
                  ))}
                  {m.print.cmyk && (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-sm border border-white/20" style={{ background: row.ring }} />
                      ring <span className="text-neutral-500">{m.print.cmyk.ring}</span>
                      {row.charges.map((c, i) => m.print!.cmyk!.charges?.[i] && (
                        <span key={i} className="ml-2 inline-flex items-center gap-1.5">
                          <span className="inline-block h-3 w-3 rounded-sm border border-white/20" style={{ background: c.colour }} />
                          {c.shape} <span className="text-neutral-500">{m.print!.cmyk!.charges[i]}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </>
            )}
          </dl>

          {m?.checks && (
            <div>
              <p className={LABEL}>Checks</p>
              <ul className="space-y-1 text-xs">
                {m.checks.map(c => (
                  <li key={c.id} className="grid grid-cols-[3.5rem_1fr] gap-2">
                    <span className={`font-medium uppercase ${CHECK_META[c.status]}`}>{c.status}</span>
                    <span className="text-neutral-300"><span className="text-neutral-400">{c.label}.</span> {c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="space-y-1 text-xs text-neutral-400">
        <p className={LABEL}>Home kit</p>
        <p>
          {kit ? <>{kit.pattern} · <Swatch hex={kit.c1} /> {kit.c1}{kit.c2 && <> / <Swatch hex={kit.c2} /> {kit.c2}</>}</> : 'None'}
          {' · '}{KIT_SOURCE[m?.kit_source ?? 'none'] ?? m?.kit_source}
          {m?.kit_confidence != null && m.kit_source !== 'override' ? ` · fit ${m.kit_confidence}` : ''}
          {wikiPage(m?.kit_page ?? '') && <> · <a className="inline-flex items-center gap-0.5 text-sky-300 hover:underline" href={wikiPage(m!.kit_page)!} target="_blank" rel="noreferrer">page <ArrowSquareOut size={11} /></a></>}
        </p>
        {m?.kit_note && <p className="text-neutral-500">{m.kit_note}</p>}
      </div>

      <form className="space-y-2 rounded-lg border border-white/10 p-3" onSubmit={e => { e.preventDefault(); save() }}>
        <p className={LABEL}>Overrides (written back into the input)</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-neutral-400">Family
            <select className={`${SELECT} mt-1 w-full`} value={form.family} onChange={e => setForm(f => ({ ...f, family: e.target.value }))}>
              <option value="">{m?.seed_family ? `Default (${m.seed_family})` : 'From the crest'}</option>
              {CREST_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-400">Code
            <input className={`${INPUT} mt-1 uppercase`} maxLength={3} placeholder={m?.code ?? 'Auto'} value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </label>
          <label className="text-xs text-neutral-400">Pattern
            <select className={`${SELECT} mt-1 w-full`} value={form.pattern} onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}>
              <option value="">Kit ({m?.kit_pattern || 'none'})</option>
              {KIT_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <span />
          {(['c1', 'c2'] as const).map(k => (
            <label key={k} className="text-xs text-neutral-400">{k}
              <span className="mt-1 flex gap-1.5">
                <input type="color" aria-label={`${k} picker`} className="h-8 w-9 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                  value={isHex(form[k]) ? form[k] : (isHex(kit?.[k]) ? kit![k]! : '#000000')}
                  disabled={k === 'c2' && form.noC2}
                  onChange={e => setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }))} />
                <input className={`${INPUT} ${badHex(form[k]) ? 'border-rose-400/60' : ''}`} placeholder={(k === 'c1' ? kit?.c1 : kit?.c2) ?? 'Kit'}
                  value={form[k]} disabled={k === 'c2' && form.noC2} onChange={e => setForm(f => ({ ...f, [k]: e.target.value.trim() }))} />
              </span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          <input type="checkbox" checked={form.noC2} onChange={e => setForm(f => ({ ...f, noC2: e.target.checked }))} /> No second colour (solid)
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY} disabled={busy || !dirty || badHex(form.c1) || badHex(form.c2)}>Save and regenerate</button>
          <button type="button" className={BUTTON} disabled={busy || Object.values(seed).every(v => v === '' || v === false) && m?.override_charge == null && m?.override_rim == null}
            onClick={() => onMark({ action: 'override', overrides: { family: null, code: null, pattern: null, c1: null, c2: null, charge: null, rim: null } })}>
            Clear overrides
          </button>
        </div>
        {m?.reviewed_by && <p className="text-[11px] text-neutral-500">Last reviewed by {m.reviewed_by}{m.reviewed_at ? `, ${new Date(m.reviewed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.</p>}
      </form>
    </section>
  )
}

function Swatch({ hex }: { hex: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-sm border border-white/20 align-middle" style={{ background: hex }} />
}

type ChargeDraft = { mode: 'default' | 'set'; list: Charge[] }
type RimDraft = { mode: 'default' | 'set'; rim: RimBand[] | undefined }

type SliderKey = 'scale' | 'rotate' | 'x' | 'y' | 'sx' | 'sy'
const SLIDERS: { key: SliderKey; label: string; min: number; max: number; step: number; unit: string; reset: number }[] = [
  { key: 'scale', label: 'Scale', min: CHARGE_LIMITS.scale[0], max: CHARGE_LIMITS.scale[1], step: 0.01, unit: '×', reset: 1 },
  { key: 'rotate', label: 'Rotate', min: CHARGE_LIMITS.rotate[0], max: CHARGE_LIMITS.rotate[1], step: 1, unit: '°', reset: 0 },
  { key: 'x', label: 'Left / right', min: CHARGE_LIMITS.offset[0], max: CHARGE_LIMITS.offset[1], step: 0.1, unit: '', reset: 0 },
  { key: 'y', label: 'Up / down', min: CHARGE_LIMITS.offset[0], max: CHARGE_LIMITS.offset[1], step: 0.1, unit: '', reset: 0 },
  { key: 'sx', label: 'Stretch across', min: CHARGE_LIMITS.stretch[0], max: CHARGE_LIMITS.stretch[1], step: 0.01, unit: '×', reset: 1 },
  { key: 'sy', label: 'Stretch down', min: CHARGE_LIMITS.stretch[0], max: CHARGE_LIMITS.stretch[1], step: 0.01, unit: '×', reset: 1 },
]
const LAYER_LABELS: Record<ChargeLayer, string> = { field: 'Field (every size)', emblem: 'Emblem', over: 'Over the rim' }

function ColourPick({ value, onChange, swatches, label }: { value: string; onChange: (hex: string) => void; swatches: string[]; label: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <input type="color" aria-label={label} title={label} className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
        value={value.toLowerCase()} onChange={e => onChange(e.target.value.toUpperCase())} />
      {swatches.map(h => (
        <button key={h} type="button" aria-label={`${label}: ${h}`} title={h} onClick={() => onChange(h)}
          className={`h-4 w-4 rounded-full border ${value === h ? 'border-emerald-300 ring-1 ring-emerald-300' : 'border-white/30'}`} style={{ background: h }} />
      ))}
    </span>
  )
}

/**
 * The mark's design: the rim (0–3 bands, edge first) and the charges on the field —
 * primitives or emblems from the house library, bottom first, each with its colour
 * slots, scale, stretch, rotation, position and layer. Edits preview live in the marks
 * above; Save writes them as review overrides and regenerates.
 */
function DesignEditor({ row, charges, rim, busy, dirty, onCharges, onRim, onDefault, onSave }: {
  row: ClubMarkRow
  charges: ChargeDraft
  rim: RimDraft
  busy: boolean
  dirty: boolean
  onCharges: (list: Charge[]) => void
  onRim: (rim: RimBand[] | undefined) => void
  onDefault: () => void
  onSave: () => void
}) {
  const list = charges.list
  const swatches = [...new Set([row.ring, row.c1, row.c2, WHITE, INK, '#F2B300'].filter((h): h is string => !!h))]
  const patch = (i: number, p: Partial<Charge>) => onCharges(list.map((c, j) => (j === i ? normalizeCharge({ ...c, ...p }) : c)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d]!, next[i]!]
    onCharges(next)
  }
  const bands = rim.rim
  const setBand = (i: number, b: Partial<RimBand>) => onRim((bands ?? []).map((x, j) => (j === i ? { ...x, ...b } : x)))
  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>Rim {rim.mode === 'default' && <span className="normal-case text-neutral-500">· default</span>}</p>
        <span className="flex gap-1.5">
          <button type="button" className={BUTTON} onClick={() => onRim(undefined)} aria-pressed={!bands}>Default ring</button>
          <button type="button" className={BUTTON} onClick={() => onRim([])} aria-pressed={!!bands && !bands.length}>No rim</button>
          <button type="button" className={BUTTON} disabled={(bands?.length ?? 0) >= RIM_LIMITS.bands}
            onClick={() => onRim([...(bands ?? []), { colour: bands?.length ? WHITE : row.ring, width: bands?.length ? 3 : 9 }])}>
            <Plus size={14} /> Band
          </button>
        </span>
      </div>
      {!bands && <p className="text-xs text-neutral-500">The default: a ring in {row.ring} (9) and a white gap (3).</p>}
      {bands && !bands.length && <p className="text-xs text-neutral-500">No rim: the field runs to the edge.</p>}
      {bands?.map((b, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 p-2">
          <span className="w-12 text-[11px] text-neutral-500">{i ? `Band ${i + 1}` : 'Edge'}</span>
          <ColourPick value={b.colour} swatches={swatches} label={`Rim band ${i + 1} colour`} onChange={colour => setBand(i, { colour })} />
          <label className="min-w-32 flex-1 text-[11px] text-neutral-400">
            <span className="flex justify-between"><span>Width</span><span className="tabular-nums text-neutral-300">{b.width}</span></span>
            <input type="range" className="w-full accent-emerald-400" min={RIM_LIMITS.width[0]} max={RIM_LIMITS.width[1]} step={0.1} value={b.width}
              onChange={e => setBand(i, { width: Number(e.target.value) })} />
          </label>
          <button type="button" className="rounded p-1 text-rose-300 hover:text-rose-200" aria-label={`Remove rim band ${i + 1}`}
            onClick={() => onRim(bands.filter((_, j) => j !== i))}><Trash size={13} /></button>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        <p className={LABEL}>Charges {charges.mode === 'default' && <span className="normal-case text-neutral-500">· default</span>}</p>
        <button type="button" className={BUTTON} disabled={list.length >= CHARGE_LIMITS.count}
          onClick={() => onCharges([...list, { shape: 'circle', colour: row.ring }])}>
          <Plus size={14} /> Add
        </button>
      </div>
      {list.length === 0 && <p className="text-xs text-neutral-500">No charges: the field shows the kit alone.</p>}
      <ol className="space-y-2">
        {list.map((c, i) => {
          const slots = chargeSlots(c.shape)
          const colours = [c.colour, ...(c.colours ?? [])]
          return (
            <li key={i} className="space-y-2 rounded-md border border-white/10 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-4 text-[11px] tabular-nums text-neutral-500">{i + 1}</span>
                <select className={SELECT} aria-label={`Charge ${i + 1}`} value={c.shape} onChange={e => patch(i, { shape: e.target.value as Charge['shape'] })}>
                  <optgroup label="Shapes">{CHARGE_SHAPES.map(sh => <option key={sh} value={sh}>{CHARGE_LABELS[sh]}</option>)}</optgroup>
                  <optgroup label="Emblems">{EMBLEM_IDS.map(sh => <option key={sh} value={sh}>{CHARGE_LABELS[sh]}</option>)}</optgroup>
                </select>
                <select className={SELECT} aria-label={`Charge ${i + 1} layer`} value={c.layer ?? 'emblem'} onChange={e => patch(i, { layer: e.target.value as ChargeLayer })}>
                  {(Object.keys(LAYER_LABELS) as ChargeLayer[]).map(l => <option key={l} value={l}>{LAYER_LABELS[l]}</option>)}
                </select>
                <span className="ml-auto flex gap-0.5">
                  <button type="button" className="rounded p-1 text-neutral-400 hover:text-white disabled:opacity-30" aria-label="Move back" title="Move back" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                  <button type="button" className="rounded p-1 text-neutral-400 hover:text-white disabled:opacity-30" aria-label="Move forward" title="Move forward" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                  <button type="button" className="rounded p-1 text-rose-300 hover:text-rose-200" aria-label={`Remove charge ${i + 1}`} onClick={() => onCharges(list.filter((_, j) => j !== i))}><Trash size={13} /></button>
                </span>
              </div>
              <div className="space-y-1">
                {slots.map((slot, k) => (
                  <div key={slot} className="flex items-center gap-2">
                    <span className="w-24 truncate text-[11px] text-neutral-500" title={slot}>{slot}</span>
                    <ColourPick value={colours[k] ?? c.colour} swatches={swatches} label={`Charge ${i + 1} ${slot}`}
                      onChange={hex => {
                        if (k === 0) return patch(i, { colour: hex })
                        const rest = slots.slice(1).map((_, j) => (j === k - 1 ? hex : colours[j + 1] ?? c.colour))
                        patch(i, { colours: rest })
                      }} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {SLIDERS.map(sl => {
                  const v = c[sl.key] ?? sl.reset
                  return (
                    <label key={sl.key} className="text-[11px] text-neutral-400">
                      <span className="flex justify-between"><span>{sl.label}</span><span className="tabular-nums text-neutral-300">{v}{sl.unit}</span></span>
                      <input type="range" className="w-full accent-emerald-400" min={sl.min} max={sl.max} step={sl.step} value={v}
                        onChange={e => patch(i, { [sl.key]: Number(e.target.value) })} onDoubleClick={() => patch(i, { [sl.key]: sl.reset })} />
                    </label>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !dirty} onClick={onSave}>Save design and regenerate</button>
        <button type="button" className={BUTTON} disabled={busy || (charges.mode === 'default' && rim.mode === 'default')} onClick={onDefault}>Use editorial default</button>
      </div>
      <p className="text-[11px] text-neutral-500">Double-click a slider to reset it. Later charges sit on top. Field-layer charges show at chip size; over-layer ones sit above the rim.</p>
    </div>
  )
}
