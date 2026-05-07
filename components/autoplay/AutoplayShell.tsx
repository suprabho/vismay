'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createBrowserClient } from '@/lib/supabase'
import type { ResolvedUnit, StoryDefaults } from '@/lib/storyConfig.types'
import AutoplayAspectToggle, { type AutoplayRatio } from './AutoplayAspectToggle'
import TunePanel from './AutoplayTunePanel'

/* ─── DB row shapes ────────────────────────────────────────────────── */

interface ChunkRecord {
  chunk_index: number
  public_url: string
  duration_ms: number
}

interface CueRecord {
  unit_index: number
  chunk_index: number
  start_ms: number
  end_ms: number
}

/* ─── Props ────────────────────────────────────────────────────────── */

interface Props {
  slug: string
  title: string
  units: ResolvedUnit[]
  mobileUnits?: ResolvedUnit[]
  /**
   * For each desktop unit (index = position in `units`), the array of mobile
   * unit indices it expands into. Audio is generated per chunk; cues are
   * keyed by mobile-unit index, so this mapping is what lets a single visible
   * desktop unit cover multiple cues / span a chunk boundary.
   */
  desktopToMobile: number[][]
  accessToken: string
  defaults: StoryDefaults
}

/* ─── Fixed viewport dimensions per ratio ──────────────────────────── */

/**
 * Real pixel dimensions used for the iframe. The story page renders at these
 * dimensions so its `[@media(min-aspect-ratio:1/1)]` queries resolve based on
 * the iframe viewport (not the parent window). The whole iframe is then
 * CSS-scaled with `transform: scale()` to fit the available screen height.
 */
const VIEWPORT_DIMS: Record<AutoplayRatio, { width: number; height: number }> = {
  '9:16': { width: 414, height: 736 }, // mobile portrait — true 9:16
  '16:9': { width: 1280, height: 720 }, // widescreen — true 16:9
}

/* ─── Component ────────────────────────────────────────────────────── */

