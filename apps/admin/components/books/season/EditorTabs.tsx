'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, Plus, Trash } from '@phosphor-icons/react'
import type { HistoryEvent } from '@footshorts/shared/historicalEvents'
import { findBeats } from '@/lib/seasonBooks/matches'
import { seasonLabel, seasonSlug, wordCount } from '@/lib/seasonBooks/plan'
import {
  checksFor, competitionCode, contrastRatio, DOMESTIC_CUPS, HEADLINE_LINES, headlineLines, LEAGUE_COUNTRY, PALETTE_ROLE_LABELS, PALETTE_ROLES,
  PARAGRAPH_WORDS, sameClub, SPREAD_MODULES, spreadIssues, STORY_WORDS,
  type BookSpread, type EditorTabId, type PaletteRole, type SpreadIssue,
} from '@/lib/seasonBooks/seasonSpreads'
import { BUTTON, ICON_BUTTON, INPUT, LABEL, SELECT, WordMeter } from '../shared'
import { spreadPalette } from './SpreadCanvas'
import type { TabProps } from './SpreadEditorView'

/** The panel for the open tab. Every field carries `data-field` so a module click can land on it. */
export function EditorTabPanel({ tab, ...p }: TabProps & { tab: EditorTabId }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!p.field || !ref.current) return
    const el = ref.current.querySelector<HTMLElement>(`[data-field="${CSS.escape(p.field)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
    const input = el?.matches('input,textarea,select') ? el : el?.querySelector<HTMLElement>('input,textarea,select')
    input?.focus()
  }, [tab, p.field, p.spread.key])
  return (
    <div ref={ref} className="space-y-4">
      {tab === 'story' && <StoryTab {...p} />}
      {tab === 'moments' && <MomentsTab {...p} />}
      {tab === 'cups' && <CupsTab {...p} />}
      {tab === 'side' && <SideTab {...p} />}
      {tab === 'people' && <PeopleTab {...p} />}
      {tab === 'race-lead' && <RaceLeadTab {...p} />}
      {tab === 'players' && <PlayersTab {...p} />}
      {tab === 'field-bracket' && <FieldBracketTab {...p} />}
      {tab === 'oddities' && <OdditiesTab {...p} />}
      {tab === 'modules' && <ModulesTab {...p} />}
      {tab === 'colour-marks' && <ColourMarksTab {...p} />}
      {tab === 'checks' && <ChecksTab {...p} />}
    </div>
  )
}

type Editorial = BookSpread['editorial']
const setEditorial = (update: TabProps['update'], patch: Partial<Editorial>) => update(r => ({ ...r, editorial: { ...r.editorial, ...patch } }))
const setTeam = (update: TabProps['update'], patch: Partial<NonNullable<BookSpread['team']>>) => update(r => r.team ? { ...r, team: { ...r.team, ...patch } } : r)
const setLeague = (update: TabProps['update'], patch: Partial<NonNullable<BookSpread['league']>>) => update(r => r.league ? { ...r, league: { ...r.league, ...patch } } : r)
const setCompetition = (update: TabProps['update'], patch: Partial<NonNullable<BookSpread['competition']>>) => update(r => r.competition ? { ...r, competition: { ...r.competition, ...patch } } : r)

function Field({ id, label, hint, children }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div data-field={id}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className={`${LABEL} mb-0`} htmlFor={`f-${id}`}>{label}</label>
        {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

interface NamesInputProps { id: string; value: string[]; max: number; placeholder: string; onChange: (v: string[]) => void }

/** A list of names as one comma-separated input, committed on blur; a change from outside remounts it. */
function NamesInput(props: NamesInputProps) {
  return <NamesInputInner key={props.value.join('|')} {...props} />
}

function NamesInputInner({ id, value, max, placeholder, onChange }: NamesInputProps) {
  const [text, setText] = useState(value.join(', '))
  return (
    <input id={`f-${id}`} className={INPUT} value={text} placeholder={placeholder} maxLength={max * 80}
      onChange={e => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').map(s => s.trim()).filter(Boolean).slice(0, max))} />
  )
}

// ---------------------------------------------------------------------------

function StoryTab({ row, update, data, spread }: TabProps) {
  const e = row.editorial
  const lines = headlineLines(e.headline)
  const words = wordCount(e.story)
  const suggestions = useMemo(() => {
    const out: { value: string; label: string; source: string }[] = []
    const src = `computed from ${data.competition ?? 'the match data'} results`
    if (spread.kind === 'team' && data.table.length) {
      const i = data.table.findIndex(r => r.team === spread.subjectId)
      const r = data.table[i]
      if (r) {
        out.push({ value: `${r.w}-${r.d}-${r.l}`, label: `${data.competition} record`, source: src })
        out.push({ value: String(r.pts), label: `${data.competition} points, ${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}`, source: src })
        out.push({ value: `${r.gf}:${r.ga}`, label: 'League goals for and against', source: src })
        if (r.l === 0) out.push({ value: '0', label: 'League defeats all season', source: src })
      }
    } else if (spread.kind === 'league' && data.table.length) {
      const [c, r] = data.table
      out.push({ value: String(c.pts), label: `${c.team}’s points as champions`, source: src })
      if (r) out.push({ value: `${c.pts - r.pts}`, label: `Points from first to second`, source: src })
      const goals = data.table.reduce((s, t) => s + t.gf, 0)
      out.push({ value: String(goals), label: 'League goals', source: src })
    } else if (spread.kind === 'competition' && data.rows.length) {
      const goals = data.rows.reduce((s, m) => s + m.hg + m.ag, 0)
      out.push({ value: String(data.rows.length), label: 'Matches, qualifying included', source: src })
      out.push({ value: (goals / data.rows.length).toFixed(2), label: 'Goals a game', source: src })
    }
    return out
  }, [data, spread])

  return (
    <>
      <Field id="headline" label="Headline" hint={<span className={lines > HEADLINE_LINES ? 'text-amber-300' : ''}>{lines}/{HEADLINE_LINES} lines at 55 pt · {e.headline.length}/40</span>}>
        <textarea id="f-headline" rows={2} maxLength={40} value={e.headline} onChange={ev => setEditorial(update, { headline: ev.target.value })}
          placeholder="Two lines, uppercase on the page" className={`${INPUT} resize-none text-lg font-extrabold uppercase leading-snug`} />
      </Field>
      <div data-field="storyStat" className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
        <div>
          <label className={LABEL} htmlFor="f-stat">Story stat</label>
          <input id="f-stat" className={`${INPUT} text-lg font-bold tabular-nums`} maxLength={16} value={e.storyStat.value} placeholder="20 → 0"
            onChange={ev => setEditorial(update, { storyStat: { ...e.storyStat, value: ev.target.value } })} />
        </div>
        <div>
          <label className={LABEL} htmlFor="f-stat-label">What it counts</label>
          <input id="f-stat-label" className={INPUT} maxLength={48} value={e.storyStat.label} placeholder="lead changes before and after 1 February"
            onChange={ev => setEditorial(update, { storyStat: { ...e.storyStat, label: ev.target.value } })} />
        </div>
        <div className="col-span-2">
          <input className={`${INPUT} text-xs`} maxLength={120} value={e.storyStat.source ?? ''} placeholder="Source: the pack stat that proves it, or a URL"
            onChange={ev => setEditorial(update, { storyStat: { ...e.storyStat, source: ev.target.value || null } })} />
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(s => (
            <button key={s.label} type="button" className={`${BUTTON} py-0.5 text-xs`} title={s.source} onClick={() => setEditorial(update, { storyStat: s })}>
              <span className="font-bold tabular-nums">{s.value}</span> {s.label}
            </button>
          ))}
        </div>
      )}
      <Field id="story" label="Story copy" hint={<WordMeter words={words} min={0} max={STORY_WORDS} />}>
        <textarea id="f-story" rows={4} maxLength={240} value={e.story} onChange={ev => setEditorial(update, { story: ev.target.value })}
          placeholder="At most thirty words: the season in one breath." className={`${INPUT} resize-y leading-relaxed`} />
      </Field>
      <Field id="highlight" label={spread.kind === 'team' ? 'Drawn in colour' : 'Clubs drawn in colour'} hint="up to 4; the rest are context">
        <NamesInput id="highlight" value={e.highlight} max={4} placeholder="Names, comma-separated" onChange={v => setEditorial(update, { highlight: v })} />
      </Field>
    </>
  )
}

// ---------------------------------------------------------------------------

const eventsCache = new Map<string, Promise<HistoryEvent[]>>()

/** The season's verified events (admin_historical_events), fetched once per season. */
function useSeasonEvents(seasonStart: number): { events: HistoryEvent[]; error: string } {
  const [state, setState] = useState<{ events: HistoryEvent[]; error: string }>({ events: [], error: '' })
  useEffect(() => {
    const season = seasonSlug(seasonStart)
    let p = eventsCache.get(season)
    if (!p) {
      p = fetch(`/api/footshorts/season-events?season=${season}`, { cache: 'no-store' }).then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load events')
        return (d.events as HistoryEvent[]).filter(e => e.verified === 'yes' || e.verified === 'fixed')
      })
      eventsCache.set(season, p)
    }
    let live = true
    p.then(events => live && setState({ events, error: '' })).catch(e => { eventsCache.delete(season); if (live) setState({ events: [], error: e.message }) })
    return () => { live = false }
  }, [seasonStart])
  return state
}

function MomentsTab({ row, update, spread, seasonStart }: TabProps) {
  const moments = row.editorial.moments
  const { events, error } = useSeasonEvents(seasonStart)
  const [q, setQ] = useState('')
  const used = new Set(moments.map(m => m.eventId))
  const mine = useMemo(() => events.filter(e => {
    if (spread.kind === 'competition') return e.competition === spread.subjectId
    if (spread.kind === 'league') return e.competition === spread.subjectId
    return e.team_names.split(/[|,]/).some(t => sameClub(t.trim(), spread.subjectId))
  }), [events, spread])
  const shown = mine.filter(e => !used.has(e.id) && (!q || `${e.summary} ${e.people}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 40)
  const set = (next: Editorial['moments']) => setEditorial(update, { moments: next })
  return (
    <>
      <p className="text-xs text-neutral-500">Up to four dated moments. The builder rings each date on the calendar and routes its leader; two on one date would cross.</p>
      {moments.map((m, i) => (
        <div key={i} data-field={`moment-${i}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] gap-2">
          <input type="date" className={`${INPUT} py-1 text-xs`} value={m.date} aria-label="Date" onChange={ev => set(moments.map((x, j) => j === i ? { ...x, date: ev.target.value } : x))} />
          <input className={`${INPUT} py-1 text-xs`} maxLength={120} value={m.text} placeholder="What happened, in one line" onChange={ev => set(moments.map((x, j) => j === i ? { ...x, text: ev.target.value } : x))} />
          <button type="button" className={ICON_BUTTON} title="Remove" onClick={() => set(moments.filter((_, j) => j !== i))}><Trash size={14} /></button>
        </div>
      ))}
      {moments.length < 4 && (
        <button type="button" className={BUTTON} onClick={() => set([...moments, { date: `${seasonStart}-08-01`, text: '', eventId: null }])}><Plus size={14} /> Moment</button>
      )}
      <div data-field="moments" className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`${LABEL} mb-0`}>Verified events · {seasonLabel(seasonStart)}</span>
          <input className={`${INPUT} w-36 py-0.5 text-xs`} value={q} onChange={ev => setQ(ev.target.value)} placeholder="Filter" />
        </div>
        {error && <p className="text-xs text-amber-300">{error}</p>}
        {!error && !mine.length && <p className="text-xs text-neutral-500">No verified events name {spread.label}. Check them on the Season events tab.</p>}
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {shown.map(e => (
            <li key={e.id} className="flex items-start gap-2 rounded-md border border-white/10 bg-neutral-950/60 p-2 text-xs">
              <span className="shrink-0 tabular-nums text-neutral-500">{e.date}</span>
              <span className="min-w-0 flex-1 text-neutral-200">{e.summary}</span>
              <button type="button" className={`${BUTTON} shrink-0 py-0.5 text-[11px]`} disabled={moments.length >= 4}
                onClick={() => set([...moments, { date: e.date, text: e.summary.slice(0, 120), eventId: e.id }])}><Plus size={11} /></button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function CupsTab({ row, update, spread, plan }: TabProps) {
  const team = row.team
  if (!team) return null
  const country = spread.league ? LEAGUE_COUNTRY[spread.league] : undefined
  const cups = [...plan.scope.european, ...(country ? plan.scope.domestic.filter(c => (DOMESTIC_CUPS[country] ?? []).includes(c)) : plan.scope.domestic)]
  return (
    <>
      <p className="text-xs text-neutral-500">One paragraph per competition {spread.subjectId} played; leave the ones it didn’t blank. Rail aligns runs on the final; ladder stacks the rounds and expands a group stage into a table.</p>
      {cups.map(c => {
        const words = wordCount(team.cupParagraphs[c] ?? '')
        return (
          <div key={c} data-field={c}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className={`${LABEL} mb-0`} htmlFor={`f-${c}`}>{c} <span className="text-neutral-600">· {competitionCode(c)}</span></label>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] tabular-nums ${words > PARAGRAPH_WORDS ? 'text-amber-300' : 'text-neutral-500'}`}>{words}/{PARAGRAPH_WORDS}</span>
                <select className={`${SELECT} py-0.5 text-xs`} value={team.cupVariant[c] ?? 'rail'} aria-label="Cup-run variant"
                  onChange={ev => setTeam(update, { cupVariant: { ...team.cupVariant, [c]: ev.target.value as 'rail' | 'ladder' } })}>
                  <option value="rail">Rail</option>
                  <option value="ladder">Ladder</option>
                </select>
              </div>
            </div>
            <textarea id={`f-${c}`} rows={2} maxLength={300} className={`${INPUT} resize-y text-xs`} value={team.cupParagraphs[c] ?? ''} placeholder={`The ${c} run, in a sentence or two`}
              onChange={ev => setTeam(update, { cupParagraphs: { ...team.cupParagraphs, [c]: ev.target.value } })} />
          </div>
        )
      })}
      {!cups.length && <p className="text-xs text-neutral-500">No competitions in scope: add them on the Roster.</p>}
    </>
  )
}

