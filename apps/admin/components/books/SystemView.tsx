'use client'

import { Lock } from '@phosphor-icons/react'
import {
  CHART_FORMS, CHART_STYLE, PAGE, PALETTE, ROLE_META, SYSTEM_VERSION, TEMPLATES, TEMPLATE_ORDER, TYPE_SCALE,
} from '@/lib/seasonBooks/system'
import { ChartGlyph } from './ChartGlyph'
import { PANEL } from './shared'
import { SpreadThumb } from './SpreadThumb'

/**
 * The series system, read-only: grid, type scale, palette, chart style and the
 * spread templates every book is built from. Locked in
 * apps/admin/lib/seasonBooks/system.ts; it changes through review, not per book.
 */
export function SystemView() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <div className={`${PANEL} flex flex-wrap items-start gap-3 p-4`}>
        <Lock size={20} weight="fill" className="mt-0.5 text-amber-300" />
        <div className="max-w-3xl text-sm text-neutral-300">
          <p className="font-medium text-white">Locked · system v{SYSTEM_VERSION}</p>
          <p className="mt-1 text-neutral-400">
            Every book in the series uses this grid, type scale, palette, chart style and these templates. Across 20+ books, that sameness is what
            makes them feel collectible and keeps production sane. It changes in <code className="text-neutral-300">apps/admin/lib/seasonBooks/system.ts</code> through
            code review, never per book.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Grid</h2>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <GridDiagram />
          <dl className="grid h-fit grid-cols-2 content-start gap-x-4 gap-y-2 text-sm">
            {[
              ['Page', `${PAGE.widthMm} × ${PAGE.heightMm} mm`],
              ['Spread', `${PAGE.spreadWidthMm} × ${PAGE.heightMm} mm`],
              ['Columns', `${PAGE.columns} (${PAGE.columns / 2} a page)`],
              ['Rows', `${PAGE.rows}`],
              ['Gutter', `${PAGE.gutterMm} mm`],
              ['Baseline', `${PAGE.baselineMm} mm`],
              ['Margins', `${PAGE.margins.topMm} top · ${PAGE.margins.bottomMm} bottom`],
              ['', `${PAGE.margins.outerMm} outer · ${PAGE.margins.innerMm} inner`],
              ['Bleed', `${PAGE.bleedMm} mm`],
            ].map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="tabular-nums text-neutral-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Type scale</h2>
        <div className="overflow-hidden rounded-lg" style={{ background: PALETTE.paper, color: PALETTE.ink }}>
          {TYPE_SCALE.map(t => (
            <div key={t.role} className="grid grid-cols-[9rem_minmax(0,1fr)] items-baseline gap-4 border-b px-4 py-3 last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)_16rem]" style={{ borderColor: PALETTE.rule }}>
              <div className="text-xs" style={{ color: PALETTE.muted }}>
                <div className="font-semibold" style={{ color: PALETTE.ink }}>{t.label}</div>
                {t.sizePt}/{t.leadingPt}pt · {t.face} {t.weight}{t.caps ? ' · caps' : ''}
              </div>
              <div className="truncate" style={{
                fontSize: `${Math.min(t.sizePt, 64) * 1.1}px`, lineHeight: 1.1, fontWeight: t.weight,
                letterSpacing: t.tracking, textTransform: t.caps ? 'uppercase' : undefined,
                fontVariantNumeric: t.face === 'Numerals' ? 'tabular-nums' : undefined,
              }}>
                {t.face === 'Numerals' ? '2003–04 · 49' : t.role === 'label' ? 'Premier League · October' : 'Arsenal didn’t lose a game'}
              </div>
              <div className="hidden text-xs md:block" style={{ color: PALETTE.muted }}>{t.use}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Palette</h2>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(PALETTE).map(([name, hex]) => (
              <div key={name}>
                <div className="h-14 rounded-md border border-white/10" style={{ background: hex }} />
                <div className="mt-1 text-xs text-neutral-300">{name}</div>
                <div className="font-mono text-[11px] text-neutral-500">{hex}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Chart style</h2>
          <dl className="space-y-2 text-sm">
            {CHART_STYLE.map(r => (
              <div key={r.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="text-neutral-500">{r.label}</dt>
                <dd className="text-neutral-300">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Chart forms</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(CHART_FORMS) as (keyof typeof CHART_FORMS)[]).map(f => (
            <div key={f} className="rounded-md p-2" style={{ background: PALETTE.paper }}>
              <ChartGlyph form={f} className="h-16 w-full" />
              <div className="mt-1 text-xs font-semibold" style={{ color: PALETTE.ink }}>{CHART_FORMS[f].label}</div>
              <div className="text-[11px] leading-tight" style={{ color: PALETTE.muted }}>{CHART_FORMS[f].reads}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Spread templates</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {TEMPLATE_ORDER.map(id => {
            const t = TEMPLATES[id]
            const role = ROLE_META[t.role]
            return (
              <div key={id} className="space-y-2">
                <SpreadThumb spread={null} template={id} showLabels className="shadow-md shadow-black/40" />
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${role.className}`}>{role.label}</span>
                  <h3 className="font-semibold text-white">{t.label}</h3>
                  <span className="ml-auto text-xs tabular-nums text-neutral-500">{t.words.min}–{t.words.max} words</span>
                </div>
                <p className="text-sm text-neutral-300">{t.description}</p>
                <p className="text-xs text-neutral-500">{t.use} Charts: {t.forms.map(f => CHART_FORMS[f].label.toLowerCase()).join(', ')}.</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/** The spread grid: margins, 12 columns across the gutter, 8 rows. */
function GridDiagram() {
  const w = PAGE.spreadWidthMm
  const h = PAGE.heightMm
  const m = PAGE.margins
  const half = w / 2
  const pageCols = PAGE.columns / 2
  const colW = (half - m.outerMm - m.innerMm - PAGE.gutterMm * (pageCols - 1)) / pageCols
  const rowH = (h - m.topMm - m.bottomMm - PAGE.gutterMm * (PAGE.rows - 1)) / PAGE.rows
  const cols: { x: number }[] = []
  for (let p = 0; p < 2; p++) {
    const x0 = p === 0 ? m.outerMm : half + m.innerMm
    for (let c = 0; c < pageCols; c++) cols.push({ x: x0 + c * (colW + PAGE.gutterMm) })
  }
  return (
    <svg viewBox={`-6 -6 ${w + 12} ${h + 12}`} className="w-full rounded-lg" style={{ background: '#0a0a0a' }}>
      <rect x={-PAGE.bleedMm} y={-PAGE.bleedMm} width={w + PAGE.bleedMm * 2} height={h + PAGE.bleedMm * 2} fill="none" stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.4} />
      <rect x={0} y={0} width={w} height={h} fill={PALETTE.paper} />
      {cols.map((c, i) => Array.from({ length: PAGE.rows }, (_, r) => (
        <rect key={`${i}-${r}`} x={c.x} y={m.topMm + r * (rowH + PAGE.gutterMm)} width={colW} height={rowH} fill={PALETTE.accent} opacity={0.09} />
      )))}
      {cols.map((c, i) => <rect key={i} x={c.x} y={m.topMm} width={colW} height={h - m.topMm - m.bottomMm} fill="none" stroke={PALETTE.accent} strokeWidth={0.3} opacity={0.6} />)}
      <line x1={half} y1={0} x2={half} y2={h} stroke={PALETTE.ink} strokeWidth={0.4} />
      {Array.from({ length: Math.floor(h / PAGE.baselineMm) }, (_, i) => (
        <line key={i} x1={0} x2={w} y1={i * PAGE.baselineMm} y2={i * PAGE.baselineMm} stroke={PALETTE.second} strokeWidth={0.1} opacity={0.35} />
      ))}
      {cols.map((c, i) => <text key={i} x={c.x + colW / 2} y={m.topMm - 4} fontSize={5} textAnchor="middle" fill={PALETTE.muted}>{i + 1}</text>)}
    </svg>
  )
}
