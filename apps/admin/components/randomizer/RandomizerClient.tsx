'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  CheckCircle,
  ClipboardText,
  Copy,
  Crown,
  Fire,
  GraduationCap,
  LockSimple,
  Medal,
  Newspaper,
  LockSimpleOpen,
  Basketball,
  PaperPlaneTilt,
  Shuffle,
  Warning,
  X,
} from '@phosphor-icons/react'
import { suggestedFormatFor, type AuthorableHtmlStoryFormat } from '@vismay/html-stories/formats'
import type { DeskHeatTableRow } from '@vismay/html-stories/randomizerApi'
import { pickRandomStyle, type StoryStyle, type StylePool } from '@vismay/html-stories/styles'
import type { HtmlStoryTone } from '@vismay/html-stories/tone'
import { reelPool } from '@vismay/randomizer/datasets'
import { normalizeLocks } from '@vismay/randomizer/draw'
import { hundredLife, researchFileName, researchStub } from '@vismay/randomizer/stub'
import { FOOTSHORTS, HUNDRED, LANDMARK, OCW, VIZNBA } from '@vismay/randomizer/datasets'
import {
  RANDOMIZER_META,
  RANDOMIZERS,
  RESPIN_REASONS,
  randomizersFor,
  type FootshortsNews,
  type HundredFlag,
  type LandmarkSources,
  type LandmarkWork,
  type OcwFile,
  type ViznbaGameRef,
  type ViznbaNews,
  type RandomizerApp,
  type RandomizerId,
  type ReelDef,
  type RuleKind,
  type SpinRecord,
  type SpinStatus,
} from '@vismay/randomizer/types'
import { FormatPicker } from '@/components/html-stories/FormatPicker'
import { ToneToggle } from '@/components/html-stories/ToneToggle'

const ITEM_H = 80
const SWATCHES = ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'teal'] as const

const STATUS_LABEL: Record<SpinStatus, string> = {
  spun: 'Spun',
  rejected: 'Rejected',
  researching: 'Researching',
  insight_review: 'Insight to review',
  approved: 'Approved',
  published: 'Published',
}

const STATUS_TONE: Record<SpinStatus, string> = {
  spun: 'text-neutral-300 border-white/15',
  rejected: 'text-neutral-500 border-white/10',
  researching: 'text-sky-300 border-sky-400/30',
  insight_review: 'text-amber-300 border-amber-400/40',
  approved: 'text-emerald-300 border-emerald-400/40',
  published: 'text-emerald-200 border-emerald-300/50 bg-emerald-400/10',
}

const RULE_TONE: Record<RuleKind, string> = {
  block: 'text-orange-400 border-orange-400',
  warn: 'text-amber-300 border-amber-300',
  good: 'text-emerald-400 border-emerald-400',
  info: 'text-violet-300 border-violet-300',
}

const BADGE_TONE: Record<string, string> = {
  Verified: 'text-emerald-400 border-emerald-400/60',
  Claimed: 'text-amber-300 border-amber-300/60',
  Symbolic: 'text-violet-300 border-violet-300/60',
  Lost: 'text-neutral-400 border-neutral-500',
}

const btn =
  'text-sm text-neutral-200 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none'

