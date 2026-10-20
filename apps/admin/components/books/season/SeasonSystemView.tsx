'use client'

import { useState } from 'react'
import { Lock } from '@phosphor-icons/react'
import { emptyBookSpread, PALETTE_ROLE_LABELS, PALETTE_ROLES, SPREAD_CHECKS, SPREAD_KINDS, SPREAD_MODULES, spreadKeyFor, type PlannedSpread, type SpreadKind } from '@/lib/seasonBooks/seasonSpreads'
import {
  DEFAULT_SPREAD_PALETTE, FRAME_REGIONS, POSITION_COLOURS, REFERENCE_PALETTES, SPREAD_CANVAS, SPREAD_ICONS, SPREAD_TEMPLATES, SPREAD_TYPE_SCALE,
} from '@/lib/seasonBooks/spreadLayouts'
import { PANEL } from '../shared'
import { SpreadCanvas } from './SpreadCanvas'

const SAMPLE: Record<SpreadKind, PlannedSpread> = {
  team: { key: spreadKeyFor('team', 'Barcelona'), kind: 'team', subjectId: 'Barcelona', label: 'Barcelona', part: 'league-laliga', partLabel: 'Spain', league: 'LaLiga' },
  league: { key: spreadKeyFor('league', 'Premier League'), kind: 'league', subjectId: 'Premier League', label: 'Premier League', part: 'league-premier-league', partLabel: 'England' },
  competition: { key: spreadKeyFor('competition', 'Champions League'), kind: 'competition', subjectId: 'Champions League', label: 'Champions League', part: 'european', partLabel: 'European competitions' },
}

/**
 * The season-spread design system, read-only: the canvas, the three
 * templates' regions, the type scale, palettes and marks, icons, modules and
 * checks, as transcribed from the six reference spreads. It lives in code
 * (lib/seasonBooks/spreadLayouts.ts and seasonSpreads.ts) and changes through
 * review, never per book.
 */
