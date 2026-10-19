'use client'

import { useMemo, useState } from 'react'
import { ArrowClockwise, ArrowSquareOut, Check, CircleNotch, MagicWand, Warning } from '@phosphor-icons/react'
import { renderClubMark } from '@vismay/club-marks/render'
import {
  BOOK_PAPER, CREST_FAMILIES, KIT_PATTERNS, type CheckStatus, type ClubMarkTier, type CrestFamily, type KitPattern,
} from '@vismay/club-marks/types'
import { isHex, markKit, markRow, markState, type CrestView, type MarkState } from '@/lib/seasonBooks/crests'
import { BUTTON, INPUT, LABEL, PRIMARY, SELECT } from './shared'

/**
 * Club marks in the Crests viewer (Club Mark Generator spec): the grid tile, its
 * caption, and the review-queue panel — the real crest beside the generated mark,
 * the family guess and its confidence, the six checks, the print swatches, and the
 * overrides that are written back into the input. Marks are drawn here from the
 * stored row by the same pure renderer every surface uses.
 */

export type Surface = 'paper' | 'dark' | 'club'
export const SURFACES: Record<Surface, { label: string; hex: (c1: string) => string }> = {
  paper: { label: 'Paper', hex: () => BOOK_PAPER },
  dark: { label: 'Dark', hex: () => '#15161A' },
  club: { label: 'Club colour', hex: c1 => c1 },
}

export type MarkAction =
  | { action: 'generate' }
  | { action: 'confirm' }
  | { action: 'override'; overrides: { family: CrestFamily | null; code: string | null; pattern: KitPattern | null; c1: string | null; c2: string | null } }

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

/** The SVG string comes from renderClubMark() over a validated row (hex colours, known family/pattern, sanitised code). */
function Svg({ markup, className }: { markup: string; className?: string }) {
  return <span className={`inline-flex ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: markup }} />
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

/** The grid tile: the token on the chosen surface, or the spec's dashed placeholder. */
export function MarkTile({ crest, surface }: { crest: CrestView; surface: Surface }) {
  const row = markRow(crest.mark)
  if (!row) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-white/20 text-neutral-500">
        {crest.mark?.status === 'error' || !markKit(crest.mark) ? <Warning size={22} /> : <MagicWand size={22} />}
      </div>
    )
  }
  const bg = SURFACES[surface].hex(row.c1)
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-md border border-white/10" style={{ background: bg }}>
      <Svg markup={renderClubMark(row, 'token', { surface: bg, size: 50 })} />
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

export function ClubMarkPanel({ crest, busy, onMark, dupes }: { crest: CrestView; busy: boolean; onMark: (a: MarkAction) => void; dupes: Set<string> }) {
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
              <Svg markup={renderClubMark(row, 'hero', { size: 72 })} />
              <figcaption className="text-[10px] text-neutral-600">
                {row.crest} · {m?.override_family ? 'set by hand' : `${Math.round((m?.family_confidence ?? 0) * 100)}% sure`}
              </figcaption>
            </figure>
          </div>

          <div className="space-y-1.5">
            {[BOOK_PAPER, '#15161A', row.c1].map((bg, i) => (
              <div key={bg + i} className="flex items-end gap-3 rounded-lg border border-white/10 px-3 py-2" style={{ background: bg }}>
                {(['dot', 'token', 'hero'] as ClubMarkTier[]).map(tier => (
                  <Svg key={tier} markup={renderClubMark(row, tier, { surface: bg, size: tier === 'dot' ? 16 : tier === 'token' ? 32 : 64 })} />
                ))}
                <span className="ml-auto self-center text-[10px]" style={{ color: i === 0 ? '#6b6b6b' : '#d4d4d4' }}>
                  {['Paper', 'Dark', 'Club colour'][i]} · dot 16, token 32, hero 64
                </span>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-neutral-500">Row</dt>
            <dd className="font-mono text-[11px] text-neutral-300">
              {`{ code: '${row.code}', crest: '${row.crest}', pattern: '${row.pattern}', c1: '${row.c1}', c2: ${row.c2 ? `'${row.c2}'` : 'null'}, league: '${row.league}', from: ${row.from}, to: ${row.to ?? 'null'} }`}
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
              <option value="">From the crest</option>
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
          <button type="button" className={BUTTON} disabled={busy || Object.values(seed).every(v => v === '' || v === false)}
            onClick={() => onMark({ action: 'override', overrides: { family: null, code: null, pattern: null, c1: null, c2: null } })}>
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
