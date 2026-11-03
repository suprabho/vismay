'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import type { EditionGeoPlace } from '@vismay/dc-editions/dcEditionTypes'
import { DC_REGIONS, formatEditionDate, type DcRegionKey } from '@vismay/dc-editions/dcEditionTypes'
import { LAND_MASK } from './landMask'
import { editionHref } from './editionUtils'

export interface GeoDay {
  date: string
  number: number | null
  places: EditionGeoPlace[]
}

type Mode = 'cumulative' | 'day'

const W = 1400
const H = 640
const PAD = 40
const px = (lon: number) => PAD + ((lon + 180) / 360) * (W - PAD * 2)
const py = (lat: number) => PAD + ((84 - lat) / 142) * (H - PAD * 2)
const STEP_MS = 650

/** A place as drawn for the selected morning, in either mode. */
interface Spot {
  slug: string
  name: string
  region: DcRegionKey
  x: number
  y: number
  /** Stories: that morning's, or the running total through it. */
  count: number
  /** Mornings it appeared on (1 in day mode). */
  days: number
  firstDate: string
  lastDate: string
  energy: boolean
  /** In the selected morning's edition. */
  today: boolean
  /** First appeared on the selected morning. */
  fresh: boolean
  r: number
  alpha: number
}

interface Drawn {
  r: number
  alpha: number
}

function aggregate(days: GeoDay[], idx: number, mode: Mode): Spot[] {
  if (idx < 0 || idx >= days.length) return []
  const today = new Map(days[idx].places.map((p) => [p.slug, p]))
  if (mode === 'day') {
    return days[idx].places.map((p) => ({
      slug: p.slug,
      name: p.name,
      region: p.region,
      x: px(p.lng),
      y: py(p.lat),
      count: p.count,
      days: 1,
      firstDate: days[idx].date,
      lastDate: days[idx].date,
      energy: p.energy,
      today: true,
      fresh: false,
      r: 5 + Math.min(p.count, 12) * 2.2,
      alpha: 1,
    }))
  }
  const acc = new Map<string, { p: EditionGeoPlace; count: number; days: number; energyDays: number; first: string; last: string }>()
  for (let i = 0; i <= idx; i++) {
    const d = days[i]
    for (const p of d.places) {
      const cur = acc.get(p.slug)
      if (cur) {
        cur.count += p.count
        cur.days += 1
        cur.energyDays += p.energy ? 1 : 0
        cur.last = d.date
        cur.p = p
      } else acc.set(p.slug, { p, count: p.count, days: 1, energyDays: p.energy ? 1 : 0, first: d.date, last: d.date })
    }
  }
  const date = days[idx].date
  const lead = Math.max(1, ...[...acc.values()].map((a) => a.count))
  return [...acc.values()].map((a) => ({
    slug: a.p.slug,
    name: a.p.name,
    region: a.p.region,
    x: px(a.p.lng),
    y: py(a.p.lat),
    count: a.count,
    days: a.days,
    firstDate: a.first,
    lastDate: a.last,
    energy: a.energyDays * 2 >= a.days,
    today: today.has(a.p.slug),
    fresh: a.first === date,
    // Area ∝ running total, scaled to the most-reported place so far.
    r: 4 + 20 * Math.sqrt(a.count / lead),
    alpha: today.has(a.p.slug) ? 1 : 0.5,
  }))
}

/**
 * The series landing's geography: every edition's frozen story clusters on
 * the same dot-matrix world as the edition's Chapter III, played back over
 * time. "Cumulative" grows each place by its running story total through the
 * selected morning (that morning's places at full strength, new ones ringed);
 * "That morning" shows only the selected edition's clusters. The strip below
 * is the scrubber — one bar per edition, its height the stories with a place.
 */