function StatusPill({ status }: { status: SpinStatus }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

/** A spin animation: random values per reel, fixed when Spin is pressed. */
interface SpinAnim {
  id: string
  strips: Record<string, string[]>
}

function Reel({
  def,
  spin,
  locked,
  onToggleLock,
  strip,
  animId,
  index,
}: {
  def: ReelDef
  spin: SpinRecord | null
  locked: boolean
  onToggleLock: (() => void) | null
  strip: string[] | undefined
  animId: string | undefined
  index: number
}) {
  const value = spin?.reels[def.key]
  const stripRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el || !strip?.length) return
    const end = `translateY(-${strip.length * ITEM_H}px)`
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.transform = end
      return
    }
    el.style.transition = 'none'
    el.style.transform = 'translateY(0)'
    void el.offsetHeight
    el.style.transition = `transform ${700 + index * 220}ms cubic-bezier(.15,.75,.25,1)`
    el.style.transform = end
  }, [animId, strip, index])

  const items = [...(strip ?? []), value?.value ?? '·']
  return (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.1em] text-neutral-500 font-mono">{def.label}</span>
        {onToggleLock && (
          <button
            type="button"
            onClick={onToggleLock}
            aria-pressed={locked}
            aria-label={`${locked ? 'Unlock' : 'Lock'} ${def.label}`}
            title={locked ? 'Unlock' : 'Lock: keep this value on the next spin'}
            className={`w-7 h-7 grid place-items-center rounded-md border ${
              locked ? 'text-orange-400 border-orange-400/70 bg-orange-400/10' : 'text-neutral-500 border-transparent hover:text-white hover:border-white/15'
            }`}
          >
            {locked ? <LockSimple size={15} /> : <LockSimpleOpen size={15} />}
          </button>
        )}
      </div>
      <div
        className={`relative overflow-hidden rounded-lg border bg-black/40 ${locked ? 'border-orange-400/70' : 'border-white/10'}`}
        style={{ height: ITEM_H }}
      >
        <div key={animId ?? 'static'} ref={stripRef} className="will-change-transform">
          {items.map((v, i) => (
            <div key={i} className="px-3 flex items-center font-serif text-[17px] leading-tight text-neutral-100" style={{ height: ITEM_H }}>
              <span className="line-clamp-3">{v}</span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/60 to-transparent" />
      </div>
      <div className="min-h-[18px] text-[11.5px] font-mono text-neutral-400 flex flex-wrap items-center gap-1.5">
        {value?.badge && (
          <span className={`text-[10px] uppercase tracking-wider px-1.5 rounded-full border ${BADGE_TONE[value.badge] ?? ''}`}>{value.badge}</span>
        )}
        {value?.sub && <span className="min-w-0 break-words">{value.sub}</span>}
      </div>
    </div>
  )
}

/** The part of the brief the spin wrote, for the preview pane. */
function assignmentOf(brief: string): string {
  const start = brief.indexOf('## Your assignment')
  if (start < 0) return brief.slice(0, 1600)
  const end = brief.indexOf('## Research protocol', start)
  return brief.slice(start, end > start ? end : undefined).trim()
}

function ageLabel(days: number | null): string {
  if (days === null) return 'never'
  if (days === 0) return 'today'
  return `${days}d ago`
}

const perRandomizer = <T,>(value: (r: RandomizerId) => T) =>
  Object.fromEntries(RANDOMIZERS.map((r) => [r, value(r)])) as Record<RandomizerId, T>

/**
 * The values a live reel's spin animation blurs through: the Football Desk's
 * team names from the news snapshot, the OCW Desk's course titles and file
 * titles from the spin's own pool (the page it was drawn from), the Landmark
 * Desk's laureate names and work titles from its pool.
 */
function liveReelValues(tab: RandomizerId, key: string, spin: SpinRecord, news: FootshortsNews | null): string[] | undefined {
  if (tab === 'ocw' && spin.subject.randomizer === 'ocw') {
    if (key === 'course') return spin.subject.pool.courses
    if (key === 'resource') return [spin.subject.file, ...spin.subject.siblings].map((f) => f.title)
    return undefined
  }
  if (tab === 'landmark' && spin.subject.randomizer === 'landmark') {
    if (key === 'laureate') return spin.subject.pool.laureates
    if (key === 'work') return [spin.subject.work, ...spin.subject.related].flatMap((w) => (w ? [w.title] : []))
    return undefined
  }
  return news?.teams.map((t) => t.name)
}

/**
 * One slot machine for a site's randomizers: Desk, Atlas, Epics, the OCW
 * Desk, the Landmark Desk and The 100 Desk on vizmaya (with the Desk heat
 * table, the OCW pool panel, the Landmark pool panel and The 100 profile
 * panel), the Football Desk on footshorts
 * (with its live news table), the NBA Desk on viznba (with its news and
 * games).
 */
export function RandomizerClient({
  app = 'vizmaya-fyi',
  initialSpins,
  heat = null,
  news = null,
  nbaNews = null,
  pool,
  loadError,
  siteUrl,
  storiesBasePath = '/vizmaya/html-stories',
}: {
  app?: RandomizerApp
  initialSpins: SpinRecord[]
  heat?: DeskHeatTableRow[] | null
  /** The Football Desk's live news snapshot (footshorts only). */
  news?: FootshortsNews | null
  /** The NBA Desk's live news snapshot (viznba only). */
  nbaNews?: ViznbaNews | null
  pool: StylePool | null
  loadError: string | null
  siteUrl: string
  /** Where this site's HTML stories are managed in admin, for the spin's story link. */
  storiesBasePath?: string
}) {
  const tabs = randomizersFor(app)
  const [tab, setTab] = useState<RandomizerId>(tabs[0]!)
  const [spins, setSpins] = useState<SpinRecord[]>(initialSpins)
  const [selected, setSelected] = useState<Record<RandomizerId, string | null>>(() =>
    perRandomizer((r) => initialSpins.find((s) => s.randomizer === r && s.status !== 'rejected')?.id ?? null),
  )
  const [locks, setLocks] = useState<Record<RandomizerId, string[]>>(() => perRandomizer(() => []))
  const [opts, setOpts] = useState({ pair: false, sequence: false })
  const [anim, setAnim] = useState<SpinAnim | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [respinOpen, setRespinOpen] = useState(false)
  const [otherReason, setOtherReason] = useState('')
  const [style, setStyle] = useState<StoryStyle | null>(null)
  const [format, setFormat] = useState<AuthorableHtmlStoryFormat>('scroll')
  const [tone, setTone] = useState<HtmlStoryTone>('straight')
  const [built, setBuilt] = useState<{ request: string; brief: string | null; error: string | null } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  const meta = RANDOMIZER_META[tab]
  const current = spins.find((s) => s.id === selected[tab]) ?? null
  const log = spins.filter((s) => s.randomizer === tab).slice(0, 12)
  const reels = meta.reels.filter((r) => !r.option || (r.option === 'pair' && !!current?.reels.pair))
  const canShuffle = !!pool?.palettes.length && !!pool.fonts.length
  const canRespin = !!current && current.status !== 'rejected' && current.status !== 'published'

  // The composed brief for the spin on screen, built server-side (it reads the spin).
  const request = useMemo(
    () => (current ? JSON.stringify({ app, format, tone, style, spinId: current.id, v: current.updatedAt }) : null),
    [app, current, format, tone, style],
  )
  const building = !!request && built?.request !== request
  const brief = request && !building ? built?.brief ?? null : null
  const briefError = request && !building ? built?.error ?? null : null

  useEffect(() => {
    if (!request) return
    let cancelled = false
    fetch('/api/html-stories/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: request })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setBuilt({ request, brief: text, error: null })
      })
      .catch((e) => {
        if (!cancelled) setBuilt({ request, brief: null, error: e instanceof Error ? e.message : 'brief failed' })
      })
    return () => {
      cancelled = true
    }
  }, [request])

  function replace(spin: SpinRecord) {
    setSpins((prev) => prev.map((s) => (s.id === spin.id ? spin : s)))
  }

  async function doSpin(respin: boolean, reason?: string) {
    setBusy(true)
    setError(null)
    setRespinOpen(false)
    try {
      const res = await fetch('/api/randomizer/spins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          randomizer: tab,
          from: current?.id ?? null,
          locks: current ? locks[tab] : [],
          respin,
          reason,
          pair: meta.option?.key === 'pair' && opts.pair,
          sequence: meta.option?.key === 'sequence' && opts.sequence,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { spin?: SpinRecord; error?: string }
      if (!res.ok || !body.spin) throw new Error(body.error ?? `HTTP ${res.status}`)
      const spin = body.spin
      const lockedNow = new Set(current ? locks[tab] : [])
      const strips: Record<string, string[]> = {}
      RANDOMIZER_META[tab].reels.forEach((r, i) => {
        if (lockedNow.has(r.key)) return
        const values = reelPool(tab, r.key, liveReelValues(tab, r.key, spin, news))
        if (values.length) strips[r.key] = Array.from({ length: 10 + i * 3 }, () => values[Math.floor(Math.random() * values.length)]!)
      })
      setSpins((prev) => [
        spin,
        ...prev.map((s) => (respin && s.id === current?.id ? { ...s, status: 'rejected' as const, rejectedReason: reason ?? null } : s)),
      ])
      setSelected((prev) => ({ ...prev, [tab]: spin.id }))
      setAnim({ id: spin.id, strips })
      if (canShuffle && pool) setStyle((prev) => pickRandomStyle(pool, { previous: prev }))
      setOtherReason('')
      setReviewNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'spin failed')
    } finally {
      setBusy(false)
    }
  }

  async function patchSpin(body: Record<string, unknown>) {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/randomizer/spins/${current.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const out = (await res.json().catch(() => ({}))) as { spin?: SpinRecord; error?: string }
      if (!res.ok || !out.spin) throw new Error(out.error ?? `HTTP ${res.status}`)
      replace(out.spin)
      setReviewNote('')
      setPasting(false)
      setPasted('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed')
    } finally {
      setBusy(false)
    }
  }

  function toggleLock(key: string) {
    setLocks((prev) => {
      const now = new Set(prev[tab])
      if (now.has(key)) {
        now.delete(key)
        // Unlocking a parent unlocks the reels that depend on it.
        for (const r of RANDOMIZER_META[tab].reels) if (r.parents?.includes(key)) now.delete(r.key)
        return { ...prev, [tab]: [...now] }
      }
      return { ...prev, [tab]: normalizeLocks(tab, [...now, key]) }
    })
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const failedHeat = heat?.filter((h) => h.refreshStatus === 'failed') ?? []
  const staleHeat = heat?.filter((h) => h.stale) ?? []

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Randomizer</h1>
            <p className="text-sm text-neutral-400 mt-0.5 max-w-2xl">
              {app === 'viznba' ? (
                <>
                  The NBA Desk draws a conference, a franchise in it, an angle and a freshness, weighted by how much VizNBA news each has
                  in the last {nbaNews?.windowDays ?? 14} days (a story about a player or coach counts for his team), under the
                  playbook&rsquo;s rules (30 and 90 day repeat blocks, no conference twice in a row) and logs it. The agent brief then
                  carries the spin and the box scores of its games.
                </>
              ) : app === 'footshorts' ? (
                <>
                  The Football Desk draws a tournament, a team in it, an angle and a freshness, weighted by how much footshorts news each
                  has in the last {news?.windowDays ?? 14} days, under the playbook&rsquo;s rules (30 and 90 day repeat blocks, no
                  tournament twice in a row) and logs it. The agent brief then carries the spin and the match context of its fixtures.
                </>
              ) : (
                <>
                  One slot machine, six reel sets. Spin draws a topic under the playbook&rsquo;s rules (heat weighting, region and
                  tradition balancing, the philosophical quota, 30 and 90 day repeat blocks) and logs it. The OCW Desk reads a page of
                  MIT OpenCourseWare live for its course and resource reels; the Landmark Desk reads the prize lists (the Nobel Prize
                  API, Wikidata) and the scholarly record (OpenAlex, Open Library, Unpaywall) live for its laureate and work reels; The
                  100 Desk draws a person from Michael Hart&rsquo;s ranking of the most influential persons in history and reads their
                  profile (Wikidata, Wikipedia, pageviews) live; a cron spins each once a morning. The agent brief then carries the spin.
                </>
              )}
            </p>
          </div>
        </header>

        {loadError && (
          <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/5 rounded-lg px-3 py-2">
            {loadError}. Has migration 088_randomizer.sql
            {app === 'footshorts' ? ' (and 090_randomizer_footshorts.sql)' : app === 'viznba' ? ' (and 092_viznba.sql)' : ' (and 093_randomizer_ocw.sql for the OCW Desk, 094_randomizer_landmark.sql for the Landmark Desk, 096_randomizer_hundred.sql for The 100 Desk)'} been applied?
          </div>
        )}

        <section className="rounded-xl border border-white/10 bg-neutral-900/60 overflow-hidden">
          <div role="tablist" className="flex overflow-x-auto border-b border-white/10">
            {tabs.map((r) => (
              <button
                key={r}
                role="tab"
                type="button"
                aria-selected={tab === r}
                onClick={() => {
                  setTab(r)
                  setAnim(null)
                  setRespinOpen(false)
                }}
                className={`flex-1 min-w-[150px] text-left px-4 py-3 border-r border-white/5 last:border-r-0 ${
                  tab === r ? 'bg-white/[0.04] shadow-[inset_0_-2px_0] shadow-orange-500' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="font-serif text-lg text-neutral-100">{RANDOMIZER_META[r].name}</div>
                <div className={`text-[11px] font-mono ${tab === r ? 'text-orange-400' : 'text-neutral-500'}`}>{RANDOMIZER_META[r].hint}</div>
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
              {reels.map((def, i) => (
                <Reel
                  key={def.key}
                  def={def}
                  spin={current}
                  index={i}
                  locked={locks[tab].includes(def.key)}
                  onToggleLock={def.option || !current ? null : () => toggleLock(def.key)}
                  strip={anim && anim.id === current?.id ? anim.strips[def.key] : undefined}
                  animId={anim && anim.id === current?.id ? anim.id : undefined}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => doSpin(false)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Shuffle size={16} />
                {busy ? 'Spinning…' : 'Spin'}
              </button>
              <div className="relative">
                <button type="button" onClick={() => setRespinOpen((o) => !o)} disabled={busy || !canRespin} className={btn}>
                  <ArrowCounterClockwise size={14} />
                  Re-spin
                </button>
                {respinOpen && (
                  <div className="absolute z-20 mt-2 left-0 w-72 rounded-lg border border-white/10 bg-neutral-900 p-3 shadow-xl flex flex-col gap-2">
                    <p className="text-xs text-neutral-400">Why is this one rejected? It goes in the log, to tune the weights later.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {RESPIN_REASONS.filter((r) => r !== 'other').map((r) => (
                        <button key={r} type="button" onClick={() => doSpin(true, r)} className="text-xs px-2 py-1 rounded-full border border-white/15 hover:bg-white/5">
                          {r}
                        </button>
                      ))}
                    </div>
                    <form
                      className="flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault()
                        doSpin(true, otherReason.trim() ? `other: ${otherReason.trim()}` : 'other')
                      }}
                    >
                      <input
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                        placeholder="Other reason"
                        className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs"
                      />
                      <button type="submit" className="text-xs px-2 py-1 rounded-md border border-white/15 hover:bg-white/5">
                        Re-spin
                      </button>
                    </form>
                  </div>
                )}
              </div>
              {meta.option && (
                <label className="inline-flex items-center gap-2 text-sm text-neutral-400 px-2.5 py-1.5 rounded-lg border border-dashed border-white/15 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-orange-500"
                    checked={opts[meta.option.key]}
                    onChange={(e) => setOpts((o) => ({ ...o, [meta.option!.key]: e.target.checked }))}
                  />
                  {meta.option.label}
                </label>
              )}
              {current && (
                <span className="sm:ml-auto text-xs font-mono text-neutral-500 flex items-center gap-2">
                  {new Date(current.createdAt).toLocaleString()} · seed {current.seed}
                  <StatusPill status={current.status} />
                </span>
              )}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {!current && !loadError && <p className="text-sm text-neutral-500">No {meta.name} spins yet. Press Spin.</p>}

            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="text-[11px] uppercase tracking-[0.1em] text-neutral-500 font-mono">Style die</span>
              {style ? (
                <>
                  <span className="flex">
                    {SWATCHES.map((k) => (
                      <span key={k} className="w-4 h-4 rounded-full border border-white/20 -ml-1 first:ml-0" style={{ background: style.palette[k] }} />
                    ))}
                  </span>
                  <span className="text-sm text-neutral-300 min-w-0">
                    Colours from &ldquo;{style.paletteFrom.title}&rdquo;
                    <span className="block text-[11px] font-mono text-neutral-500">
                      {style.fonts.serif} · {style.fonts.sans} · {style.fonts.mono} (from &ldquo;{style.fontsFrom.title}&rdquo;)
                    </span>
                  </span>
                  <button type="button" onClick={() => setStyle(null)} className="p-1 text-neutral-500 hover:text-white" aria-label="Back to house style" title="Back to house style">
                    <X size={12} />
                  </button>
                </>
              ) : (
                <span className="text-sm text-neutral-400">House style</span>
              )}
              <button
                type="button"
                onClick={() => pool && setStyle((prev) => pickRandomStyle(pool, { previous: prev }))}
                disabled={!canShuffle}
                className={`${btn} ml-auto`}
                title={canShuffle ? 'Pick a palette and fonts from an existing story' : 'No story themes to draw from'}
              >
                <Shuffle size={14} />
                Shuffle style
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-[1.25fr_1fr] border-t border-white/10">
            <div className="p-4 sm:p-5 flex flex-col gap-3 min-w-0">
              <h2 className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 font-mono">Rules that fired on this spin</h2>
              <ul className="flex flex-col gap-2.5">
                {(current?.rules ?? []).map((r, i) => (
                  <li key={i} className="grid grid-cols-[84px_1fr] gap-3 text-sm items-baseline">
                    <span className={`text-[10.5px] uppercase tracking-wider font-mono border-t-2 pt-0.5 ${RULE_TONE[r.kind]}`}>{r.tag}</span>
                    <span className="text-neutral-300">{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 sm:p-5 flex flex-col gap-3 min-w-0 border-t md:border-t-0 md:border-l border-white/10">
              <h2 className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 font-mono">Spin log</h2>
              <ol className="flex flex-col">
                {log.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected((prev) => ({ ...prev, [tab]: s.id }))
                        setAnim(null)
                      }}
                      className={`w-full grid grid-cols-[52px_1fr_auto] gap-2.5 items-baseline text-left py-1.5 border-b border-white/5 text-[13.5px] ${
                        s.id === current?.id ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-neutral-500 tabular-nums">
                        {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className={`min-w-0 break-words ${s.status === 'rejected' ? 'line-through decoration-neutral-600' : ''}`}>
                        {s.summary}
                        {s.status === 'rejected' && s.rejectedReason && <span className="ml-1.5 text-[11px] text-neutral-500 no-underline">({s.rejectedReason})</span>}
                      </span>
                      <StatusPill status={s.status} />
                    </button>
                  </li>
                ))}
                {!log.length && <li className="text-sm text-neutral-500">Nothing logged yet.</li>}
              </ol>
            </div>
          </div>
        </section>

        {current && (
          <section className="grid lg:grid-cols-[1fr_1.1fr] gap-4 items-start">
            <SpinPanel
              spin={current}
              siteUrl={siteUrl}
              storiesBasePath={storiesBasePath}
              busy={busy}
              reviewNote={reviewNote}
              setReviewNote={setReviewNote}
              onReview={(action) => patchSpin({ action, note: reviewNote })}
              pasting={pasting}
              setPasting={setPasting}
              pasted={pasted}
              setPasted={setPasted}
              onSaveResearch={() => patchSpin({ research: pasted })}
            />

            <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden lg:sticky lg:top-4">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/10 bg-neutral-900/60">
                <span className="text-xs font-mono text-neutral-400 min-w-0 break-all">assignment · {researchFileName(current).replace('.md', '')}</span>
                <div className="flex flex-wrap gap-2">
                  <FormatPicker value={format} onChange={setFormat} suggested={suggestedFormatFor(current.randomizer)} />
                  <ToneToggle value={tone} onChange={setTone} className={btn} />
                  <button
                    type="button"
                    className={btn}
                    onClick={() => copy('stub', current.researchMd ?? researchStub(current))}
                    title={current.researchMd ? 'Copy the saved research file' : 'Copy the research stub: reels pre-filled, empty claims log'}
                  >
                    {copied === 'stub' ? <Check size={14} /> : <ClipboardText size={14} />}
                    {current.researchMd ? 'Copy research' : 'Copy research stub'}
                  </button>
                  <button type="button" className={btn} disabled={!brief} onClick={() => brief && copy('brief', brief)} title={briefError ?? undefined}>
                    {copied === 'brief' ? <Check size={14} /> : <Copy size={14} />}
                    {copied === 'brief' ? 'Copied' : building ? 'Building brief…' : 'Copy agent brief'}
                  </button>
                </div>
              </div>
              {briefError && <p className="px-3 pt-2 text-xs text-red-400">{briefError}</p>}
              <pre className="m-0 p-4 text-[12.5px] leading-relaxed font-mono whitespace-pre-wrap break-words text-neutral-200 max-h-[640px] overflow-auto">
                {brief ? assignmentOf(brief) : building ? 'Building the brief…' : ''}
              </pre>
              <p className="px-4 pb-3 text-xs text-neutral-500">
                Agents with web access can read it at{' '}
                <code className="text-neutral-400 break-all">
                  {siteUrl}/api/html-stories/brief?spin={current.id}
                  {format !== 'scroll' ? `&format=${format}` : ''}
                  {tone !== 'straight' ? `&tone=${tone}` : ''}
                </code>
                , or call <code className="text-neutral-400">get_html_story_brief</code> with this <code>spinId</code>
                {format !== 'scroll' ? (
                  <>
                    {' '}
                    and <code>format: &quot;{format}&quot;</code>
                  </>
                ) : null}
                {tone !== 'straight' ? (
                  <>
                    {' '}
                    and <code>tone: &quot;{tone}&quot;</code>
                  </>
                ) : null}
                .
              </p>
            </div>
          </section>
        )}

        {tab === 'footshorts' && <FootballNews news={news} />}
        {tab === 'viznba' && <NbaNews news={nbaNews} />}
        {tab === 'ocw' && <OcwPool spin={current} />}
        {tab === 'landmark' && <LandmarkPool spin={current} />}
        {tab === 'hundred' && <HundredProfilePanel spin={current} />}

        {tab === 'desk' && (
          <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium flex items-center gap-1.5">
                <Fire size={15} className="text-orange-400" />
                Desk heat
              </h2>
              <span className="text-xs text-neutral-500">
                60% of Desk spins are weighted by heat. Scores older than 7 days need a refresh: run the weekly{' '}
                <code>refresh_desk_heat</code> MCP job.
              </span>
              {failedHeat.length > 0 && (
                <span className="text-xs text-red-300 border border-red-400/40 bg-red-500/10 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                  <Warning size={12} /> {failedHeat.length} refresh {failedHeat.length === 1 ? 'failure' : 'failures'}
                </span>
              )}
              {staleHeat.length > 0 && <span className="text-xs text-amber-300">{staleHeat.length} stale</span>}
            </div>
            {heat ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">
                    <tr className="border-b border-white/5">
                      <th className="text-left font-medium px-4 py-2">Segment</th>
                      <th className="text-left font-medium px-4 py-2 w-48">Heat</th>
                      <th className="text-left font-medium px-4 py-2">Updated</th>
                      <th className="text-left font-medium px-4 py-2">Refresh</th>
                      <th className="text-left font-medium px-4 py-2">Newest headline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...heat].sort((a, b) => b.heat - a.heat).map((h) => (
                      <tr key={h.subId} className="border-b border-white/5 last:border-0 align-top">
                        <td className="px-4 py-2">
                          <div className="text-neutral-200">{h.name}</div>
                          <div className="text-xs text-neutral-500">{h.industry}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full bg-orange-500/80" style={{ width: `${h.heat}%` }} />
                            </div>
                            <span className="font-mono text-xs tabular-nums text-neutral-300 w-7 text-right">{h.heat}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-2 font-mono text-xs ${h.stale ? 'text-amber-300' : 'text-neutral-400'}`}>
                          {ageLabel(h.ageDays)}
                          {h.stale && ' · stale'}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {h.refreshStatus === 'failed' ? (
                            <span className="text-red-300" title={h.refreshError ?? undefined}>
                              Failed{h.refreshError ? `: ${h.refreshError}` : ''}
                            </span>
                          ) : h.refreshStatus === 'ok' ? (
                            <span className="text-emerald-400">OK</span>
                          ) : (
                            <span className="text-neutral-500">Seed only</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-neutral-400 max-w-[22rem]">
                          {h.topHeadlines[0] ? (
                            <a href={h.topHeadlines[0].url} target="_blank" rel="noreferrer" className="hover:text-white">
                              {h.topHeadlines[0].date}: {h.topHeadlines[0].title}
                            </a>
                          ) : (
                            <span className="text-neutral-600">none on file</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-3 text-sm text-neutral-500">Heat could not be read. Has migration 088_randomizer.sql been applied?</p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

const STEPS: SpinStatus[] = ['spun', 'researching', 'insight_review', 'approved', 'published']

function SpinPanel({
  spin,
  siteUrl,
  storiesBasePath,
  busy,
  reviewNote,
  setReviewNote,
  onReview,
  pasting,
  setPasting,
  pasted,
  setPasted,
  onSaveResearch,
}: {
  spin: SpinRecord
  siteUrl: string
  storiesBasePath: string
  busy: boolean
  reviewNote: string
  setReviewNote: (v: string) => void
  onReview: (action: 'approve' | 'send_back') => void
  pasting: boolean
  setPasting: (v: boolean) => void
  pasted: string
  setPasted: (v: string) => void
  onSaveResearch: () => void
}) {
  const gated = RANDOMIZER_META[spin.randomizer].gated
  const steps = gated ? STEPS : STEPS.filter((s) => s !== 'insight_review')
  const at = steps.indexOf(spin.status)
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/40 p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">This spin</h2>
        <span className="text-xs text-neutral-500">{gated ? 'Hero insight is gated' : `No approval gate (${RANDOMIZER_META[spin.randomizer].name})`}</span>
      </div>

      {spin.status === 'rejected' ? (
        <p className="text-sm text-neutral-400">Rejected at re-spin{spin.rejectedReason ? `: ${spin.rejectedReason}` : ''}.</p>
      ) : (
        <ol className="flex flex-wrap gap-x-1 gap-y-2 text-[11px] font-mono uppercase tracking-wider">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-1 ${i <= at ? 'text-neutral-200' : 'text-neutral-600'}`}>
              {i <= at ? <CheckCircle size={13} weight={i === at ? 'fill' : 'regular'} className={i === at ? 'text-orange-400' : ''} /> : <span className="w-[13px]" />}
              {STATUS_LABEL[s]}
              {i < steps.length - 1 && <span className="text-neutral-700 px-1">/</span>}
            </li>
          ))}
        </ol>
      )}

      {spin.status === 'spun' && (
        <p className="text-sm text-neutral-400">
          Waiting for research. Give the agent the brief; it saves the research file with <code>save_spin_research</code>, or paste it
          below.
        </p>
      )}
      {spin.reviewNote && spin.status === 'researching' && (
        <p className="text-sm text-amber-200 border border-amber-400/30 bg-amber-400/5 rounded-lg px-3 py-2">Sent back: {spin.reviewNote}</p>
      )}
      {spin.status === 'researching' && !spin.heroInsight && (
        <p className="text-sm text-neutral-400">Research saved. No HERO INSIGHT sentence yet.</p>
      )}

      {spin.heroInsight && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.1em] text-neutral-500 font-mono">Hero insight</span>
          <blockquote className="font-serif text-lg leading-snug text-neutral-100 border-l-2 border-orange-500 pl-3">{spin.heroInsight}</blockquote>
        </div>
      )}

      {spin.status === 'insight_review' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-400">
            Check it is one sentence, traceable to two sources or one primary source, and fair on anything contested. Everything public is
            written from it.
          </p>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Note for the agent (required to send back)"
            rows={2}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => onReview('approve')} className={`${btn} border-emerald-400/40 text-emerald-200`}>
              <Check size={14} />
              Approve insight
            </button>
            <button type="button" disabled={busy || !reviewNote.trim()} onClick={() => onReview('send_back')} className={btn}>
              <PaperPlaneTilt size={14} />
              Send back
            </button>
          </div>
        </div>
      )}

      {spin.status === 'approved' && (
        <p className="text-sm text-emerald-300/90">Approved. The agent builds the page and the reel script from it, then publishes with this spinId.</p>
      )}

      {spin.storySlug && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-neutral-400">Story:</span>
          <a href={`${storiesBasePath}/${spin.storySlug}`} className="text-neutral-200 hover:text-white underline decoration-white/20">
            {spin.storySlug}
          </a>
          {spin.status === 'published' && (
            <a href={`${siteUrl}/s/${spin.storySlug}`} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-white" aria-label="Open live story">
              <ArrowSquareOut size={15} />
            </a>
          )}
        </div>
      )}

      {spin.status !== 'rejected' && (
        <div className="flex flex-col gap-2">
          {spin.researchMd && (
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-300">Research file</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs font-mono text-neutral-300 bg-black/30 border border-white/5 rounded-lg p-3">
                {spin.researchMd}
              </pre>
            </details>
          )}
          {pasting ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste the research MD, with its HERO INSIGHT section"
                rows={8}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <div className="flex gap-2">
                <button type="button" disabled={busy || !pasted.trim()} onClick={onSaveResearch} className={btn}>
                  <Check size={14} />
                  Save research
                </button>
                <button type="button" onClick={() => setPasting(false)} className={btn}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPasted(spin.researchMd ?? '')
                setPasting(true)
              }}
              className={`${btn} self-start`}
            >
              <ClipboardText size={14} />
              {spin.researchMd ? 'Replace research' : 'Paste research'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The Football Desk's live news: what its 60% branch weights by. */
function FootballNews({ news }: { news: FootshortsNews | null }) {
  const [all, setAll] = useState(false)
  if (!news) {
    return (
      <section className="rounded-xl border border-white/10 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-500">
        The footshorts news could not be read, so the Football Desk cannot spin. Check the fixtures and articles tables.
      </section>
    )
  }
  const comps = FOOTSHORTS.competitions
    .map((c) => ({ ...c, ...(news.competitions.find((n) => n.slug === c.slug) ?? { heat: 0, articles: 0, teams: 0, headlines: [] }) }))
    .sort((a, b) => b.heat - a.heat)
  const teams = [...news.teams].sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name))
  const shown = all ? teams : teams.slice(0, 25)
  const compName = (slug: string) => FOOTSHORTS.competitions.find((c) => c.slug === slug)?.name ?? slug
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <Newspaper size={15} className="text-orange-400" />
          Football news heat
        </h2>
        <span className="text-xs text-neutral-500">
          Stories tagged on footshorts in the last {news.windowDays} days, read {new Date(news.asOf).toLocaleString()}. Live from the feed: nothing
          to refresh. Only tournaments with fixtures in the window are in the draw.
        </span>
      </div>
      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-white/5">
        {comps.map((c) => (
          <span
            key={c.slug}
            className={`text-xs rounded-full border px-2.5 py-1 inline-flex items-center gap-1.5 ${
              c.teams ? 'border-white/15 text-neutral-200' : 'border-white/5 text-neutral-600 line-through'
            }`}
            title={c.teams ? `${c.articles} stories · ${c.teams} teams with fixtures` : 'No fixtures in the window: out of the draw'}
          >
            {c.name}
            <span className="font-mono tabular-nums text-orange-300/90">{c.heat}</span>
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">
            <tr className="border-b border-white/5">
              <th className="text-left font-medium px-4 py-2">Team</th>
              <th className="text-left font-medium px-4 py-2 w-48">Heat</th>
              <th className="text-left font-medium px-4 py-2">Stories</th>
              <th className="text-left font-medium px-4 py-2">Next</th>
              <th className="text-left font-medium px-4 py-2">Newest headline</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id} className="border-b border-white/5 last:border-0 align-top">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {t.crestUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- third-party crest CDNs, 20px
                      <img src={t.crestUrl} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <span className="w-5" />
                    )}
                    <span className="text-neutral-200">{t.name}</span>
                  </div>
                  <div className="text-xs text-neutral-500 pl-7">{t.competitions.map(compName).join(' · ')}</div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-orange-500/80" style={{ width: `${t.heat}%` }} />
                    </div>
                    <span className="font-mono text-xs tabular-nums text-neutral-300 w-7 text-right">{t.heat}</span>
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-xs tabular-nums text-neutral-400">{t.articles}</td>
                <td className="px-4 py-2 text-xs text-neutral-400 whitespace-nowrap">
                  {t.upcoming[0] ? (
                    <>
                      {t.upcoming[0].home} v {t.upcoming[0].away}
                      <div className="font-mono text-neutral-500">{t.upcoming[0].kickoff.slice(0, 10)}</div>
                    </>
                  ) : (
                    <span className="text-neutral-600">none on file</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-neutral-400 max-w-[22rem]">
                  {t.headlines[0] ? (
                    <a href={t.headlines[0].url} target="_blank" rel="noreferrer" className="hover:text-white">
                      {t.headlines[0].date}: {t.headlines[0].title}
                    </a>
                  ) : (
                    <span className="text-neutral-600">none in the window</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {teams.length > 25 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full text-xs text-neutral-400 hover:text-white py-2 border-t border-white/5">
          {all ? 'Show the top 25' : `Show all ${teams.length} teams`}
        </button>
      )}
    </section>
  )
}

function gameLine(g: ViznbaGameRef, teamId: string): string {
  const home = g.homeId === teamId
  const opp = home ? g.away : g.home
  const oppShort = VIZNBA.teams.find((t) => t.name === opp)?.abbreviation ?? opp
  return `${home ? 'v' : '@'} ${oppShort}`
}

/** The OCW Desk's pool: the page of OCW files the spin was drawn from, the course and the resource. */
function OcwPool({ spin }: { spin: SpinRecord | null }) {
  const s = spin && spin.subject.randomizer === 'ocw' ? spin.subject : null
  const stocked = OCW.topics.filter((t) => OCW.kinds.some((k) => (t.files[k.name] ?? 0) > 0)).length
  if (!s) {
    return (
      <section className="rounded-xl border border-white/10 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-neutral-300 inline-flex items-center gap-1.5">
          <GraduationCap size={15} className="text-orange-400" />
          OCW pool
        </span>
        <span>
          {OCW.fields.length} fields, {stocked} topics with files, {OCW.kinds.map((k) => k.name.toLowerCase()).join(', ')} only. A spin reads one page of MIT OpenCourseWare
          live (MIT Learn&rsquo;s API) for its course and resource; the page is kept on the spin, so a logged spin replays without the network.
        </span>
      </section>
    )
  }
  const term = [s.course.semester, s.course.year].filter(Boolean).join(' ')
  const files: OcwFile[] = [s.file, ...s.siblings].sort((a, b) => a.key.localeCompare(b.key))
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <GraduationCap size={15} className="text-orange-400" />
          OCW pool
        </h2>
        <span className="text-xs text-neutral-500">
          {s.topic.name} · {s.kind.name}:{' '}
          {s.pool.query.courseId
            ? `${s.pool.count} ${s.kind.name.toLowerCase()} files in the course`
            : `${s.pool.count.toLocaleString('en-US')} files on OCW, this page from ${s.pool.offset.toLocaleString('en-US')} (${s.pool.pageSize} files, ${s.pool.courses.length} ${s.pool.courses.length === 1 ? 'course' : 'courses'})`}
          , read {new Date(s.pool.asOf).toLocaleString()}.
          {s.sequence ? ' Continued from the previous spin.' : ''}
        </span>
      </div>
      <div className="px-4 py-3 border-b border-white/5 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] text-sm">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-center">Course</span>
        <div>
          <a href={s.course.url} target="_blank" rel="noreferrer" className="text-neutral-100 hover:underline inline-flex items-center gap-1">
            {s.course.number} {s.course.title}
            <ArrowSquareOut size={13} className="text-neutral-500" />
          </a>
          <div className="text-xs text-neutral-500">
            {[term, s.course.level.join(' / '), s.course.departments.join(', ')].filter(Boolean).join(' · ')}
            {s.course.instructors.length ? ` · ${s.course.instructors.join(', ')}` : ' · instructors on the course page'}
          </div>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-center">Resource</span>
        <div>
          <a href={s.file.url} target="_blank" rel="noreferrer" className="text-neutral-100 hover:underline inline-flex items-center gap-1">
            {s.file.title}
            <ArrowSquareOut size={13} className="text-neutral-500" />
          </a>
          <div className="text-xs text-neutral-500">
            {s.kind.name} · {s.file.contentType}
            {s.file.youtubeId ? ' · video' : ''}
          </div>
        </div>
      </div>
      {files.length > 1 && (
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono mb-1.5">
            {s.kind.name} in the course the pool saw ({files.length})
          </div>
          <ol className="text-xs text-neutral-400 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f) => (
              <li key={f.id} className={f.id === s.file.id ? 'text-orange-300' : ''}>
                <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {f.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {s.pool.courses.length > 1 && (
        <div className="px-4 pb-3 text-xs text-neutral-500">
          Other courses on the page: {s.pool.courses.filter((c) => c !== `${s.course.number} ${s.course.title}`).join('; ')}.
        </div>
      )}
    </section>
  )
}

const SOURCE_TONE: Record<LandmarkSources['wikidata'], string> = {
  ok: 'text-emerald-300 border-emerald-400/40',
  failed: 'text-red-300 border-red-400/40',
  'no key': 'text-amber-300 border-amber-400/40',
  'no email': 'text-amber-300 border-amber-400/40',
  skipped: 'text-neutral-500 border-white/10',
}

function basisLabel(w: LandmarkWork): string {
  if (w.type === 'subject') return 'named as a subject'
  if (w.basis === 'citation') return 'named by the award'
  if (w.basis === 'notable') return 'notable work'
  if (w.basis === 'book') return 'book, by year'
  return 'top-cited'
}

/** The Landmark Desk's pool: the award the spin drew, the work and how it was tied to the award, the other works, the laureates in the era, and how the sources fared. */
function LandmarkPool({ spin }: { spin: SpinRecord | null }) {
  const s = spin && spin.subject.randomizer === 'landmark' ? spin.subject : null
  const total = LANDMARK.prizes.reduce((n, p) => n + Object.values(p.awards).reduce((a, b) => a + b, 0), 0)
  if (!s) {
    return (
      <section className="rounded-xl border border-white/10 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-neutral-300 inline-flex items-center gap-1.5">
          <Medal size={15} className="text-orange-400" />
          Landmark pool
        </span>
        <span>
          {LANDMARK.fields.length} fields, {LANDMARK.prizes.length} prizes, {total.toLocaleString('en-US')} awards on record across {LANDMARK.eras.length} eras. A spin reads the
          prize&rsquo;s awards live (the Nobel Prize API, Wikidata) and the laureate&rsquo;s works (Wikidata, OpenAlex, Open Library, Unpaywall); what it read is kept on the
          spin, so a logged spin replays without the network.
        </span>
      </section>
    )
  }
  const a = s.award
  const w = s.work
  const sources = (['wikidata', 'openalex', 'openlibrary', 'unpaywall'] as const).map((k) => [k, s.pool.sources[k]] as const)
  const links = [
    ['prize summary', a.links.summary],
    ['scientific background', a.links.background],
    ['lecture', a.links.lecture],
    ['Wikipedia', a.links.wikipedia],
  ].filter((l): l is [string, string] => !!l[1])
  const others = s.pool.laureates.filter((n) => n !== a.name)
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <Medal size={15} className="text-orange-400" />
          Landmark pool
        </h2>
        <span className="text-xs text-neutral-500">
          {s.prize.name} · {s.era.name}: {s.pool.count} {s.pool.count === 1 ? 'award' : 'awards'} read {new Date(s.pool.asOf).toLocaleString()}.
          {s.sequence ? ' Followed back a year from the previous spin.' : ''}
        </span>
        <span className="flex flex-wrap gap-1.5 sm:ml-auto">
          {sources.map(([k, state]) => (
            <span key={k} className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${SOURCE_TONE[state]}`} title={k === 'openalex' && state === 'no key' ? 'Set OPENALEX_API_KEY on vizmaya-fyi for top-cited works' : k === 'unpaywall' && state === 'no email' ? 'Set UNPAYWALL_EMAIL on vizmaya-fyi for free-to-read links' : undefined}>
              {k === 'openlibrary' ? 'Open Library' : k === 'openalex' ? 'OpenAlex' : k === 'wikidata' ? 'Wikidata' : 'Unpaywall'} · {state}
            </span>
          ))}
        </span>
      </div>
      <div className="px-4 py-3 border-b border-white/5 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] text-sm">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-start pt-0.5">Award</span>
        <div className="min-w-0">
          <a href={a.url} target="_blank" rel="noreferrer" className="text-neutral-100 hover:underline inline-flex items-center gap-1">
            {a.name}, {s.prize.name} {a.year}
            <ArrowSquareOut size={13} className="text-neutral-500" />
          </a>
          <div className="text-xs text-neutral-500">
            {[a.share ? `share ${a.share}` : null, a.coLaureates.length ? `with ${a.coLaureates.join(', ')}` : null, s.prize.awarder].filter(Boolean).join(' · ')}
          </div>
          {a.motivation ? (
            <blockquote className="mt-1 font-serif text-[15px] leading-snug text-neutral-200 border-l-2 border-white/15 pl-3">&ldquo;{a.motivation}&rdquo;</blockquote>
          ) : (
            <div className="mt-1 text-xs text-neutral-500">
              No motivation on record here: the citation is on the{' '}
              <a href={s.prize.url} target="_blank" rel="noreferrer" className="hover:text-white underline decoration-white/20">
                official list
              </a>
              .
            </div>
          )}
          {links.length > 0 && (
            <div className="mt-1 text-xs text-neutral-500 flex flex-wrap gap-x-3">
              {links.map(([k, v]) => (
                <a key={k} href={v} target="_blank" rel="noreferrer" className="hover:text-white underline decoration-white/20">
                  {k}
                </a>
              ))}
            </div>
          )}
        </div>
        <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-start pt-0.5">Work</span>
        <div className="min-w-0">
          {w ? (
            <>
              <a href={w.url} target="_blank" rel="noreferrer" className="text-neutral-100 hover:underline inline-flex items-center gap-1">
                {w.title}
                <ArrowSquareOut size={13} className="text-neutral-500" />
              </a>
              <div className="text-xs text-neutral-500">
                {[w.year ? String(w.year) : null, w.venue, w.authors.length ? w.authors.join(', ') : null, w.doi ? `DOI ${w.doi}` : null].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider">
                <span className={`px-2 py-0.5 rounded-full border ${w.representative || w.type === 'subject' ? 'text-amber-300 border-amber-400/40' : 'text-emerald-300 border-emerald-400/40'}`}>{basisLabel(w)}</span>
                {w.oaUrl ? (
                  <a href={w.oaUrl} target="_blank" rel="noreferrer" className="px-2 py-0.5 rounded-full border text-emerald-300 border-emerald-400/40 hover:bg-emerald-400/10">
                    free to read · {w.oaStatus ?? 'open'}
                  </a>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border text-neutral-400 border-white/10">no free copy on record{w.oaStatus ? ` · ${w.oaStatus}` : ''}</span>
                )}
                {w.citedBy !== null && (
                  <span className="px-2 py-0.5 rounded-full border text-neutral-300 border-white/10 normal-case tracking-normal font-mono tabular-nums">
                    {w.citedBy.toLocaleString('en-US')} citations{w.fwci !== null ? ` · FWCI ${w.fwci}` : ''}{w.topOnePercent ? ' · top 1%' : ''}
                  </span>
                )}
                {w.retracted && <span className="px-2 py-0.5 rounded-full border text-red-300 border-red-400/40">retracted</span>}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-400">No work resolved. The brief says to reconstruct it from the award&rsquo;s own account.</div>
          )}
        </div>
      </div>
      {s.related.length > 0 && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono mb-1.5">Other works the loader found ({s.related.length})</div>
          <ol className="text-xs text-neutral-400 grid gap-0.5 sm:grid-cols-2">
            {s.related.map((r) => (
              <li key={r.id} className="min-w-0 truncate">
                <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {r.title}
                </a>
                <span className="text-neutral-600">
                  {' '}
                  · {[r.year, basisLabel(r), r.oaUrl ? 'free' : null].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {(others.length > 0 || s.pool.sources.notes.length > 0 || s.pool.sources.errors.length > 0) && (
        <div className="px-4 py-3 text-xs text-neutral-500 flex flex-col gap-1">
          {others.length > 0 && (
            <div>
              Other {s.prize.name} laureates of {s.era.name}: {others.slice(0, 40).join('; ')}
              {others.length > 40 ? ` and ${others.length - 40} more` : ''}.
            </div>
          )}
          {s.pool.sources.notes.map((n, i) => (
            <div key={`n${i}`} className="text-amber-300/90">{n}</div>
          ))}
          {s.pool.sources.errors.map((e, i) => (
            <div key={`e${i}`} className="text-red-300/90">{e}</div>
          ))}
        </div>
      )}
    </section>
  )
}

const FLAG_LABEL: Record<HundredFlag, string> = {
  legendary: 'historicity debated',
  'no-portrait': 'not depicted',
  duo: 'two people',
  authorship: 'authorship contested',
  harm: 'human cost',
}

/** The 100 Desk's profile: the person the spin drew, their place in Hart's ranking, their life on Wikidata, and a year of pageviews. */
function HundredProfilePanel({ spin }: { spin: SpinRecord | null }) {
  const s = spin && spin.subject.randomizer === 'hundred' ? spin.subject : null
  if (!s) {
    return (
      <section className="rounded-xl border border-white/10 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-neutral-300 inline-flex items-center gap-1.5">
          <Crown size={15} className="text-orange-400" />
          The 100 profile
        </span>
        <span>
          {HUNDRED.people.length} people from {HUNDRED.book.author}&rsquo;s <i>The 100</i> ({HUNDRED.book.year} edition), in {HUNDRED.domains.length} domains and{' '}
          {HUNDRED.eras.length} eras. The ranking is committed; a spin reads the person&rsquo;s profile live (Wikidata, Wikipedia, pageviews) and keeps it on the spin.
        </span>
      </section>
    )
  }
  const p = s.person
  const pr = s.profile
  const life = (label: string, e: NonNullable<typeof pr>['born']) =>
    e ? (
      <div>
        <span className="text-neutral-500">{label}</span> {[e.date, e.place].filter(Boolean).join(', ')}
        {e.lat !== null && e.lon !== null && <span className="text-neutral-600 font-mono"> · {e.lat.toFixed(2)}, {e.lon.toFixed(2)}</span>}
      </div>
    ) : null
  const max = Math.max(1, ...(pr?.pageviews.map((v) => v.views) ?? []))
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <Crown size={15} className="text-orange-400" />
          The 100 profile
        </h2>
        <span className="text-xs text-neutral-500">
          #{p.rank} of 100 in {s.book.author}&rsquo;s list ({s.book.year}){pr ? `, read ${new Date(pr.asOf).toLocaleString()}` : ', no live profile on this spin'}.
          {s.sequence ? ' Walked on from the previous rank.' : ''}
        </span>
        {pr && (
          <span className="flex flex-wrap gap-1.5 sm:ml-auto">
            {(['wikidata', 'wikipedia', 'pageviews'] as const).map((k) => (
              <span key={k} className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${SOURCE_TONE[pr.sources[k]]}`}>
                {k === 'wikidata' ? 'Wikidata' : k === 'wikipedia' ? 'Wikipedia' : 'Pageviews'} · {pr.sources[k]}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="px-4 py-3 border-b border-white/5 flex gap-4">
        {pr?.image && (
          <a href={pr.imagePage ?? pr.image} target="_blank" rel="noreferrer" className="shrink-0" title="Portrait on Wikimedia Commons (licence on its file page)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${pr.image}?width=160`} alt={`Portrait of ${p.name}`} className="w-20 h-24 object-cover rounded-md border border-white/10 bg-neutral-800" />
          </a>
        )}
        <div className="min-w-0 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] text-sm flex-1">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-start pt-0.5">Person</span>
          <div className="min-w-0">
            <a href={pr?.wikipediaUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.replace(/ /g, '_'))}`} target="_blank" rel="noreferrer" className="text-neutral-100 hover:underline inline-flex items-center gap-1">
              {p.name}
              <ArrowSquareOut size={13} className="text-neutral-500" />
            </a>
            <div className="text-xs text-neutral-500">
              {[p.hart_name !== p.name ? `Hart: “${p.hart_name}”` : null, hundredLife(p), s.domain.name, p.region, pr?.description ?? null].filter(Boolean).join(' · ')}
            </div>
            {(p.flags.length > 0 || !pr?.image) && (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider">
                {p.flags.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded-full border text-amber-300 border-amber-400/40">
                    {FLAG_LABEL[f]}
                  </span>
                ))}
                {pr && !pr.image && !p.flags.includes('no-portrait') && <span className="px-2 py-0.5 rounded-full border text-neutral-400 border-white/10">no portrait on Wikidata</span>}
              </div>
            )}
          </div>
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-start pt-0.5">Ranking</span>
          <div className="text-xs text-neutral-400">
            {[s.neighbours.above, p, s.neighbours.below].map((n) =>
              n ? (
                <span key={n.rank} className={n.rank === p.rank ? 'text-orange-300' : ''}>
                  #{n.rank} {n.name}
                  {n.rank !== (s.neighbours.below?.rank ?? p.rank) ? ' · ' : ''}
                </span>
              ) : null,
            )}
          </div>
          {pr && (pr.born || pr.died) && (
            <>
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono self-start pt-0.5">Life</span>
              <div className="text-xs text-neutral-300 flex flex-col gap-0.5">
                {life('Born', pr.born)}
                {life('Died', pr.died)}
              </div>
            </>
          )}
        </div>
      </div>
      {pr && pr.pageviews.length > 0 && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono mb-1.5">
            English Wikipedia views by month{pr.sitelinks ? ` · ${pr.sitelinks} Wikipedia editions` : ''}
          </div>
          <div className="flex items-end gap-1 h-16">
            {pr.pageviews.map((v) => (
              <div key={v.month} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`${v.month}: ${v.views.toLocaleString('en-US')} views`}>
                <div className="w-full rounded-sm bg-orange-400/70" style={{ height: `${Math.max(2, Math.round((v.views / max) * 48))}px` }} />
                <span className="text-[9px] text-neutral-600 font-mono">{v.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(p.note || (pr && (pr.sources.notes.length > 0 || pr.sources.errors.length > 0))) && (
        <div className="px-4 py-3 text-xs text-neutral-500 flex flex-col gap-1">
          {p.note && <div className="text-amber-300/90">{p.note}</div>}
          {pr?.sources.notes.map((n, i) => (
            <div key={`n${i}`} className="text-amber-300/90">{n}</div>
          ))}
          {pr?.sources.errors.map((e, i) => (
            <div key={`e${i}`} className="text-red-300/90">{e}</div>
          ))}
        </div>
      )}
    </section>
  )
}

/** The NBA Desk's live news: what its 60% branch weights by, and the games a spin attaches. */
function NbaNews({ news }: { news: ViznbaNews | null }) {
  const [all, setAll] = useState(false)
  if (!news) {
    return (
      <section className="rounded-xl border border-white/10 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-500">
        The VizNBA news could not be read, so the NBA Desk cannot spin. Check the viznba_ tables (migration supabase/viznba/001_init.sql).
      </section>
    )
  }
  const teams = [...news.teams].sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name))
  const shown = all ? teams : teams.slice(0, 15)
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <Basketball size={15} className="text-orange-400" />
          NBA news heat
        </h2>
        <span className="text-xs text-neutral-500">
          Stories tagged on VizNBA in the last {news.windowDays} days, read {new Date(news.asOf).toLocaleString()}. Live from the feed and
          ESPN&rsquo;s schedule: nothing to refresh.
        </span>
        {!news.schedule.ok && (
          <span
            className="text-xs text-red-300 border border-red-400/40 bg-red-500/10 rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            title={news.schedule.error ?? undefined}
          >
            <Warning size={12} /> ESPN schedule unavailable
          </span>
        )}
      </div>
      <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-white/5">
        {VIZNBA.conferences.map((c) => {
          const n = news.conferences.find((x) => x.slug === c.slug)
          return (
            <span key={c.slug} className="text-xs rounded-full border border-white/15 text-neutral-200 px-2.5 py-1 inline-flex items-center gap-1.5" title={`${n?.articles ?? 0} stories`}>
              {c.name}
              <span className="font-mono tabular-nums text-orange-300/90">{n?.heat ?? 0}</span>
            </span>
          )
        })}
        <span className="text-xs text-neutral-500 self-center">{news.schedule.games} games on the schedule in the window</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">
            <tr className="border-b border-white/5">
              <th className="text-left font-medium px-4 py-2">Team</th>
              <th className="text-left font-medium px-4 py-2 w-40">Heat</th>
              <th className="text-left font-medium px-4 py-2">Stories</th>
              <th className="text-left font-medium px-4 py-2">In the news</th>
              <th className="text-left font-medium px-4 py-2">Last · next</th>
              <th className="text-left font-medium px-4 py-2">Newest headline</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const last = t.recent[0]
              const next = t.upcoming[0]
              return (
                <tr key={t.id} className="border-b border-white/5 last:border-0 align-top">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- ESPN logo CDN, 20px
                        <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full mx-[5px]" style={{ background: t.color }} />
                      )}
                      <span className="text-neutral-200">{t.name}</span>
                    </div>
                    <div className="text-xs text-neutral-500 pl-7">
                      {t.conference === 'east' ? 'East' : 'West'} · {t.division}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full bg-orange-500/80" style={{ width: `${t.heat}%` }} />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-neutral-300 w-7 text-right">{t.heat}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs tabular-nums text-neutral-400">{t.articles}</td>
                  <td className="px-4 py-2 text-xs text-neutral-400 max-w-[12rem]">
                    {t.people.length ? t.people.map((p) => `${p.name} (${p.articles})`).join(', ') : <span className="text-neutral-600">none</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-400 whitespace-nowrap font-mono">
                    {last ? (
                      <div>
                        {gameLine(last, t.id)}{' '}
                        {last.homeScore !== null && last.awayScore !== null
                          ? (() => {
                              const us = last.homeId === t.id ? last.homeScore : last.awayScore
                              const them = last.homeId === t.id ? last.awayScore : last.homeScore
                              return `${us > them ? 'W' : 'L'} ${us}-${them}`
                            })()
                          : ''}
                      </div>
                    ) : (
                      <div className="text-neutral-600">no recent game</div>
                    )}
                    {next ? (
                      <div className="text-neutral-500">
                        {gameLine(next, t.id)} {next.date.slice(5, 10)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-400 max-w-[22rem]">
                    {t.headlines[0] ? (
                      <a href={t.headlines[0].url} target="_blank" rel="noreferrer" className="hover:text-white">
                        {t.headlines[0].date}: {t.headlines[0].title}
                      </a>
                    ) : (
                      <span className="text-neutral-600">none in the window</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {teams.length > 15 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full text-xs text-neutral-400 hover:text-white py-2 border-t border-white/5">
          {all ? 'Show the top 15' : `Show all ${teams.length} teams`}
        </button>
      )}
    </section>
  )
}