export default function AutoplayShell({
  slug,
  units: desktopUnits,
  mobileUnits,
  desktopToMobile,
}: Props) {
  const [ratio, setRatio] = useState<AutoplayRatio>('9:16')
  const [activeUnit, setActiveUnit] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  const [iframeReady, setIframeReady] = useState(false)
  const [scale, setScale] = useState(1)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const [chunks, setChunks] = useState<ChunkRecord[]>([])
  const [cues, setCues] = useState<CueRecord[]>([])

  /* ─── Tune mode (admin sync nudging) ────────────────────────────── */

  const [tuneMode, setTuneMode] = useState(false)
  /**
   * Per-unit local overrides applied on top of the loaded `cues`. Set by the
   * `[ ] { }` keyboard nudges and persisted via PATCH /api/admin/cues when
   * the user hits Save. Keys are unit_index. Values include a sentinel
   * `_dirty` so we can colour the UI for unsaved changes vs already-saved.
   */
  const [cueOverrides, setCueOverrides] = useState<Map<number, CueRecord>>(
    () => new Map()
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Use mobileUnits for 9:16 (vertical), desktop for 16:9
  const isVertical = ratio === '9:16'
  const units = useMemo(
    () => (isVertical && mobileUnits ? mobileUnits : desktopUnits),
    [isVertical, mobileUnits, desktopUnits]
  )

  /**
   * For the current display orientation, the list of mobile-unit cue indices
   * that back each visible unit. In 9:16 mode each visible unit IS a mobile
   * unit, so the mapping is identity. In 16:9 mode each visible unit may
   * cover multiple mobile units — and may therefore span a chunk boundary.
   */
  const audioIndicesPerUnit = useMemo<number[][]>(() => {
    if (isVertical) return units.map((_, i) => [i])
    return desktopToMobile
  }, [isVertical, units, desktopToMobile])

  const dims = VIEWPORT_DIMS[ratio]
  const scaledWidth = dims.width * scale
  const scaledHeight = dims.height * scale

  /* ─── Compute scale to fit available stage area ──────────────── */

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const compute = () => {
      const rect = stage.getBoundingClientRect()
      const availW = rect.width
      const availH = rect.height
      if (availW <= 0 || availH <= 0) return
      const s = Math.min(availW / dims.width, availH / dims.height)
      setScale(s)
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(stage)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [dims.width, dims.height])

  /* ─── Load chunks + cues from Supabase ───────────────────────── */

  useEffect(() => {
    const supabase = createBrowserClient()
    Promise.all([
      supabase
        .from('story_audio_chunks')
        .select('chunk_index, public_url, duration_ms')
        .eq('slug', slug)
        .order('chunk_index'),
      supabase
        .from('story_audio_cues')
        .select('unit_index, chunk_index, start_ms, end_ms')
        .eq('slug', slug)
        .order('unit_index'),
    ]).then(
      ([chunksRes, cuesRes]: [
        { data: ChunkRecord[] | null; error: { message: string } | null },
        { data: CueRecord[] | null; error: { message: string } | null }
      ]) => {
        if (chunksRes.error) {
          console.error('[Autoplay] Failed to load chunks:', chunksRes.error.message)
          setChunks([])
        } else {
          setChunks(chunksRes.data ?? [])
        }
        if (cuesRes.error) {
          console.error('[Autoplay] Failed to load cues:', cuesRes.error.message)
          setCues([])
        } else {
          setCues(cuesRes.data ?? [])
        }
      }
    )
  }, [slug])

  /* ─── Cue / chunk lookup helpers ──────────────────────────────── */

  /**
   * Base cues with any local tune-mode overrides applied. Everything
   * downstream (cueByUnit, cuesByChunk, firstCueForVisible) reads from this
   * so a nudge takes effect on the very next timeupdate without needing a
   * round-trip to the server.
   */
  const effectiveCues = useMemo(() => {
    if (cueOverrides.size === 0) return cues
    return cues.map((c) => cueOverrides.get(c.unit_index) ?? c)
  }, [cues, cueOverrides])

  const cueByUnit = useMemo(() => {
    const m = new Map<number, CueRecord>()
    for (const c of effectiveCues) m.set(c.unit_index, c)
    return m
  }, [effectiveCues])

  /**
   * Cues bucketed by chunk_index, sorted by start_ms — used by the
   * timeupdate handler to find the active cue without rescanning every cue.
   */
  const cuesByChunk = useMemo(() => {
    const m = new Map<number, CueRecord[]>()
    for (const c of effectiveCues) {
      const arr = m.get(c.chunk_index) ?? []
      arr.push(c)
      m.set(c.chunk_index, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start_ms - b.start_ms)
    return m
  }, [effectiveCues])

  const chunkByIndex = useMemo(() => {
    const m = new Map<number, ChunkRecord>()
    for (const c of chunks) m.set(c.chunk_index, c)
    return m
  }, [chunks])

  /**
   * Reverse mapping mobile-unit index → visible unit index. In 9:16 mode the
   * mapping is identity; in 16:9 mode it walks `desktopToMobile`. Memoized
   * once per ratio change.
   */
  const visibleForMobile = useMemo<Map<number, number>>(() => {
    const m = new Map<number, number>()
    if (isVertical) {
      for (let i = 0; i < units.length; i++) m.set(i, i)
    } else {
      for (let i = 0; i < desktopToMobile.length; i++) {
        for (const mi of desktopToMobile[i]) m.set(mi, i)
      }
    }
    return m
  }, [isVertical, units.length, desktopToMobile])

  /**
   * The first cue that backs a visible unit. Used to seek into the right
   * chunk + offset when the user presses Play on a particular dot.
   */
  const firstCueForVisible = useCallback(
    (visibleUnit: number): CueRecord | undefined => {
      const indices = audioIndicesPerUnit[visibleUnit] ?? []
      for (const mi of indices) {
        const c = cueByUnit.get(mi)
        if (c) return c
      }
      return undefined
    },
    [audioIndicesPerUnit, cueByUnit]
  )

  /* ─── Iframe scroll control ──────────────────────────────────── */

  /**
   * Scroll the iframe's snap-scroll container to the section with the given
   * `data-unit-index`. Same-origin so we can reach into contentDocument.
   */
  const scrollIframeToUnit = useCallback((unitIndex: number) => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    const target = doc.querySelector<HTMLElement>(
      `[data-unit-index="${unitIndex}"]`
    )
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // When iframe finishes loading, jump to the active unit (no smooth on init).
  const handleIframeLoad = useCallback(() => {
    setIframeReady(true)
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    const target = doc.querySelector<HTMLElement>(
      `[data-unit-index="${activeUnit}"]`
    )
    if (target) target.scrollIntoView({ block: 'start' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync iframe scroll when activeUnit changes (after the iframe has loaded).
  useEffect(() => {
    if (!iframeReady) return
    scrollIframeToUnit(activeUnit)
  }, [activeUnit, iframeReady, scrollIframeToUnit])
  /* ─── Audio playback ─────────────────────────────────────────── */

  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  // When ratio changes, the iframe reloads (different key) — reset state.
  useEffect(() => {
    setActiveUnit(0)
    setIframeReady(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
  }, [ratio])

  /**
   * Play the chunk that contains `startCue`, seeking to its `start_ms`. When
   * the chunk ends, automatically chain into the next chunk. activeUnit is
   * driven by the timeupdate handler, so the visible UI tracks the audio
   * position even mid-chunk.
   */
  const playFromCue = useCallback(
    (startCue: CueRecord) => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const chunk = chunkByIndex.get(startCue.chunk_index)
      if (!chunk) {
        setIsPlaying(false)
        return
      }

      setAudioLoading(true)
      const audio = new Audio(chunk.public_url)
      audioRef.current = audio

      audio.addEventListener('loadedmetadata', () => {
        // Seek before play so we don't briefly hear chunk-start audio
        audio.currentTime = startCue.start_ms / 1000
      })

      audio.addEventListener('canplay', () => setAudioLoading(false))

      audio.addEventListener('timeupdate', () => {
        if (audioRef.current !== audio) return
        const tMs = audio.currentTime * 1000
        const list = cuesByChunk.get(chunk.chunk_index)
        if (!list) return
        // Pick the latest cue whose start_ms <= tMs. List is sorted by
        // start_ms, so we can stop at the first cue that hasn't started yet.
        // This is tolerant of zero-duration cues (e.g. whisper clamping a
        // hallucinated end-of-chunk word) — they still flash active as the
        // playhead crosses their start, instead of being silently skipped.
        let active: CueRecord | undefined
        for (const c of list) {
          if (c.start_ms <= tMs) active = c
          else break
        }
        if (!active) return
        const visible = visibleForMobile.get(active.unit_index)
        if (visible !== undefined) {
          setActiveUnit((prev) => (prev === visible ? prev : visible))
        }
      })

      audio.addEventListener('ended', () => {
        if (audioRef.current !== audio) return
        const nextChunk = chunkByIndex.get(chunk.chunk_index + 1)
        if (!nextChunk) {
          setIsPlaying(false)
          audioRef.current = null
          return
        }
        const nextCues = cuesByChunk.get(nextChunk.chunk_index)
        const first = nextCues?.[0]
        if (!first) {
          setIsPlaying(false)
          audioRef.current = null
          return
        }
        playFromCue(first)
      })

      audio.addEventListener('error', () => {
        if (audioRef.current !== audio) return
        setAudioLoading(false)
        setIsPlaying(false)
        audioRef.current = null
      })

      audio.play().catch(() => {
        if (audioRef.current !== audio) return
        setAudioLoading(false)
        setIsPlaying(false)
        audioRef.current = null
      })
    },
    [chunkByIndex, cuesByChunk, visibleForMobile]
  )

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      stopPlayback()
      return
    }
    const cue = firstCueForVisible(activeUnit)
    if (!cue) {
      // No audio for this visible unit — nothing to play.
      return
    }
    setIsPlaying(true)
    playFromCue(cue)
  }, [isPlaying, stopPlayback, firstCueForVisible, activeUnit, playFromCue])

  const handlePrev = useCallback(() => {
    stopPlayback()
    setActiveUnit((prev) => Math.max(0, prev - 1))
  }, [stopPlayback])

  const handleNext = useCallback(() => {
    stopPlayback()
    setActiveUnit((prev) => Math.min(units.length - 1, prev + 1))
  }, [stopPlayback, units.length])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  /* ─── Tune-mode nudges ────────────────────────────────────────── */

  /**
   * Shift the boundary at the start of the currently-visible mobile unit by
   * `deltaMs`. Updates this unit's start_ms and the previous unit's end_ms in
   * lock-step when they share a chunk, so cues remain back-to-back. At a
   * chunk boundary only this unit's start_ms moves — the previous chunk's
   * audio file is on its own time base.
   */
  const nudgeBoundary = useCallback(
    (deltaMs: number) => {
      // Use the mobile unit index — boundaries are defined per mobile cue,
      // not per visible (16:9-collapsed) unit.
      const mobileIdx = audioIndicesPerUnit[activeUnit]?.[0]
      if (mobileIdx === undefined || mobileIdx === 0) return
      const baseCur = cues.find((c) => c.unit_index === mobileIdx)
      if (!baseCur) return
      const chunk = chunkByIndex.get(baseCur.chunk_index)
      if (!chunk) return

      const cur = cueOverrides.get(mobileIdx) ?? baseCur
      const newStart = Math.max(
        0,
        Math.min(chunk.duration_ms, cur.start_ms + deltaMs)
      )
      if (newStart === cur.start_ms) return

      const updated: CueRecord = {
        ...cur,
        start_ms: newStart,
        end_ms: Math.max(newStart, cur.end_ms),
      }

      setCueOverrides((prev) => {
        const next = new Map(prev)
        next.set(mobileIdx, updated)
        // Keep prev cue's end_ms aligned when same chunk so cuesByChunk stays
        // a contiguous timeline. Chunk boundaries are left alone.
        const basePrev = cues.find((c) => c.unit_index === mobileIdx - 1)
        if (basePrev && basePrev.chunk_index === cur.chunk_index) {
          const curPrev = next.get(mobileIdx - 1) ?? prev.get(mobileIdx - 1) ?? basePrev
          next.set(mobileIdx - 1, {
            ...curPrev,
            end_ms: newStart,
            start_ms: Math.min(curPrev.start_ms, newStart),
          })
        }
        return next
      })
    },
    [activeUnit, audioIndicesPerUnit, cues, cueOverrides, chunkByIndex]
  )

  const handleSaveTunings = useCallback(async () => {
    if (cueOverrides.size === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const updates = Array.from(cueOverrides.values()).map((c) => ({
        unit_index: c.unit_index,
        start_ms: c.start_ms,
        end_ms: c.end_ms,
      }))
      const res = await fetch(`/api/admin/cues/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // Fold overrides into the base cue array so the dirty count drops to 0
      // and future renders read the saved values directly.
      setCues((prev) => prev.map((c) => cueOverrides.get(c.unit_index) ?? c))
      setCueOverrides(new Map())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }, [slug, cueOverrides])

  const handleResetTunings = useCallback(() => {
    setCueOverrides(new Map())
    setSaveError(null)
  }, [])

  /* ─── Tune-mode keyboard ──────────────────────────────────────── */

  useEffect(() => {
    if (!tuneMode) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === '[' || e.key === ']') {
        e.preventDefault()
        const fine = e.shiftKey
        const dir = e.key === ']' ? 1 : -1
        nudgeBoundary(dir * (fine ? 25 : 100))
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSaveTunings()
      } else if (e.key === 'Escape') {
        setTuneMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tuneMode, nudgeBoundary, handleSaveTunings])

  /* ─── Render ───────────────────────────────────────────────────── */

  const hasAudioForCurrent = firstCueForVisible(activeUnit) !== undefined
  const totalDurationMs = chunks.reduce((sum, c) => sum + c.duration_ms, 0)

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 backdrop-blur-md border-b z-50"
        style={{
          borderColor: 'var(--color-line)',
          background: 'rgb(var(--color-panel-rgb) / 0.85)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <a
              href={`/story/${slug}`}
              className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text)' }}
            >
              &larr; Story
            </a>
            <h1
              className="font-[family-name:var(--font-serif)] text-lg font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              Autoplay
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <AutoplayAspectToggle value={ratio} onChange={setRatio} />
            <button
              onClick={() => setTuneMode((v) => !v)}
              className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider border transition-colors"
              style={{
                color: tuneMode ? 'var(--color-bg)' : 'var(--color-text)',
                background: tuneMode ? 'var(--color-accent)' : 'transparent',
                borderColor: tuneMode ? 'var(--color-accent)' : 'var(--color-surface)',
              }}
              aria-pressed={tuneMode}
            >
              Tune{cueOverrides.size > 0 ? ` · ${cueOverrides.size}*` : ''}
            </button>
            <div
              className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.65rem] tracking-wider"
              style={{ color: 'var(--color-muted)' }}
            >
              {chunks.length > 0
                ? `${chunks.length} chunks · ${(totalDurationMs / 1000).toFixed(0)}s`
                : 'no audio generated'}
            </div>
          </div>
        </div>
      </div>

      {/* Stage — fills remaining vertical space; iframe is scaled to fit. */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 flex items-center justify-center p-4"
      >
        <div
          className="relative"
          style={{
            width: scaledWidth,
            height: scaledHeight,
          }}
        >
          {/* Scaled wrapper that holds the real-pixel iframe. */}
          <div
            className="absolute top-0 left-0 overflow-hidden rounded-xl"
            style={{
              width: dims.width,
              height: dims.height,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              border: '1px solid var(--color-line, #1a2830)',
              background: 'var(--color-bg)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <iframe
              key={ratio /* force reload when ratio changes */}
              ref={iframeRef}
              src={`/story/${slug}?autoplay=1`}
              onLoad={handleIframeLoad}
              title="Autoplay preview"
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                pointerEvents: 'none', // Block direct interaction; controls live in parent
                display: 'block',
              }}
            />
          </div>

          {/* Progress dots — sit just below the scaled frame */}
          <div
            className="absolute left-0 right-0 flex gap-0.5"
            style={{ bottom: -14 }}
          >
            {units.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  stopPlayback()
                  setActiveUnit(i)
                }}
                className="flex-1 h-1 rounded-full transition-all duration-300"
                style={{
                  background:
                    i <= activeUnit
                      ? 'var(--color-accent)'
                      : 'var(--color-muted)',
                  opacity: i <= activeUnit ? 1 : 0.4,
                }}
                aria-label={`Jump to section ${i + 1}`}
              />
            ))}
          </div>

          {/* Loading overlay while iframe initializes */}
          {!iframeReady && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgb(var(--color-bg-rgb) / 0.6)' }}
            >
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{
                  borderColor: 'var(--color-accent)',
                  borderTopColor: 'transparent',
                }}
              />
            </div>
          )}

          {/* Audio loading indicator (top-right corner of frame) */}
          {audioLoading && iframeReady && (
            <div
              className="absolute z-30"
              style={{ top: 8, right: 8 }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                style={{
                  borderColor: 'var(--color-accent)',
                  borderTopColor: 'transparent',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tune panel — visible when tune mode is on. Floats above the stage,
          left side, so it doesn't compete with the playback controls below. */}
      {tuneMode && (
        <TunePanel
          activeUnit={activeUnit}
          mobileIdx={audioIndicesPerUnit[activeUnit]?.[0]}
          baseCues={cues}
          overrides={cueOverrides}
          dirtyCount={cueOverrides.size}
          saving={saving}
          saveError={saveError}
          onSave={handleSaveTunings}
          onReset={handleResetTunings}
        />
      )}

      {/* Playback controls */}
      <div
        className="shrink-0 border-t backdrop-blur-md z-50"
        style={{
          borderColor: 'var(--color-line)',
          background: 'rgb(var(--color-panel-rgb) / 0.9)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Section counter */}
          <div
            className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider"
            style={{ color: 'var(--color-muted)' }}
          >
            {activeUnit + 1} / {units.length}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrev}
              disabled={activeUnit === 0}
              className="p-2 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-80"
              style={{ color: 'var(--color-text)' }}
              aria-label="Previous section"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!iframeReady}
              className="p-3 rounded-full transition-colors disabled:opacity-50"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-bg)',
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button
              onClick={handleNext}
              disabled={activeUnit === units.length - 1}
              className="p-2 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-80"
              style={{ color: 'var(--color-text)' }}
              aria-label="Next section"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Audio status */}
          <div
            className="font-[family-name:var(--font-mono)] text-[0.65rem] tracking-wider"
            style={{ color: 'var(--color-muted)' }}
          >
            {hasAudioForCurrent ? (
              <span style={{ color: 'var(--color-accent)' }}>audio ready</span>
            ) : audioLoading ? (
              'loading...'
            ) : (
              'no audio'
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