function SideTab({ row, update }: TabProps) {
  const team = row.team
  if (!team) return null
  const coach = (patch: Partial<typeof team.coach>) => setTeam(update, { coach: { ...team.coach, ...patch } })
  return (
    <>
      <Field id="turningPoint" label="Turning point" hint="marked on the climb; the XIs split here">
        <input id="f-turningPoint" type="date" className={INPUT} value={team.turningPoint ?? ''} onChange={ev => setTeam(update, { turningPoint: ev.target.value || null })} />
      </Field>
      <div data-field="coach" className="space-y-2">
        <Field id="coach-name" label="Coach"><input id="f-coach-name" className={INPUT} maxLength={80} value={team.coach.name} placeholder="Name" onChange={ev => coach({ name: ev.target.value })} /></Field>
        <Field id="coach-context" label="Context" hint={`${wordCount(team.coach.context)} words`}>
          <textarea id="f-coach-context" rows={2} maxLength={200} className={`${INPUT} resize-y text-xs`} value={team.coach.context} placeholder="Who they were that season, in a line; a mid-season change names both with dates" onChange={ev => coach({ context: ev.target.value })} />
        </Field>
        <Field id="coach-assistants" label="Assistants"><input id="f-coach-assistants" className={`${INPUT} text-xs`} maxLength={120} value={team.coach.assistants} placeholder="Comma-separated" onChange={ev => coach({ assistants: ev.target.value })} /></Field>
        <Field id="coach-source" label="Source URL" hint={team.coach.context.trim() && !/^https?:\/\//.test(team.coach.sourceUrl) ? <span className="text-amber-300">needed for the context</span> : undefined}>
          <input id="f-coach-source" className={`${INPUT} text-xs`} maxLength={500} value={team.coach.sourceUrl} placeholder="https://…" onChange={ev => coach({ sourceUrl: ev.target.value })} />
        </Field>
      </div>
      <Field id="xiSplitDate" label="XI split date" hint={team.turningPoint ? `defaults to the turning point, ${team.turningPoint}` : 'defaults to the turning point'}>
        <input id="f-xiSplitDate" type="date" className={INPUT} value={team.xiSplitDate ?? ''} onChange={ev => setTeam(update, { xiSplitDate: ev.target.value || null })} />
      </Field>
    </>
  )
}

function PeopleTab({ row, update }: TabProps) {
  const team = row.team
  if (!team) return null
  const noteFor = (id: string, label: string) => (
    <Field key={id} id={id} label={`${label} note`} hint={`${wordCount(row.editorial.notes[id] ?? '')}/${PARAGRAPH_WORDS} words`}>
      <textarea id={`f-${id}`} rows={2} maxLength={300} className={`${INPUT} resize-y text-xs`} value={row.editorial.notes[id] ?? ''} placeholder="What to read in it"
        onChange={ev => setEditorial(update, { notes: { ...row.editorial.notes, [id]: ev.target.value } })} />
    </Field>
  )
  return (
    <>
      <Field id="storyPlayers" label="Story players" hint="up to 10, labelled on the bubble chart">
        <NamesInput id="storyPlayers" value={team.storyPlayers} max={10} placeholder="Names as the squad data spells them, comma-separated" onChange={v => setTeam(update, { storyPlayers: v })} />
      </Field>
      <Field id="heatmapPlayers" label="Heatmap players" hint="four × ten months (optional module)">
        <NamesInput id="heatmapPlayers" value={team.heatmapPlayers} max={4} placeholder="Four names, comma-separated" onChange={v => setTeam(update, { heatmapPlayers: v })} />
      </Field>
      {[['xis', 'XIs'], ['bubble', 'Bubble'], ['appearances', 'Appearances'], ['heatmap', 'Heatmap']].map(([id, label]) => noteFor(id, label))}
    </>
  )
}

// ---------------------------------------------------------------------------

function RaceLeadTab({ row, update, data }: TabProps) {
  const league = row.league
  if (!league) return null
  const clubs = data.table.map(r => r.team)
  const highlight = row.editorial.highlight.length ? row.editorial.highlight : clubs.slice(0, 1)
  const toggle = (club: string) => {
    const next = highlight.includes(club) ? highlight.filter(c => c !== club) : [...highlight, club].slice(0, 4)
    setEditorial(update, { highlight: next })
  }
  const ann = league.leadAnnotations
  const setAnn = (next: typeof ann) => setLeague(update, { leadAnnotations: next })
  return (
    <>
      <div data-field="highlight">
        <div className={LABEL}>Clubs in colour on the race <span className="text-neutral-600">· champion plus up to three</span></div>
        {!clubs.length && <p className="text-xs text-neutral-500">The table loads with the league’s matches.</p>}
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {clubs.map((c, i) => (
            <button key={c} type="button" onClick={() => toggle(c)}
              className={`rounded-full border px-2 py-0.5 text-xs ${highlight.includes(c) ? 'border-white bg-white text-neutral-950' : 'border-white/10 text-neutral-500 hover:text-neutral-300'}`}>
              {i + 1} {c}
            </button>
          ))}
        </div>
      </div>
      <div data-field="leadAnnotations" className="space-y-2">
        <div className={LABEL}>Lead strip annotations <span className="text-neutral-600">· up to two, dated</span></div>
        {ann.map((a, i) => (
          <div key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] gap-2">
            <input type="date" className={`${INPUT} py-1 text-xs`} value={a.date} aria-label="Date" onChange={ev => setAnn(ann.map((x, j) => j === i ? { ...x, date: ev.target.value } : x))} />
            <input className={`${INPUT} py-1 text-xs`} maxLength={120} value={a.text} placeholder="e.g. the last change at the top" onChange={ev => setAnn(ann.map((x, j) => j === i ? { ...x, text: ev.target.value } : x))} />
            <button type="button" className={ICON_BUTTON} onClick={() => setAnn(ann.filter((_, j) => j !== i))}><Trash size={14} /></button>
          </div>
        ))}
        {ann.length < 2 && <button type="button" className={BUTTON} onClick={() => setAnn([...ann, { date: '', text: '' }])}><Plus size={14} /> Annotation</button>}
      </div>
      <Field id="halfwayNote" label="Halfway note" hint={`${wordCount(league.halfwayNote)} words`}>
        <textarea id="f-halfwayNote" rows={2} maxLength={200} className={`${INPUT} resize-y text-xs`} value={league.halfwayNote} placeholder="At the halfway marker on the race" onChange={ev => setLeague(update, { halfwayNote: ev.target.value })} />
      </Field>
    </>
  )
}

