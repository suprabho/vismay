'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSchedule } from '@/lib/useSchedule'
import { useTelemetrySession } from '@/lib/useTelemetrySession'
import { RecapReplay } from '@/components/recap/RecapReplay'
import { RecapChapters } from '@/components/recap/RecapChapters'
import { RECAP_BEATS } from '@/lib/recap/sampleRecap'

/** Scroll events during a programmatic scroll are ignored for this long. */
const SCROLL_LOCK_MS = 900

/**
 * Race recap story: the 3D replay on the left (top on phones) and the chapters
 * in a rail on the right (below on phones). Scrolling the rail moves the replay
 * to the chapter being read; the chapter nav and the timeline markers move the
 * rail. "Read as one page" drops the replay for a plain article column.
 */
export default function RecapView({ round }: { round: number }) {
  const q = useSchedule()
  const race = (q.data ?? []).find((r) => r.round === round)
  const gpName = race?.raceName ?? 'Grand Prix'
  const season = race?.season ?? ''

  // Same session lookup as the replay page: OpenF1 and FastF1 number rounds
  // differently, so the real session_key is resolved by GP name (a bare round
  // would pull another race's telemetry). No ingested session → the demo race.
  const supabaseSource = process.env.NEXT_PUBLIC_VIZF1_REPLAY_SOURCE === 'supabase'
  const telem = useTelemetrySession(supabaseSource ? (race?.raceName ?? null) : null)
  const resolving = supabaseSource && (q.isLoading || (!!race && telem.isLoading))
  const sessionRef = resolving ? null : supabaseSource ? (telem.data?.sessionKey ?? 'demo') : String(round)

  const [beat, setBeat] = useState(0)
  const [onePage, setOnePage] = useState(false)
  const [shared, setShared] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)
  const scrollLock = useRef(0)
  const beatRef = useRef(beat)
  useEffect(() => {
    beatRef.current = beat
  }, [beat])

  const goTo = useCallback((i: number) => {
    const rail = railRef.current
    const sec = rail?.querySelectorAll<HTMLElement>('[data-beat]')[i]
    if (rail && sec) {
      scrollLock.current = Date.now() + SCROLL_LOCK_MS
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      rail.scrollTo({ top: Math.max(0, sec.offsetTop - 8), behavior: reduce ? 'auto' : 'smooth' })
    }
    setBeat(i)
  }, [])

  const onRailScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail || onePage || Date.now() < scrollLock.current) return
    const secs = rail.querySelectorAll<HTMLElement>('[data-beat]')
    let active = 0
    secs.forEach((s, i) => {
      if (s.offsetTop <= rail.scrollTop + rail.clientHeight * 0.4) active = i
    })
    if (rail.scrollTop + rail.clientHeight >= rail.scrollHeight - 4) active = secs.length - 1
    if (active !== beatRef.current) setBeat(active)
  }, [onePage])

  const toggleOnePage = () => {
    setOnePage((v) => !v)
    railRef.current?.scrollTo({ top: 0 })
    setBeat(0)
  }

  const share = async () => {
    const url = window.location.href
    const title = `${gpName} ${season} — race recap`.trim()
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared(true)
      window.setTimeout(() => setShared(false), 2000)
    } catch {
      // Share sheet dismissed or clipboard blocked: nothing to do.
    }
  }

  const beatNum = String(beat + 1).padStart(2, '0')
  const total = String(RECAP_BEATS.length).padStart(2, '0')

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      {/* ===== Header ===== */}
      <header className="box-border flex h-[52px] flex-none items-center gap-4 border-b border-border px-4 lg:h-14 lg:px-6">
        <Link
          href="/feed"
          className="flex h-7 flex-none items-center rounded-md bg-accent px-2.5 text-[15px] font-extrabold tracking-[0.04em] text-accent-text wdth-display"
        >
          VIZF1
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-px lg:flex-none">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted lg:text-[10px]">
            Race recap<span className="lg:hidden"> · sample data</span>
          </span>
          <Link
            href={`/race/${round}`}
            className="truncate text-sm font-semibold hover:text-accent lg:text-[15px]"
          >
            {gpName} {season}
            <span className="hidden lg:inline"> · Round {round}</span>
          </Link>
        </div>

        <nav aria-label="Chapters" className={`hidden flex-1 justify-center gap-1 ${onePage ? '' : 'lg:flex'}`}>
          {RECAP_BEATS.map((b, i) => {
            const on = i === beat
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => goTo(i)}
                aria-current={on ? 'step' : undefined}
                className={`flex h-14 cursor-pointer items-center gap-2 px-3.5 text-sm font-semibold transition-[color,box-shadow] duration-300 ${
                  on ? 'text-text shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-muted hover:text-text'
                }`}
              >
                <span className="font-mono text-[11px]">0{i + 1}</span>
                {b.label}
              </button>
            )
          })}
        </nav>
        {onePage ? <div className="hidden flex-1 lg:block" /> : null}

        <div className="flex flex-none items-center gap-3">
          <span className="hidden rounded border border-dashed border-[#3a4154] px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-muted lg:inline">
            SAMPLE DATA
          </span>
          <button
            type="button"
            onClick={toggleOnePage}
            aria-pressed={onePage}
            className={`h-[34px] cursor-pointer items-center rounded-lg border border-[#2c3242] px-3.5 text-[13px] font-semibold hover:border-muted ${
              onePage ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {onePage ? 'Back to replay' : 'Read as one page'}
          </button>
          {onePage ? null : (
            <span className="font-mono text-xs lg:hidden" aria-live="polite">
              {beatNum}
              <span className="text-muted"> / {total}</span>
            </span>
          )}
        </div>
      </header>

      {/* ===== Stage ===== */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {onePage ? null : (
          <RecapReplay sessionRef={sessionRef} beat={beat} onPickBeat={goTo} />
        )}

        <div
          ref={railRef}
          onScroll={onRailScroll}
          className={`relative box-border min-h-0 flex-auto overflow-y-auto px-5 [scrollbar-color:#2c3242_transparent] [scrollbar-width:thin] lg:h-full lg:min-w-0 ${
            onePage ? 'lg:px-6' : 'lg:px-14'
          }`}
        >
          <div className={onePage ? 'mx-auto max-w-[720px] pb-16' : ''}>
            <RecapChapters
              beat={beat}
              story={!onePage}
              round={round}
              onShare={share}
              shared={shared}
            />
          </div>
          {onePage ? null : <div className="h-[120px] lg:h-[220px]" />}
        </div>
      </div>
    </div>
  )
}
