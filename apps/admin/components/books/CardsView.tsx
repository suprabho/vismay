'use client'

import { useEffect, useMemo } from 'react'
import { CaretLeft, CaretRight, Database, PencilLine } from '@phosphor-icons/react'
import { leagueMatches, teamsOf, topTeams } from '@/lib/seasonBooks/matches'
import {
  BOOK_COMPETITIONS, DATA_PRESETS, advanceStatus, LEAGUE_COMPETITIONS, SPREAD_STATUSES, bookChapters, cardIssues, chapterLabel, seasonLabel, seasonMonths, wordCount,
  type DataBinding, type DataPreset, type Spread, type SpreadStatus,
} from '@/lib/seasonBooks/plan'
import { CHART_FORMS, ROLE_META, TEMPLATES, TEMPLATE_ORDER, type ChartForm, type TemplateId } from '@/lib/seasonBooks/system'
import type { BookViewProps } from './BookWorkspace'
import { DataChart } from './DataChart'
import { useMatches } from './MatchData'
import { BUTTON, ICON_BUTTON, INPUT, IssueList, LABEL, PANEL, RoleBadge, SELECT, WordMeter } from './shared'
import { SketchPad } from './SketchPad'
import { SpreadThumb } from './SpreadThumb'

/**
 * Step 3: a card for each spread, written before it's designed. Headline (the
 * claim) and the chart that proves it sit side by side and are written
 * together; then one stat, 80–150 words and the caption.
 */