function PlayersTab({ row, update }: TabProps) {
  const league = row.league
  if (!league) return null
  const set = (next: typeof league.awards) => setLeague(update, { awards: next })
  return (
    <>
      <p className="text-xs text-neutral-500">Awards the players module shows (team of the year, players of the month, top scorers), each with the source it comes from.</p>
      {league.awards.map((a, i) => (
        <div key={i} data-field={`award-${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <input className={`${INPUT} py-1 text-xs`} maxLength={60} value={a.name} placeholder="Award · winner" onChange={ev => set(league.awards.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))} />
          <input className={`${INPUT} py-1 text-xs ${a.name.trim() && !/^https?:\/\//.test(a.sourceUrl) ? 'border-amber-400/50' : ''}`} maxLength={500} value={a.sourceUrl} placeholder="https://…" onChange={ev => set(league.awards.map((x, j) => j === i ? { ...x, sourceUrl: ev.target.value } : x))} />
          <button type="button" className={ICON_BUTTON} onClick={() => set(league.awards.filter((_, j) => j !== i))}><Trash size={14} /></button>
        </div>
      ))}
      {league.awards.length < 12 && <button type="button" className={BUTTON} onClick={() => set([...league.awards, { name: '', sourceUrl: '' }])}><Plus size={14} /> Award</button>}
    </>
  )
}

// ---------------------------------------------------------------------------

function FieldBracketTab({ row, update, data, spread }: TabProps) {
  const teams = useMemo(() => [...new Set(data.rows.filter(m => /^(r16|qf|sf|final)/i.test(m.s ?? '') || /^group/i.test(m.s ?? '')).flatMap(m => [m.h, m.a]))].sort(), [data.rows])
  const comp = row.competition
  if (!comp) return null
  const final = data.rows.filter(m => /^final$/i.test(m.s ?? '')).pop()
  const finalists = final ? [final.h, final.a] : []
  const highlight = row.editorial.highlight.length ? row.editorial.highlight : finalists
  const pinned = comp.pinned.length ? comp.pinned : finalists
  const chips = (value: string[], max: number, onChange: (v: string[]) => void) => (
    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
      {teams.map(t => (
        <button key={t} type="button" onClick={() => onChange(value.includes(t) ? value.filter(x => x !== t) : [...value, t].slice(0, max))}
          className={`rounded-full border px-2 py-0.5 text-xs ${value.includes(t) ? 'border-white bg-white text-neutral-950' : 'border-white/10 text-neutral-500 hover:text-neutral-300'}`}>{t}</button>
      ))}
    </div>
  )
  return (
    <>
      <div data-field="highlight">
        <div className={LABEL}>Highlighted on the bracket <span className="text-neutral-600">· finalists by default, up to 4</span></div>
        {!teams.length && <p className="text-xs text-neutral-500">The bracket’s clubs load with the {spread.subjectId} matches.</p>}
        {chips(highlight, 4, v => setEditorial(update, { highlight: v }))}
      </div>
      <div data-field="pinned">
        <div className={LABEL}>Pinned on the map <span className="text-neutral-600">· at their home cities</span></div>
        {chips(pinned, 4, v => setCompetition(update, { pinned: v }))}
      </div>
      <Field id="mapGrouping" label="Map grouping" hint="country for Europe, division for a domestic cup">
        <select id="f-mapGrouping" className={`${SELECT} w-full`} value={comp.mapGrouping} onChange={ev => setCompetition(update, { mapGrouping: ev.target.value as 'country' | 'division' })}>
          <option value="country">By country (choropleth of Europe)</option>
          <option value="division">By division (giant-killers)</option>
        </select>
      </Field>
    </>
  )
}

function OdditiesTab({ row, update, data, seasonStart, spread }: TabProps) {
  const comp = row.competition
  const candidates = useMemo(() => data.competition && data.rows.length ? findBeats(seasonStart, data.competition, data.rows, false) : [], [data, seasonStart])
  if (!comp) return null
  const set = (next: typeof comp.oddities) => setCompetition(update, { oddities: next })
  return (
    <>
      <p className="text-xs text-neutral-500">Six one-line oddities, each tied to the stat that proves it. Candidates come from the {spread.subjectId} results; the pack adds more.</p>
      {comp.oddities.map((o, i) => (
        <div key={i} data-field={`oddity-${i}`} className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] gap-2">
          <input className={`${INPUT} py-1 text-xs`} maxLength={120} value={o.text} placeholder="One line" onChange={ev => set(comp.oddities.map((x, j) => j === i ? { ...x, text: ev.target.value } : x))} />
          <input className={`${INPUT} py-1 text-xs ${o.text.trim() && !o.source.trim() ? 'border-amber-400/50' : ''}`} maxLength={120} value={o.source} placeholder="The stat that proves it" onChange={ev => set(comp.oddities.map((x, j) => j === i ? { ...x, source: ev.target.value } : x))} />
          <button type="button" className={ICON_BUTTON} onClick={() => set(comp.oddities.filter((_, j) => j !== i))}><Trash size={14} /></button>
        </div>
      ))}
      {comp.oddities.length < 6 && <button type="button" className={BUTTON} onClick={() => set([...comp.oddities, { text: '', source: '' }])}><Plus size={14} /> Oddity</button>}
      {candidates.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto border-t border-white/10 pt-3 pr-1">
          {candidates.map(c => (
            <li key={c.key} className="flex items-start gap-2 rounded-md border border-white/10 bg-neutral-950/60 p-2 text-xs">
              <span className="min-w-0 flex-1 text-neutral-200">{c.text}</span>
              <button type="button" className={`${BUTTON} shrink-0 py-0.5 text-[11px]`} disabled={comp.oddities.length >= 6}
                onClick={() => set([...comp.oddities, { text: c.text.slice(0, 120), source: c.evidence.slice(0, 120) }])}><Plus size={11} /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function ModulesTab({ row, update, spread }: TabProps) {
  const modules = SPREAD_MODULES[spread.kind]
  const setModule = (id: string, patch: Partial<BookSpread['modules'][string]>) => update(r => ({
    ...r, modules: { ...r.modules, [id]: { ...(r.modules[id] ?? { enabled: true, variant: null, nudge: null }), ...patch } },
  }))
  const reset = (id: string) => update(r => { const m = { ...r.modules }; delete m[id]; return { ...r, modules: m } })
  return (
    <>
      <p className="text-xs text-neutral-500">The {row.templateVersion} template’s modules, page by page. Enable, pick a variant and nudge (± pt) each one; reset returns it to the template. Nudges apply after reflow and are re-checked.</p>
      {[1, 2].map(page => (
        <div key={page} className="space-y-2">
          <div className={LABEL}>Page {page}</div>
          {modules.filter(m => m.page === page).map(m => {
            const s = row.modules[m.id]
            const enabled = s?.enabled ?? true
            const changed = !!s
            return (
              <div key={m.id} data-field={m.id} className={`rounded-md border p-2 ${enabled ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`f-${m.id}`} checked={enabled} onChange={ev => setModule(m.id, { enabled: ev.target.checked })} className="accent-white" />
                  <label htmlFor={`f-${m.id}`} className="text-sm text-neutral-100">{m.label}</label>
                  {m.optional && <span className="rounded bg-white/10 px-1 text-[10px] uppercase tracking-wider text-neutral-400">optional</span>}
                  <span className="ml-auto text-[11px] text-neutral-500">{m.data}</span>
                  {changed && <button type="button" className={ICON_BUTTON} title="Reset to the template" onClick={() => reset(m.id)}><ArrowCounterClockwise size={13} /></button>}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-neutral-500">{m.rules}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {m.variants && (
                    <select className={`${SELECT} py-0.5 text-xs`} value={s?.variant ?? m.variants[0]} aria-label="Variant" onChange={ev => setModule(m.id, { variant: ev.target.value })}>
                      {m.variants.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                  <label className="flex items-center gap-1 text-neutral-500">dx <input type="number" className={`${INPUT} w-16 py-0.5 text-xs`} value={s?.nudge?.dx ?? 0} onChange={ev => setModule(m.id, { nudge: { dx: Number(ev.target.value) || 0, dy: s?.nudge?.dy ?? 0 } })} /></label>
                  <label className="flex items-center gap-1 text-neutral-500">dy <input type="number" className={`${INPUT} w-16 py-0.5 text-xs`} value={s?.nudge?.dy ?? 0} onChange={ev => setModule(m.id, { nudge: { dx: s?.nudge?.dx ?? 0, dy: Number(ev.target.value) || 0 } })} /></label>
                  <input className={`${INPUT} min-w-[8rem] flex-1 py-0.5 text-xs`} maxLength={300} value={row.editorial.notes[m.id] ?? ''} placeholder="Note on this module"
                    onChange={ev => setEditorial(update, { notes: { ...row.editorial.notes, [m.id]: ev.target.value } })} />
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------

function ColourMarksTab({ row, update, spread, data }: TabProps) {
  const palette = spreadPalette(row)
  const overrides = row.palette ?? {}
  const setRole = (role: PaletteRole, value: string | null) => update(r => {
    const next = { ...(r.palette ?? {}) }
    if (value) next[role] = value
    else delete next[role]
    return { ...r, palette: Object.keys(next).length ? next : null }
  })
  const readouts: [string, number, number][] = [
    ['Text on page 1', contrastRatio(palette.text, palette.page1Ground), 7],
    ['Text on page 2', contrastRatio(palette.text, palette.page2Ground), 7],
    ['Highlight on page 1', contrastRatio(palette.highlight, palette.page1Ground), 3],
  ]
  const marks = useMemo(() => {
    const own = { label: spread.subjectId, kind: spread.kind === 'team' ? 'club token' : spread.kind === 'league' ? 'league flag tile' : 'competition tile' }
    const others = spread.kind === 'team'
      ? [...new Set(data.strip.map(g => g.opponent))].sort().map(label => ({ label, kind: 'opponent token' }))
      : spread.kind === 'league' ? data.table.map(r => ({ label: r.team, kind: 'club token' }))
        : [...new Set(data.rows.flatMap(m => [m.h, m.a]))].sort().map(label => ({ label, kind: 'club token' }))
    return [own, ...others]
  }, [spread, data])
  return (
    <>
      <p className="text-xs text-neutral-500">
        The palette derives from {spread.kind === 'team' ? 'the kit colours' : spread.kind === 'league' ? 'the league’s flag tile, with the champion’s palette for its line' : 'the competition mark'} once the marks data lands; the stand-in below colours the render until then.
        Override a role only where the derivation goes wrong.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {PALETTE_ROLES.map(role => (
          <div key={role} data-field={role}>
            <div className="h-10 rounded-md border border-white/10" style={{ background: palette[role] }} />
            <div className="mt-1 flex items-center gap-1">
              <input type="color" aria-label={PALETTE_ROLE_LABELS[role]} value={palette[role]} onChange={ev => setRole(role, ev.target.value.toUpperCase())} className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">{PALETTE_ROLE_LABELS[role]}</span>
              {overrides[role] && <button type="button" className={ICON_BUTTON} title="Back to the derived colour" onClick={() => setRole(role, null)}><ArrowCounterClockwise size={12} /></button>}
            </div>
            <div className="font-mono text-[10px] text-neutral-500">{palette[role]}{overrides[role] ? ' · override' : ''}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1 text-xs">
        {readouts.map(([label, ratio, min]) => (
          <div key={label} className="flex justify-between"><span className="text-neutral-400">{label}</span><span className={`tabular-nums ${ratio >= min ? 'text-emerald-400' : 'text-red-300'}`}>{ratio.toFixed(1)}:1 · needs {min}:1</span></div>
        ))}
      </div>
      <div>
        <div className={LABEL}>Marks on this spread <span className="text-neutral-600">· {marks.length}</span></div>
        <p className="mb-2 text-[11px] text-neutral-500">Each needs a verified <code>admin_club_marks</code> row for the season (crest family, kit pattern, colours, 3-letter code); none exist yet, so every token renders as a dashed placeholder and fails marks-complete.</p>
        <ul className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
          {marks.map(m => (
            <li key={`${m.kind}:${m.label}`} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[11px] text-neutral-400" title={`${m.kind}: no mark row yet`}>
              <span className="font-mono text-neutral-500">{m.label.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}</span> {m.label}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function ChecksTab({ row, update, spread, seasonStart }: TabProps) {
  const issues = spreadIssues(row, seasonStart)
  const byCheck = new Map<string, SpreadIssue[]>()
  for (const i of issues) byCheck.set(i.check, [...(byCheck.get(i.check) ?? []), i])
  const overrides = new Map(row.checkOverrides.map(o => [o.check, o]))
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const override = (check: string, reason: string) => update(r => ({ ...r, checkOverrides: [...r.checkOverrides.filter(o => o.check !== check), { check, reason, by: '' }] }))
  const clear = (check: string) => update(r => ({ ...r, checkOverrides: r.checkOverrides.filter(o => o.check !== check) }))
  return (
    <>
      <p className="text-xs text-neutral-500">A spread moves to checked only when every blocking check passes or carries an override with a reason; warnings never block. The checks marked “with the builder” run on the render and the pack.</p>
      <ul className="space-y-1.5">
        {checksFor(spread.kind).map(c => {
          const failing = byCheck.get(c.id) ?? []
          const o = overrides.get(c.id)
          const state = !c.local ? 'pending' : failing.length ? (o ? 'overridden' : 'fail') : 'pass'
          return (
            <li key={c.id} data-field={c.id} className={`rounded-md border p-2 text-xs ${state === 'fail' && c.level === 'block' ? 'border-red-400/40' : state === 'fail' ? 'border-amber-400/40' : 'border-white/10'}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${state === 'pass' ? 'bg-emerald-400' : state === 'fail' ? (c.level === 'block' ? 'bg-red-400' : 'bg-amber-400') : state === 'overridden' ? 'bg-violet-400' : 'bg-neutral-700'}`} />
                <span className="font-mono text-neutral-200">{c.id}</span>
                <span className={`rounded px-1 text-[10px] uppercase tracking-wider ${c.level === 'block' ? 'bg-red-400/15 text-red-300' : 'bg-amber-400/15 text-amber-300'}`}>{c.level}</span>
                <span className="ml-auto text-neutral-500">{state === 'pending' ? 'with the builder' : state}</span>
              </div>
              <p className="mt-1 text-neutral-500">{c.rule}</p>
              {failing.map((f, i) => <p key={i} className={`mt-1 ${c.level === 'block' ? 'text-red-300' : 'text-amber-300'}`}>{f.message}</p>)}
              {o && <p className="mt-1 text-violet-300">Overridden: {o.reason}{o.by ? ` (${o.by})` : ''} <button type="button" className="underline" onClick={() => clear(c.id)}>clear</button></p>}
              {state === 'fail' && c.level === 'block' && (
                <div className="mt-2 flex gap-2">
                  <input className={`${INPUT} py-0.5 text-xs`} maxLength={200} placeholder="Override reason" value={reasons[c.id] ?? ''} onChange={ev => setReasons({ ...reasons, [c.id]: ev.target.value })} />
                  <button type="button" className={`${BUTTON} py-0.5 text-xs`} disabled={!reasons[c.id]?.trim()} onClick={() => { override(c.id, reasons[c.id].trim()); setReasons({ ...reasons, [c.id]: '' }) }}>Override</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