export function SeasonSystemView({ seasonStart }: { seasonStart: number }) {
  const [kind, setKind] = useState<SpreadKind>('team')
  const sample = SAMPLE[kind]
  const row = { ...emptyBookSpread(sample), editorial: { ...emptyBookSpread(sample).editorial, headline: kind === 'team' ? 'The turnaround' : kind === 'league' ? 'Nobody beat Arsenal' : 'The outsiders', storyStat: { value: kind === 'team' ? '12 → 2' : kind === 'league' ? '20 → 0' : '3 from 4', label: kind === 'team' ? 'January low → final place' : kind === 'league' ? 'Changes at the top before / after 1 February' : 'Porto’s goals from shots in the final', source: null } } }
  const t = SPREAD_TEMPLATES[kind]

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <div className={`${PANEL} flex flex-wrap items-start gap-3 p-4`}>
        <Lock size={20} weight="fill" className="mt-0.5 text-amber-300" />
        <div className="max-w-3xl text-sm text-neutral-300">
          <p className="font-medium text-white">Locked · season-spread templates {Object.values(SPREAD_TEMPLATES).map(x => x.version).join(', ')}</p>
          <p className="mt-1 text-neutral-400">
            Every league, team and competition spread is set on this canvas, in these regions, in this type, from these modules; what varies by club or
            competition (kit colours, crest family, competition colours) is data, not code. Transcribed from the six reference spreads on the design canvas;
            it changes in <code className="text-neutral-300">apps/admin/lib/seasonBooks/spreadLayouts.ts</code> through code review, never per book.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Canvas and templates</h2>
          <div className="flex gap-1">
            {(Object.keys(SPREAD_KINDS) as SpreadKind[]).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1 text-sm ${kind === k ? 'bg-white text-neutral-950' : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'}`}>{SPREAD_TEMPLATES[k].version}</button>
            ))}
          </div>
        </div>
        <SpreadCanvas spread={sample} row={row} seasonStart={seasonStart} showRegions className="w-full rounded-md shadow-lg shadow-black/40" />
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <dl className="grid h-fit grid-cols-2 content-start gap-x-4 gap-y-2 text-sm">
            {[
              ['Canvas', `${SPREAD_CANVAS.width} × ${SPREAD_CANVAS.height} pt`],
              ['Fold', `x ${SPREAD_CANVAS.fold}`],
              ['Margins', `${SPREAD_CANVAS.margin} pt`],
              ['Content', `x ${SPREAD_CANVAS.pages[0].x0}–${SPREAD_CANVAS.pages[0].x1} and ${SPREAD_CANVAS.pages[1].x0}–${SPREAD_CANVAS.pages[1].x1}`],
              ['Footer rule', `y ${SPREAD_CANVAS.footerRule}`],
              ['Fold gap', `${SPREAD_CANVAS.foldGap} pt, nothing meaningful inside`],
              ['Block gap', `${SPREAD_CANVAS.blockGap} pt minimum`],
              ['Smallest type', `${SPREAD_CANVAS.minType} pt`],
              ['Proof', 'RGB, no bleed; trim and bleed stay open'],
              ['Reference', t.reference],
            ].map(([k, v]) => <div key={k} className="contents"><dt className="text-neutral-500">{k}</dt><dd className="text-neutral-200">{v}</dd></div>)}
          </dl>
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-neutral-500"><tr><th className="pb-1 pr-3">Region</th><th className="pb-1 pr-3">Page</th><th className="pb-1 pr-3">x</th><th className="pb-1 pr-3">y</th><th className="pb-1 pr-3">w × h</th><th className="pb-1">Header</th></tr></thead>
            <tbody className="text-neutral-300">
              {[...FRAME_REGIONS, ...t.regions].map(r => (
                <tr key={r.id} className="border-t border-white/[0.06]">
                  <td className="py-1 pr-3 font-mono text-neutral-200">{r.id}</td><td className="py-1 pr-3 tabular-nums">{r.page}</td><td className="py-1 pr-3 tabular-nums">{r.x}</td><td className="py-1 pr-3 tabular-nums">{r.y}</td><td className="py-1 pr-3 tabular-nums">{r.w} × {r.h}</td><td className="py-1 text-neutral-400">{r.title ?? ''}{r.reflow ? ` · reflow ${r.reflow}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Type scale <span className="text-sm font-normal text-neutral-500">· Archivo, variable weight and width</span></h2>
        <div className="overflow-hidden rounded-lg" style={{ background: DEFAULT_SPREAD_PALETTE.page2Ground, color: '#FFFFFF', fontFamily: 'var(--font-archivo, Archivo), system-ui, sans-serif' }}>
          {SPREAD_TYPE_SCALE.map(s => (
            <div key={s.role} className="grid grid-cols-[9rem_minmax(0,1fr)] items-baseline gap-4 border-b border-white/10 px-4 py-3 last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)_18rem]">
              <div className="text-xs text-neutral-400"><div className="font-semibold text-white">{s.label}</div>{s.sizePt}/{s.leadingPt} pt · {s.weight}{s.caps ? ' · caps' : ''}{s.stretch ? ` · ${s.stretch} width` : ''}</div>
              <div className="truncate" style={{ fontSize: `${Math.min(s.sizePt, 55) * 1.1}px`, lineHeight: 1.05, fontWeight: s.weight, letterSpacing: s.tracking, textTransform: s.caps ? 'uppercase' : undefined, fontStretch: s.stretch, color: s.role === 'story-number' || s.role === 'section' ? DEFAULT_SPREAD_PALETTE.highlight : undefined, fontVariantNumeric: 'tabular-nums' }}>
                {s.role === 'story-number' ? '12 → 2' : s.role === 'code' ? 'BAR · EPL · UCL' : s.role === 'section' ? 'The climb / League position' : s.role === 'running' ? 'FC BARCELONA / 2003-04 • A / THE TURNAROUND' : 'The turnaround'}
              </div>
              <div className="hidden text-xs text-neutral-400 md:block">{s.use}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Palettes</h2>
          <p className="text-sm text-neutral-400">One role set for clubs, leagues and competitions. Clubs derive theirs from kit colours (page 1 = home primary darkened to 7:1 white text, accent = home secondary, highlight = series gold, or white-gold on a yellow kit); competitions from their marks; leagues from their flag tile. The reference palettes:</p>
          <div className="space-y-2">
            {Object.entries(REFERENCE_PALETTES).filter(([k]) => k !== 'team:man-united').map(([key, pal]) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 font-mono text-neutral-300">{key}</span>
                {PALETTE_ROLES.map(role => <span key={role} className="h-6 flex-1 rounded border border-white/10" style={{ background: pal[role] ?? DEFAULT_SPREAD_PALETTE[role] }} title={`${PALETTE_ROLE_LABELS[role]} ${pal[role] ?? DEFAULT_SPREAD_PALETTE[role]}${pal[role] ? '' : ' (default)'}`} />)}
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs"><span className="w-44 shrink-0 font-mono text-neutral-300">stand-in</span>{PALETTE_ROLES.map(role => <span key={role} className="h-6 flex-1 rounded border border-white/10" style={{ background: DEFAULT_SPREAD_PALETTE[role] }} title={PALETTE_ROLE_LABELS[role]} />)}</div>
            <div className="flex gap-2 text-[11px] text-neutral-500">{PALETTE_ROLES.map(r => <span key={r} className="flex-1 truncate">{PALETTE_ROLE_LABELS[r]}</span>)}<span className="w-44 shrink-0" /></div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-neutral-300">
            {Object.entries(POSITION_COLOURS).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: c }} />{k} {c}</span>)}
            <span className="text-neutral-500">· results: win highlight, draw draw, loss accent; legend always required</span>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Icons and marks</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(SPREAD_ICONS).map(([k, d]) => (
              <div key={k} className="flex flex-col items-center gap-1 rounded-md border border-white/10 p-2 text-[11px] text-neutral-400">
                <svg width={24} height={24} viewBox="0 0 16 16"><path d={d} fill="none" stroke={DEFAULT_SPREAD_PALETTE.highlight} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" /></svg>{k}
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-400">16 pt outline icons at 1.1 pt in the highlight colour, one per module header. Club marks are kit-derived tokens (crest family: roundel, heater, oval, plate; kit pattern: solid, stripes, hoops, halves, sash; keyline #15161A, 4% inset, 3-letter code), never the official crest. League marks are flag tiles with a ring and a code (EPL, LIG, SEA, BUN, L1); competition marks are 24 × 16 tiles (UCL star in a ring, cups as flag-in-cup silhouettes). Per-club values live in <code className="text-neutral-300">admin_club_marks</code> once it exists; until then every token is a dashed placeholder.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Modules</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(SPREAD_MODULES) as SpreadKind[]).map(k => (
            <div key={k} className={`${PANEL} p-3`}>
              <h3 className="mb-2 text-sm font-semibold text-white">{SPREAD_KINDS[k].label} <span className="font-normal text-neutral-500">· {SPREAD_TEMPLATES[k].version}</span></h3>
              <ul className="space-y-1.5 text-xs">
                {SPREAD_MODULES[k].map(m => (
                  <li key={m.id} className="grid grid-cols-[1.2rem_minmax(0,1fr)] gap-1">
                    <span className="text-neutral-600">p{m.page}</span>
                    <span><span className="font-medium text-neutral-200">{m.label}</span>{m.optional ? <span className="ml-1 rounded bg-white/10 px-1 text-[10px] uppercase text-neutral-400">optional</span> : null}<span className="text-neutral-500"> · {m.data}</span><br /><span className="text-neutral-400">{m.rules}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-sm text-neutral-400">Reflow never bends the one-spread rule: modules stack top to bottom in their page column with at least 16 pt between blocks; team page 2 overflow goes cup runs → compact strips, two columns for long runs, the bubble chart down to 150 pt, then heatmap and appearances off with a warning; league page 2 keeps the table fixed and shares the rest; competition page 2 keeps a 4 × 2 group grid, and finalists and the final take the space when there is no group stage.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Checks</h2>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-neutral-500"><tr><th className="pb-1 pr-3">Check</th><th className="pb-1 pr-3">Level</th><th className="pb-1 pr-3">Applies to</th><th className="pb-1">Rule</th></tr></thead>
          <tbody className="text-neutral-300">
            {SPREAD_CHECKS.map(c => (
              <tr key={c.id} className="border-t border-white/[0.06]">
                <td className="py-1 pr-3 font-mono text-neutral-200">{c.id}</td>
                <td className="py-1 pr-3"><span className={`rounded px-1 text-[10px] uppercase tracking-wider ${c.level === 'block' ? 'bg-red-400/15 text-red-300' : 'bg-amber-400/15 text-amber-300'}`}>{c.level}</span></td>
                <td className="py-1 pr-3 text-neutral-400">{c.applies === 'all' ? 'all' : c.applies === 'book' ? 'book' : c.applies.join(', ')}{c.local ? ' · runs now' : ''}</td>
                <td className="py-1 text-neutral-400">{c.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