export default function GeoTimeline({ days }: { days: GeoDay[] }) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const drawnRef = useRef<Map<string, Drawn>>(new Map())
  const rafRef = useRef<number | null>(null)
  const tokRef = useRef<Record<string, string> | null>(null)
  // Spots that just left the map keep their position while they fade out.
  const lastSpot = useRef<Map<string, Spot>>(new Map())

  const [idx, setIdx] = useState(days.length - 1)
  const [mode, setMode] = useState<Mode>('cumulative')
  const [playing, setPlaying] = useState(false)
  const [hotSlug, setHotSlug] = useState<string | null>(null)
  const [tip, setTip] = useState<{ left: number; top: number; spot: Spot } | null>(null)

  const spots = useMemo(() => aggregate(days, idx, mode).sort((a, b) => b.r - a.r), [days, idx, mode])
  const bySlug = useMemo(() => new Map(spots.map((s) => [s.slug, s])), [spots])

  // ---- drawing -----------------------------------------------------------

  const readTokens = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return null
    const root = cv.closest('.dcd') ?? document.documentElement
    const cs = getComputedStyle(root)
    const t = (n: string) => cs.getPropertyValue(n).trim()
    tokRef.current = { dot: t('--map-dot'), acc: t('--accent'), en: t('--energy'), ink: t('--ink'), dim: t('--dim') }
    return tokRef.current
  }, [])

  const paint = useCallback(
    (drawn: Map<string, Drawn>) => {
      const cv = canvasRef.current
      const tok = tokRef.current ?? readTokens()
      if (!cv || !tok) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (cv.width !== W * dpr) {
        cv.width = W * dpr
        cv.height = H * dpr
      }
      const c = cv.getContext('2d')
      if (!c) return
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, W, H)
      c.fillStyle = tok.dot
      for (let i = 0; i < LAND_MASK.length; i += 2) {
        c.beginPath()
        c.arc(px(LAND_MASK[i] / 10), py(LAND_MASK[i + 1] / 10), 2.4, 0, Math.PI * 2)
        c.fill()
      }
      c.strokeStyle = tok.dot
      c.lineWidth = 0.6
      c.setLineDash([2, 7])
      c.beginPath()
      c.moveTo(PAD, py(0))
      c.lineTo(W - PAD, py(0))
      c.stroke()
      c.setLineDash([])

      // Draw every place that is still visible (including ones fading out), biggest first.
      const all = [...drawn.entries()]
        .filter(([, d]) => d.r > 0.4 && d.alpha > 0.01)
        .map(([slug, d]) => ({ slug, d, s: bySlug.get(slug) ?? lastSpot.current.get(slug) }))
        .filter((e): e is { slug: string; d: Drawn; s: Spot } => !!e.s)
        .sort((a, b) => b.d.r - a.d.r)
      for (const { slug, d, s } of all) {
        const col = s.energy ? tok.en : tok.acc
        const hot = hotSlug === slug
        const a = hotSlug && !hot ? d.alpha * 0.45 : d.alpha
        c.globalAlpha = a * 0.16
        c.fillStyle = col
        c.beginPath()
        c.arc(s.x, s.y, d.r * (hot ? 2.2 : mode === 'cumulative' ? 1.5 : 2.1), 0, Math.PI * 2)
        c.fill()
        c.globalAlpha = a
        c.beginPath()
        c.arc(s.x, s.y, d.r, 0, Math.PI * 2)
        c.fill()
        if (d.r > 4) {
          c.fillStyle = tok.ink
          c.beginPath()
          c.arc(s.x, s.y, Math.max(1.5, d.r - 3), 0, Math.PI * 2)
          c.fill()
          c.fillStyle = col
          c.beginPath()
          c.arc(s.x, s.y, Math.max(1, d.r - 5), 0, Math.PI * 2)
          c.fill()
        }
        if (s.fresh && mode === 'cumulative' && bySlug.has(slug)) {
          c.globalAlpha = a * 0.9
          c.strokeStyle = col
          c.lineWidth = 1.2
          c.setLineDash([3, 3])
          c.beginPath()
          c.arc(s.x, s.y, d.r + 7, 0, Math.PI * 2)
          c.stroke()
          c.setLineDash([])
        }
        c.globalAlpha = 1
      }

      c.strokeStyle = tok.dim
      c.lineWidth = 1
      for (const [x, y, sx, sy] of [
        [10, 10, 1, 1],
        [W - 10, 10, -1, 1],
        [10, H - 10, 1, -1],
        [W - 10, H - 10, -1, -1],
      ]) {
        c.beginPath()
        c.moveTo(x, y + 12 * sy)
        c.lineTo(x, y)
        c.lineTo(x + 12 * sx, y)
        c.stroke()
      }
    },
    [bySlug, hotSlug, mode, readTokens],
  )

  useEffect(() => {
    for (const s of spots) lastSpot.current.set(s.slug, s)
    const drawn = drawnRef.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = (slug: string): Drawn => {
      const s = bySlug.get(slug)
      return s ? { r: s.r, alpha: s.alpha } : { r: 0, alpha: 0 }
    }
    for (const s of spots) if (!drawn.has(s.slug)) drawn.set(s.slug, { r: 0, alpha: s.alpha })

    if (reduce) {
      for (const slug of [...drawn.keys()]) {
        const t = target(slug)
        if (t.r === 0) drawn.delete(slug)
        else drawn.set(slug, t)
      }
      paint(drawn)
      return
    }

    const tick = () => {
      let moving = false
      for (const [slug, d] of [...drawn]) {
        const t = target(slug)
        const nr = d.r + (t.r - d.r) * 0.22
        const na = d.alpha + (t.alpha - d.alpha) * 0.22
        if (Math.abs(nr - t.r) < 0.15 && Math.abs(na - t.alpha) < 0.01) {
          if (t.r === 0) drawn.delete(slug)
          else drawn.set(slug, t)
        } else {
          drawn.set(slug, { r: nr, alpha: na })
          moving = true
        }
      }
      paint(drawn)
      rafRef.current = moving ? requestAnimationFrame(tick) : null
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [spots, bySlug, paint])

  // Repaint on theme changes.
  useEffect(() => {
    const redraw = () => {
      readTokens()
      paint(drawnRef.current)
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', redraw)
    const mo = new MutationObserver(redraw)
    const root = canvasRef.current?.closest('.dcd')
    if (root) mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', redraw)
      mo.disconnect()
    }
  }, [paint, readTokens])

  // ---- playback ----------------------------------------------------------

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setIdx((i) => {
        if (i >= days.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, STEP_MS)
    return () => clearInterval(t)
  }, [playing, days.length])

  const togglePlay = () => {
    if (playing) return setPlaying(false)
    if (idx >= days.length - 1) setIdx(0)
    setPlaying(true)
  }

  // ---- interaction -------------------------------------------------------

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>): Spot | null => {
    const cv = canvasRef.current
    if (!cv) return null
    const b = cv.getBoundingClientRect()
    const x = ((e.clientX - b.left) * W) / b.width
    const y = ((e.clientY - b.top) * H) / b.height
    let best: Spot | null = null
    let bd = Infinity
    for (const s of spots) {
      const d = Math.hypot(s.x - x, s.y - y) - s.r
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return bd < 24 ? best : null
  }

  const scrubTo = (clientX: number) => {
    const el = stripRef.current
    if (!el) return
    const b = el.getBoundingClientRect()
    const i = Math.floor(((clientX - b.left) / b.width) * days.length)
    setIdx(Math.max(0, Math.min(days.length - 1, i)))
  }

  // ---- derived figures ---------------------------------------------------

  const perDay = useMemo(
    () =>
      days.map((d) => ({
        total: d.places.reduce((a, p) => a + p.count, 0),
        energy: d.places.filter((p) => p.energy).reduce((a, p) => a + p.count, 0),
      })),
    [days],
  )
  const maxDay = Math.max(1, ...perDay.map((d) => d.total))
  const months = useMemo(() => {
    const out: { i: number; label: string }[] = []
    let prev = ''
    days.forEach((d, i) => {
      const m = d.date.slice(0, 7)
      if (m !== prev) {
        out.push({ i, label: new Date(`${d.date}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) })
        prev = m
      }
    })
    return out
  }, [days])

  const day = days[idx]
  if (!day) return null
  const stories = spots.reduce((a, s) => a + s.count, 0)
  const freshCount = spots.filter((s) => s.fresh).length
  const top = [...spots].sort((a, b) => b.count - a.count).slice(0, 8)
  const topMax = Math.max(1, ...top.map((s) => s.count))
  const regions = regionTotals(spots)
  const dateLabel = formatEditionDate(day.date)
  const stamp = mode === 'cumulative' ? `Through ${formatEditionDate(day.date, { weekday: false })}` : formatEditionDate(day.date, { weekday: false })

  return (
    <div className="grid gap-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Map mode" className="inline-flex rounded-full border border-[var(--line-strong)] p-0.5 font-[family-name:var(--mono)] text-xs">
          {(
            [
              ['cumulative', 'Cumulative'],
              ['day', 'That morning'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full! px-4! py-1.5! transition-colors ${mode === m ? 'bg-[var(--accent)]! text-[var(--accent-ink)]!' : 'text-[var(--muted)]! hover:text-[var(--bone)]!'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {days.length > 1 && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause playback' : 'Play the editions in order'}
            className="inline-flex items-center gap-2 rounded-full! border! border-[var(--line-strong)]! px-4! py-1.5! font-[family-name:var(--mono)] text-xs hover:bg-[var(--accent-wash)]!"
          >
            {playing ? <PauseIcon size={14} weight="fill" aria-hidden="true" /> : <PlayIcon size={14} weight="fill" aria-hidden="true" />}
            {playing ? 'Pause' : idx >= days.length - 1 ? 'Replay' : 'Play'}
          </button>
        )}
        <span className="ml-auto font-[family-name:var(--mono)] text-xs text-[var(--muted)]" aria-live="polite">
          {day.number != null && <span className="text-[var(--dim)]">№ {day.number} · </span>}
          {dateLabel}
        </span>
      </div>

      {/* Map */}
      <div className="mapbox overflow-hidden rounded-xl border border-[var(--line)]" ref={boxRef}>
        <div className="map-scroll">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            aria-label={`World map of where the editions' stories cluster — ${mode === 'cumulative' ? 'running totals through' : 'the edition of'} ${dateLabel}`}
            style={{ cursor: hotSlug ? 'pointer' : 'default' }}
            onMouseMove={(e) => {
              const s = nearest(e)
              if ((s?.slug ?? null) !== hotSlug) setHotSlug(s?.slug ?? null)
              if (s && boxRef.current) {
                const bb = boxRef.current.getBoundingClientRect()
                const x = e.clientX - bb.left
                const y = e.clientY - bb.top
                setTip({ left: Math.min(x + 14, bb.width - 210), top: y - 92 > 8 ? y - 92 : y + 18, spot: s })
              } else setTip(null)
            }}
            onMouseLeave={() => {
              setHotSlug(null)
              setTip(null)
            }}
            onClick={(e) => {
              const s = nearest(e)
              if (s) router.push(editionHref(s.today ? day.date : s.lastDate))
            }}
          />
          {spots.length === 0 && (
            <div className="notice" style={{ position: 'absolute', left: 'var(--gutter)', bottom: 24 }}>
              No story in this edition carried a place tag.
            </div>
          )}
        </div>
        {tip && (
          <div className="maptip" style={{ left: tip.left, top: tip.top }}>
            <b>{tip.spot.name}</b>
            <span>
              {tip.spot.count} stor{tip.spot.count === 1 ? 'y' : 'ies'} · {DC_REGIONS[tip.spot.region]}
            </span>
            {mode === 'cumulative' && (
              <span>
                {tip.spot.days} morning{tip.spot.days === 1 ? '' : 's'} · first {formatEditionDate(tip.spot.firstDate, { weekday: false, year: false })}
              </span>
            )}
            <em>Read the {tip.spot.today ? 'edition' : `${formatEditionDate(tip.spot.lastDate, { weekday: false, year: false })} edition`}</em>
          </div>
        )}
        <div className="stamp">{stamp}</div>
        <div className="legend">
          <span>
            <i />
            Story cluster
          </span>
          <span>
            <i className="energy" />
            Energy-tagged
          </span>
          {mode === 'cumulative' && <span className="hidden sm:inline">Faded · not in this morning’s edition</span>}
        </div>
      </div>

      {/* Scrubber: one bar per edition */}
      {days.length > 1 && (
        <div className="grid gap-1.5">
          <div
            ref={stripRef}
            role="slider"
            tabIndex={0}
            aria-label="Edition"
            aria-valuemin={1}
            aria-valuemax={days.length}
            aria-valuenow={idx + 1}
            aria-valuetext={dateLabel}
            className="relative h-14 cursor-pointer touch-none rounded-md outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            onPointerDown={(e) => {
              setPlaying(false)
              e.currentTarget.setPointerCapture(e.pointerId)
              scrubTo(e.clientX)
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e.clientX)
            }}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -7, PageUp: 7 }[e.key]
              if (step != null) {
                e.preventDefault()
                setPlaying(false)
                setIdx((i) => Math.max(0, Math.min(days.length - 1, i + step)))
              } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault()
                setPlaying(false)
                setIdx(e.key === 'Home' ? 0 : days.length - 1)
              }
            }}
          >
            <svg viewBox={`0 0 ${days.length} 56`} preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
              {perDay.map((d, i) => {
                const h = d.total ? Math.max(3, (d.total / maxDay) * 52) : 1.5
                const he = d.total ? (d.energy / d.total) * h : 0
                const sel = i === idx
                const included = mode === 'cumulative' ? i <= idx : sel
                const op = sel ? 1 : included ? 0.75 : 0.28
                const gap = days.length > 60 ? 0.12 : 0.22
                return (
                  <g key={days[i].date} opacity={op}>
                    <rect x={i + gap / 2} y={56 - h} width={1 - gap} height={h - he} fill={sel ? 'var(--bone)' : 'var(--accent)'} />
                    {he > 0 && <rect x={i + gap / 2} y={56 - he} width={1 - gap} height={he} fill="var(--energy)" />}
                  </g>
                )
              })}
            </svg>
            <span
              className="pointer-events-none absolute -top-1 bottom-0 w-px bg-[var(--bone)]"
              style={{ left: `${((idx + 0.5) / days.length) * 100}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="relative h-4 font-[family-name:var(--mono)] text-[10.5px] text-[var(--dim)]" aria-hidden="true">
            {months.map((m) => (
              <span key={m.i} className="absolute whitespace-nowrap" style={{ left: `${(m.i / days.length) * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Figures + leading places */}
      <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 self-start">
          <Figure label={mode === 'cumulative' ? 'Places so far' : 'Places'} value={spots.length} />
          <Figure label={mode === 'cumulative' ? 'Placed stories so far' : 'Placed stories'} value={stories} />
          {mode === 'cumulative' ? (
            <>
              <Figure label="Mornings" value={idx + 1} />
              <Figure label="New this morning" value={freshCount} />
            </>
          ) : (
            <Figure label="Regions" value={regions.length} />
          )}
          <div className="col-span-2 grid gap-2">
            <dt className="eyebrow">By region</dt>
            <dd className="flex h-2 overflow-hidden rounded-full bg-[var(--line)]">
              {regions.map((r) => (
                <i
                  key={r.key}
                  title={`${DC_REGIONS[r.key]} · ${r.count}`}
                  className="block h-full border-r border-[var(--surface)] bg-[var(--accent)] last:border-r-0"
                  style={{ flexGrow: r.count, opacity: 0.35 + 0.65 * (r.count / (regions[0]?.count || 1)) }}
                />
              ))}
            </dd>
            <dd className="flex flex-wrap gap-x-4 gap-y-1 font-[family-name:var(--mono)] text-[11px] text-[var(--muted)]">
              {regions.map((r) => (
                <span key={r.key}>
                  {DC_REGIONS[r.key]} <span className="text-[var(--bone)]">{r.count}</span>
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <div className="grid gap-3 self-start">
          <h3 className="eyebrow">{mode === 'cumulative' ? 'Most-reported places so far' : 'This morning’s places'}</h3>
          {top.length === 0 ? (
            <p className="text-[15px] text-[var(--muted)]">No placed stories.</p>
          ) : (
            <ol className="grid">
              {top.map((s) => (
                <li key={s.slug} className="border-t border-[var(--line)]">
                  <a
                    href={editionHref(s.today ? day.date : s.lastDate)}
                    onMouseEnter={() => setHotSlug(s.slug)}
                    onMouseLeave={() => setHotSlug(null)}
                    onFocus={() => setHotSlug(s.slug)}
                    onBlur={() => setHotSlug(null)}
                    className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-4 py-2.5 transition-colors hover:bg-[var(--accent-wash)]"
                  >
                    <span className="truncate text-[15px]">
                      {s.name}
                      <span className="ml-2 font-[family-name:var(--mono)] text-[10.5px] text-[var(--dim)]">{DC_REGIONS[s.region]}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                      <i
                        className="block h-full rounded-full"
                        style={{ width: `${(s.count / topMax) * 100}%`, background: s.energy ? 'var(--energy)' : 'var(--accent)', opacity: s.today ? 1 : 0.55 }}
                      />
                    </span>
                    <span className="text-right font-[family-name:var(--serif)] text-lg tabular-nums">{s.count}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-[family-name:var(--serif)] text-4xl leading-none tabular-nums">{value}</dd>
    </div>
  )
}

function regionTotals(spots: Spot[]): { key: DcRegionKey; count: number }[] {
  const m = new Map<DcRegionKey, number>()
  for (const s of spots) m.set(s.region, (m.get(s.region) ?? 0) + s.count)
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}