export function CardsView({ plan, seasonStart, title, edit, spreadId, setSpreadId }: BookViewProps & { spreadId: string | null; setSpreadId: (id: string) => void }) {
  const spreads = plan.spreads
  const selected = spreads.find(s => s.id === spreadId) ?? spreads[0]
  useEffect(() => { if (selected && selected.id !== spreadId) setSpreadId(selected.id) }, [selected, spreadId, setSpreadId])
  const index = selected ? spreads.indexOf(selected) : -1

  if (!selected) return <p className="px-6 py-10 text-sm text-neutral-500">No spreads yet. Place some beats on the flatplan first.</p>

  return (
    <div className="mx-auto grid max-w-[96rem] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav className="h-fit space-y-0.5 lg:sticky lg:top-4" aria-label="Spreads">
        {spreads.map((s, i) => {
          const warns = cardIssues(s).filter(x => x.severity === 'warn').length
          const showChapter = i === 0 || spreads[i - 1].chapter !== s.chapter
          return (
            <div key={s.id}>
              {showChapter && <div className="mb-1 mt-3 px-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500 first:mt-0">{chapterLabel(s.chapter)}</div>}
              <button type="button" onClick={() => setSpreadId(s.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${s.id === selected.id ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'}`}>
                <RoleBadge template={s.template} number={i + 1} />
                <span className="min-w-0 flex-1 truncate">{s.headline || <span className="text-neutral-600">{TEMPLATES[s.template].label}</span>}</span>
                {warns > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title={`${warns} to fix`} />}
              </button>
            </div>
          )
        })}
      </nav>
      <CardEditor key={selected.id} spread={selected} number={index + 1} plan={plan} seasonStart={seasonStart} title={title}
        onChange={patch => edit(p => ({
          ...p,
          spreads: p.spreads.map(s => {
            if (s.id !== selected.id) return s
            const next = { ...s, ...patch }
            // A status picked by hand stands; otherwise the card's content moves it on.
            return 'status' in patch ? next : { ...next, status: advanceStatus(next) }
          }),
        }))}
        onPrev={index > 0 ? () => setSpreadId(spreads[index - 1].id) : undefined}
        onNext={index < spreads.length - 1 ? () => setSpreadId(spreads[index + 1].id) : undefined} />
    </div>
  )
}

function CardEditor({ spread, number, plan, seasonStart, title, onChange, onPrev, onNext }: {
  spread: Spread
  number: number
  plan: BookViewProps['plan']
  seasonStart: number
  title: string
  onChange: (patch: Partial<Spread>) => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const t = TEMPLATES[spread.template]
  const beat = plan.beats.find(b => b.id === spread.beatId)
  const issues = cardIssues(spread)
  const setChart = (patch: Partial<Spread['chart']>) => onChange({ chart: { ...spread.chart, ...patch } })
  const setTemplate = (template: TemplateId) => onChange({
    template,
    chart: { ...spread.chart, form: TEMPLATES[template].forms.includes(spread.chart.form) ? spread.chart.form : TEMPLATES[template].forms[0] },
  })

  return (
    <article className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" className={ICON_BUTTON} onClick={onPrev} disabled={!onPrev} title="Previous spread"><CaretLeft size={16} /></button>
        <button type="button" className={ICON_BUTTON} onClick={onNext} disabled={!onNext} title="Next spread"><CaretRight size={16} /></button>
        <h2 className="mr-auto text-lg font-semibold text-white">Spread {number} <span className="font-normal text-neutral-500">· {chapterLabel(spread.chapter)}</span></h2>
        <select className={SELECT} value={spread.template} onChange={e => setTemplate(e.target.value as TemplateId)} aria-label="Template">
          {TEMPLATE_ORDER.map(id => <option key={id} value={id}>{TEMPLATES[id].label} · {ROLE_META[TEMPLATES[id].role].label}</option>)}
        </select>
        <select className={SELECT} value={spread.chapter} onChange={e => onChange({ chapter: e.target.value })} aria-label="Chapter">
          {bookChapters(seasonStart).map(c => <option key={c} value={c}>{chapterLabel(c)}</option>)}
        </select>
        <select className={SELECT} value={spread.status} onChange={e => onChange({ status: e.target.value as SpreadStatus })} aria-label="Status">
          {Object.entries(SPREAD_STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-5">
          <div>
            <label className={LABEL} htmlFor="beat">Beat</label>
            <select id="beat" className={`${SELECT} w-full`} value={spread.beatId ?? ''} onChange={e => onChange({ beatId: e.target.value || null })}>
              <option value="">No beat</option>
              {plan.beats.filter(b => b.text.trim()).map(b => <option key={b.id} value={b.id}>{b.month ? `${chapterLabel(b.month, true)} · ` : ''}{b.text}</option>)}
            </select>
            {beat?.evidence && <p className="mt-1 text-xs text-neutral-500">Evidence: {beat.evidence}</p>}
          </div>

          {/* Hand in hand: the claim and the chart that proves it, written together. */}
          <section className={`${PANEL} grid gap-4 p-4 md:grid-cols-2`}>
            <div className="space-y-3">
              <div>
                <label className={LABEL} htmlFor="headline">Headline · the claim</label>
                <textarea id="headline" rows={3} maxLength={200} value={spread.headline} onChange={e => onChange({ headline: e.target.value })}
                  placeholder={beat?.text ?? 'What this spread proves, in one line'}
                  className={`${INPUT} resize-y text-lg font-semibold leading-snug`} />
              </div>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                <div>
                  <label className={LABEL} htmlFor="stat">Stat</label>
                  <input id="stat" className={`${INPUT} text-lg font-bold tabular-nums`} maxLength={24} value={spread.stat.value} placeholder="49"
                    onChange={e => onChange({ stat: { ...spread.stat, value: e.target.value } })} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="stat-label">What it counts</label>
                  <input id="stat-label" className={INPUT} maxLength={160} value={spread.stat.label} placeholder="league games unbeaten"
                    onChange={e => onChange({ stat: { ...spread.stat, label: e.target.value } })} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`${LABEL} mb-0 flex items-center gap-1`}><PencilLine size={12} /> Chart · the proof</span>
                <select className={`${SELECT} py-1 text-xs`} value={spread.chart.form} onChange={e => setChart({ form: e.target.value as ChartForm })} aria-label="Chart form">
                  {(Object.keys(CHART_FORMS) as ChartForm[]).map(f => <option key={f} value={f} disabled={!t.forms.includes(f)}>{CHART_FORMS[f].label}{t.forms.includes(f) ? '' : ' (not on this template)'}</option>)}
                </select>
              </div>
              <SketchPad strokes={spread.chart.sketch} onChange={sketch => setChart({ sketch })} />
              <input className={`${INPUT} text-xs`} maxLength={1000} value={spread.chart.notes} onChange={e => setChart({ notes: e.target.value })}
                placeholder={`Sketch notes: ${CHART_FORMS[spread.chart.form].reads}`} />
            </div>
          </section>

          <DataSection spread={spread} seasonStart={seasonStart} onChange={data => setChart({ data })} />

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={`${LABEL} mb-0`} htmlFor="body">Body</label>
              <WordMeter words={wordCount(spread.body)} min={t.words.min} max={t.words.max} />
            </div>
            <textarea id="body" rows={7} maxLength={2000} value={spread.body} onChange={e => onChange({ body: e.target.value })}
              placeholder="Why it matters, what to look for in the chart, the one detail no-one remembers."
              className={`${INPUT} resize-y leading-relaxed`} />
          </div>
          <div>
            <label className={LABEL} htmlFor="caption">Chart caption</label>
            <input id="caption" className={INPUT} maxLength={400} value={spread.caption} onChange={e => onChange({ caption: e.target.value })}
              placeholder="What the chart shows and how to read it. Source: …" />
          </div>
          <div>
            <label className={LABEL} htmlFor="notes">Production notes</label>
            <textarea id="notes" rows={2} maxLength={2000} value={spread.notes} onChange={e => onChange({ notes: e.target.value })}
              placeholder="Photo research, fact checks, who's on it" className={`${INPUT} resize-y text-xs`} />
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:h-fit">
          <div>
            <div className={LABEL}>Spread preview · {t.label}</div>
            <SpreadThumb spread={spread} template={spread.template} number={number} bookTitle={title} seasonLabel={seasonLabel(seasonStart)} className="shadow-lg shadow-black/40" />
            <p className="mt-2 text-xs text-neutral-500">{t.description}</p>
          </div>
          <div className={`${PANEL} p-3`}>
            <div className={LABEL}>Card check</div>
            <IssueList issues={issues} empty="The card is complete." />
          </div>
        </aside>
      </div>
    </article>
  )
}

function DataSection({ spread, seasonStart, onChange }: { spread: Spread; seasonStart: number; onChange: (data: DataBinding | null) => void }) {
  const data = spread.chart.data
  const entry = useMatches(data?.competition)
  const teams = useMemo(() => entry?.status === 'ready'
    ? teamsOf(LEAGUE_COMPETITIONS.has(data!.competition) ? leagueMatches(entry.matches) : entry.matches)
    : [], [entry, data])

  function start() {
    const preset: DataPreset = (Object.keys(DATA_PRESETS) as DataPreset[]).find(p => DATA_PRESETS[p].form === spread.chart.form) ?? 'points-race'
    onChange({ preset, competition: 'Premier League', teams: [], month: spread.chapter.match(/^\d{4}-\d{2}$/) ? spread.chapter : null })
  }

  if (!data) {
    return (
      <div className={`${PANEL} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-neutral-400">Not on real data yet. Once the card holds up, bind the chart to the season’s matches.</p>
        <button type="button" className={BUTTON} onClick={start}><Database size={15} /> Pull real data</button>
      </div>
    )
  }

  const set = (patch: Partial<DataBinding>) => onChange({ ...data, ...patch })
  const multi = data.preset === 'points-race'
  const toggleTeam = (team: string) => {
    if (!multi) return set({ teams: [team] })
    set({ teams: data.teams.includes(team) ? data.teams.filter(t => t !== team) : [...data.teams, team].slice(0, 6) })
  }
  const defaults = data.preset === 'points-race' && !data.teams.length && entry?.status === 'ready' ? topTeams(entry.matches) : []

  return (
    <section className={`${PANEL} space-y-3 p-4`}>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={LABEL}>Chart data</label>
          <select className={SELECT} value={data.preset} onChange={e => set({ preset: e.target.value as DataPreset, teams: e.target.value === 'results-strip' ? data.teams.slice(0, 1) : data.teams })}>
            {(Object.keys(DATA_PRESETS) as DataPreset[]).map(p => <option key={p} value={p}>{DATA_PRESETS[p].label}</option>)}
          </select>
        </div>
        <select className={SELECT} value={data.competition} onChange={e => set({ competition: e.target.value, teams: [] })} aria-label="Competition">
          {BOOK_COMPETITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(data.preset === 'month-table' || data.preset === 'results-strip' || data.preset === 'goals-by-month') && (
          <select className={SELECT} value={data.month ?? ''} onChange={e => set({ month: e.target.value || null })} aria-label="Month">
            <option value="">{data.preset === 'month-table' ? 'Final table' : 'Whole season'}</option>
            {seasonMonths(seasonStart).map(m => <option key={m} value={m}>{data.preset === 'month-table' ? `End of ${chapterLabel(m)}` : chapterLabel(m)}</option>)}
          </select>
        )}
        <button type="button" className={`${BUTTON} ml-auto`} onClick={() => onChange(null)}>Unbind</button>
      </div>
      <p className="text-xs text-neutral-500">
        {DATA_PRESETS[data.preset].needs}.{DATA_PRESETS[data.preset].form !== spread.chart.form && ` Draws a ${CHART_FORMS[DATA_PRESETS[data.preset].form].label.toLowerCase()}; the card says ${CHART_FORMS[spread.chart.form].label.toLowerCase()}.`}
      </p>
      {(data.preset === 'points-race' || data.preset === 'results-strip') && teams.length > 0 && (
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {teams.map(team => {
            const on = data.teams.includes(team) || defaults.includes(team)
            return (
              <button key={team} type="button" onClick={() => toggleTeam(team)}
                className={`rounded-full border px-2 py-0.5 text-xs ${data.teams.includes(team) ? 'border-white bg-white text-neutral-950' : on ? 'border-white/40 text-neutral-200' : 'border-white/10 text-neutral-500 hover:text-neutral-300'}`}>
                {team}
              </button>
            )
          })}
        </div>
      )}
      <div className="rounded-md bg-[#F4F1EA] p-3">
        <DataChart binding={defaults.length ? { ...data, teams: defaults } : data} className="w-full" />
      </div>
    </section>
  )
}
