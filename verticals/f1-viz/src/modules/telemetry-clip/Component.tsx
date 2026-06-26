'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import {
  createFetchClipSource,
  createInlineClipSource,
  type ClipDataSource,
  type TelemetryClipMeta,
  type TelemetryClipPayload,
  type TelemetryClipTrace,
} from '../../web/clip/clipSource'
import { usePlayback } from '../../web/shared/usePlayback'
import { AlertIcon, CameraIcon, GaugeIcon, PauseIcon, PlayIcon, ResetIcon, SpinnerIcon } from '../../web/replay/icons'
import type { TelemetryClipConfig } from './index'

interface CarPos {
  driverNumber: number
  x: number
  y: number
  frameIdx: number
  trailX: number[]
  trailY: number[]
}

const interp = (arr: number[] | undefined, i: number, ni: number, r: number) => {
  if (!arr) return 0
  const v0 = arr[i] ?? 0
  const v1 = arr[ni] ?? v0
  return v0 + (v1 - v0) * r
}

export default function TelemetryClipComponent({
  config,
  mode,
  noteReady,
}: VizRenderProps<TelemetryClipConfig>) {
  const isCapture = mode === 'capture' || mode === 'print'

  const meta: TelemetryClipMeta = useMemo(
    () => ({
      sessionKey: config.sessionKey,
      lapFrom: config.lapFrom,
      lapTo: config.lapTo,
      driverNumbers: config.driverNumbers,
      focalDriverNumber: config.focalDriverNumber ?? null,
      // Always include gear so the dashboard widget never reads N.
      channels: config.channels ?? ['speed', 'throttle', 'brake', 'nGear'],
    }),
    [config.sessionKey, config.lapFrom, config.lapTo, config.driverNumbers, config.focalDriverNumber, config.channels],
  )

  const source: ClipDataSource = useMemo(() => {
    if (config.clip) return createInlineClipSource(config.clip)
    const base = config.apiBase ?? ''
    return createFetchClipSource({
      resolveUrl: config.clipUrl
        ? () => config.clipUrl as string
        : (m) => {
            const qs = new URLSearchParams()
            qs.set('drivers', m.driverNumbers.join(','))
            qs.set('lapFrom', String(m.lapFrom))
            qs.set('lapTo', String(m.lapTo))
            if (m.channels?.length) qs.set('channels', m.channels.join(','))
            if (m.hz) qs.set('hz', String(m.hz))
            return `${base}/api/telemetry/${encodeURIComponent(m.sessionKey)}/clip?${qs.toString()}`
          },
    })
  }, [config.clip, config.clipUrl, config.apiBase])

  const [data, setData] = useState<TelemetryClipPayload | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followCam, setFollowCam] = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<number | null>(config.focalDriverNumber ?? null)
  const [camBox, setCamBox] = useState('')
  const currentCam = useRef({ x: 0, y: 0, w: 0, h: 0 })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    source
      .load(meta)
      .then((res) => {
        if (cancelled) return
        setData(res)
        let maxMs = 0
        for (const t of res.tracks) {
          const dt = t.tEndMs - t.t0Ms
          if (dt > maxMs) maxMs = dt
        }
        setDurationMs(maxMs)
        if (res.circuit?.bounds) {
          const b = res.circuit.bounds
          currentCam.current = { x: b.minX - 2000, y: b.minY - 2000, w: b.maxX - b.minX + 4000, h: b.maxY - b.minY + 4000 }
          setCamBox(`${currentCam.current.x} ${currentCam.current.y} ${currentCam.current.w} ${currentCam.current.h}`)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load telemetry clip')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [source, meta])

  const playback = usePlayback({
    t0Ms: 0,
    tEndMs: durationMs,
    endMs: durationMs,
    autoPlay: config.autoPlay ?? (mode === 'autoplay' || mode === 'scroll'),
    mode,
    capturePlayhead: Math.max(0, Math.round(durationMs * 0.6)),
    resetKey: data,
  })

  // Signal readiness once the first frame can paint.
  useEffect(() => {
    if (loading) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [loading, data, noteReady])

  const redraw = playback.redrawSignal
  const currentTimeMs = playback.currentTimeRef.current

  // Per-car interpolated position + fading trail. Keyed on redrawSignal so it
  // recomputes once per animation frame (and exactly once in capture).
  const carPositions = useMemo<CarPos[]>(() => {
    if (!data?.tracks) return []
    const tNow = playback.currentTimeRef.current
    return data.tracks
      .map((track): CarPos => {
        const target = track.t0Ms + tNow
        const ts = track.frames.t
        let frameIdx = 0
        let nextFrameIdx = 0
        let r = 0
        for (let i = 0; i < ts.length; i++) {
          if (ts[i] >= target) {
            frameIdx = Math.max(0, i - 1)
            nextFrameIdx = i
            const t0 = ts[frameIdx]
            const t1 = ts[nextFrameIdx]
            r = t1 > t0 ? (target - t0) / (t1 - t0) : 0
            break
          }
          if (i === ts.length - 1) {
            frameIdx = i
            nextFrameIdx = i
          }
        }
        const x = interp(track.frames.x, frameIdx, nextFrameIdx, r)
        const y = interp(track.frames.y, frameIdx, nextFrameIdx, r)
        const start = Math.max(0, frameIdx - 20)
        const trailX = track.frames.x.slice(start, frameIdx + 1)
        const trailY = track.frames.y.slice(start, frameIdx + 1)
        trailX.push(x)
        trailY.push(y)
        return { driverNumber: track.driverNumber, x, y, frameIdx, trailX, trailY }
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, redraw])

  // Smooth follow camera. Snaps in capture (single deterministic frame).
  useEffect(() => {
    if (!data?.circuit?.bounds) return
    const b = data.circuit.bounds
    let targetX = b.minX - 2000
    let targetY = b.minY - 2000
    let targetW = b.maxX - b.minX + 4000
    let targetH = b.maxY - b.minY + 4000

    if (followCam && carPositions.length > 0) {
      const focus = selectedDriver
        ? carPositions.filter((p) => p.driverNumber === selectedDriver)
        : carPositions
      const use = focus.length > 0 ? focus : carPositions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of use) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      const padding = selectedDriver ? 1000 : 6000
      const minSize = selectedDriver ? 3000 : 15000
      if (maxX - minX < minSize) { const cx = (minX + maxX) / 2; minX = cx - minSize / 2; maxX = cx + minSize / 2 }
      if (maxY - minY < minSize) { const cy = (minY + maxY) / 2; minY = cy - minSize / 2; maxY = cy + minSize / 2 }
      targetX = minX - padding
      targetY = minY - padding
      targetW = maxX - minX + padding * 2
      targetH = maxY - minY + padding * 2
    }

    const smooth = isCapture ? 1 : selectedDriver ? 0.8 : 0.1
    currentCam.current.x += (targetX - currentCam.current.x) * smooth
    currentCam.current.y += (targetY - currentCam.current.y) * smooth
    currentCam.current.w += (targetW - currentCam.current.w) * smooth
    currentCam.current.h += (targetH - currentCam.current.h) * smooth
    setCamBox(`${currentCam.current.x} ${currentCam.current.y} ${currentCam.current.w} ${currentCam.current.h}`)
  }, [carPositions, followCam, data, selectedDriver, isCapture])

  if (loading) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface">
        <SpinnerIcon size={28} className="animate-spin text-accent" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">Initializing telemetry…</span>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-12 text-center">
        <AlertIcon size={28} className="text-accent" />
        <span className="font-mono text-xs text-muted">{error ?? 'Telemetry clip not available'}</span>
      </div>
    )
  }

  let gapText: string | null = null
  if (carPositions.length === 2) {
    const dx = carPositions[0].x - carPositions[1].x
    const dy = carPositions[0].y - carPositions[1].y
    gapText = `${(Math.sqrt(dx * dx + dy * dy) / 10).toFixed(1)}m`
  }

  const progress = durationMs > 0 ? Math.min(1, currentTimeMs / durationMs) : 0
  const atEnd = progress >= 1

  return (
    <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-text">
            {config.caption ?? 'Live telemetry'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {gapText && (
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-text">
              GAP <span className="font-bold">{gapText}</span>
            </span>
          )}
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted">
            LAPS {config.lapFrom}–{config.lapTo}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Track map */}
        <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden border-border bg-bg lg:col-span-1 lg:border-r">
          <button
            type="button"
            onClick={() => setFollowCam((v) => !v)}
            className={`absolute left-3 top-3 z-10 rounded-full border p-2 transition-colors ${
              followCam ? 'border-accent bg-accent text-bg' : 'border-border bg-surface text-muted hover:text-text'
            }`}
            title="Toggle follow cam"
          >
            <CameraIcon size={14} />
          </button>

          {data.circuit?.outline ? (
            <svg viewBox={camBox || '0 0 10000 10000'} className="h-full w-full">
              <path
                d={`M ${data.circuit.outline.x.map((x, i) => `${x},${data.circuit!.outline.y[i]}`).join(' L ')} Z`}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth="800"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={`M ${data.circuit.outline.x.map((x, i) => `${x},${data.circuit!.outline.y[i]}`).join(' L ')} Z`}
                fill="none"
                stroke="var(--color-muted)"
                strokeWidth="60"
                strokeDasharray="300 300"
              />
              {data.circuit.sectorBoundaries && (
                <g opacity="0.85">
                  <circle cx={data.circuit.outline.x[data.circuit.sectorBoundaries.index1]} cy={data.circuit.outline.y[data.circuit.sectorBoundaries.index1]} r="450" fill="#facc15" stroke="#000" strokeWidth="120" />
                  <circle cx={data.circuit.outline.x[data.circuit.sectorBoundaries.index2]} cy={data.circuit.outline.y[data.circuit.sectorBoundaries.index2]} r="450" fill="#facc15" stroke="#000" strokeWidth="120" />
                  <circle cx={data.circuit.outline.x[0]} cy={data.circuit.outline.y[0]} r="450" fill="#fff" stroke="#000" strokeWidth="120" />
                </g>
              )}
              {carPositions.map((pos) => {
                const driver = data.drivers.find((d) => d.driverNumber === pos.driverNumber)
                const raw = (driver?.teamColour ?? '').replace(/^#/, '')
                const color = raw ? `#${raw}` : '#ffffff'
                const trailPath =
                  pos.trailX.length > 1 ? `M ${pos.trailX.map((tx, i) => `${tx},${pos.trailY[i]}`).join(' L ')}` : ''
                return (
                  <g key={pos.driverNumber}>
                    {trailPath && (
                      <path d={trailPath} fill="none" stroke={color} strokeWidth="350" strokeOpacity="0.7" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    <circle cx={pos.x} cy={pos.y} r="600" fill={color} stroke="#fff" strokeWidth="200" />
                    <circle cx={pos.x} cy={pos.y} r="1000" fill="none" stroke={color} strokeWidth="80" opacity="0.6" />
                    <rect x={pos.x + 900} y={pos.y - 450} width="1600" height="900" rx="200" fill="#000" opacity="0.8" stroke={color} strokeWidth="80" />
                    <text x={pos.x + 1700} y={pos.y + 50} fontSize="600" fontFamily="monospace" fontWeight="900" fill="#fff" textAnchor="middle" dominantBaseline="middle">
                      {driver?.abbreviation || String(pos.driverNumber)}
                    </text>
                  </g>
                )
              })}
            </svg>
          ) : (
            <span className="font-mono text-xs uppercase tracking-widest text-muted">Track map unavailable</span>
          )}
        </div>

        {/* Dashboard */}
        <div className="flex flex-col divide-y divide-border lg:col-span-2">
          {data.drivers.map((driver) => {
            const track = data.tracks.find((t) => t.driverNumber === driver.driverNumber)
            const targetSec = track ? (track.t0Ms + currentTimeMs) / 1000 : currentTimeMs / 1000
            const tels: TelemetryClipTrace[] = data.telemetry.filter((t) => t.driverNumber === driver.driverNumber)
            let tel = tels.find(
              (t) => t.sessionTime?.length && targetSec >= t.sessionTime[0] && targetSec <= t.sessionTime[t.sessionTime.length - 1],
            )
            if (!tel && tels.length) {
              const first = tels[0]
              tel = first.sessionTime && targetSec < first.sessionTime[0] ? first : tels[tels.length - 1]
            }
            const raw = (driver.teamColour ?? '').replace(/^#/, '')
            const color = raw ? `#${raw}` : '#fff'
            let fi = 0
            let ni = 0
            let r = 0
            if (tel?.sessionTime) {
              for (let i = 0; i < tel.sessionTime.length; i++) {
                if (tel.sessionTime[i] >= targetSec) {
                  fi = Math.max(0, i - 1)
                  ni = i
                  const t0 = tel.sessionTime[fi]
                  const t1 = tel.sessionTime[ni]
                  r = t1 > t0 ? (targetSec - t0) / (t1 - t0) : 0
                  break
                }
                if (i === tel.sessionTime.length - 1) {
                  fi = i
                  ni = i
                }
              }
            }
            const speed = tel ? interp(tel.speed, fi, ni, r) : 0
            const throttle = tel ? interp(tel.throttle, fi, ni, r) : 0
            const brake = (tel ? interp(tel.brake, fi, ni, r) : 0) * 100
            const gear = tel?.nGear?.[fi] ?? 0
            const isSel = selectedDriver === driver.driverNumber

            return (
              <button
                type="button"
                key={driver.driverNumber}
                onClick={() => {
                  const selecting = selectedDriver !== driver.driverNumber
                  setSelectedDriver(selecting ? driver.driverNumber : null)
                  if (selecting) setFollowCam(true)
                }}
                className={`relative flex min-h-[120px] flex-col justify-center overflow-hidden p-4 text-left transition-colors ${
                  isSel ? 'bg-text/10' : 'hover:bg-text/5'
                }`}
              >
                <span className="absolute bottom-0 left-0 top-0 w-1.5" style={{ backgroundColor: color }} />
                <div className="mb-3 flex items-center justify-between pl-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl font-black tracking-tighter text-text">
                      {driver.abbreviation || `#${driver.driverNumber}`}
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">{driver.teamName}</span>
                  </div>
                  <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-muted">
                    <GaugeIcon size={12} /> LAP {tel?.lap ?? config.lapFrom}
                  </span>
                </div>
                <div className="grid grid-cols-12 items-end gap-3 pl-3">
                  <div className="col-span-4 flex flex-col border-r border-border pr-3">
                    <span className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-muted">Speed</span>
                    <span className="font-mono text-3xl font-black tabular-nums tracking-tighter text-text">
                      {Math.round(speed).toString().padStart(3, '0')}
                      <span className="ml-1 text-[9px] font-bold text-muted">km/h</span>
                    </span>
                  </div>
                  <div className="col-span-2 flex flex-col items-center border-r border-border pr-3">
                    <span className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-muted">Gear</span>
                    <span className="font-mono text-3xl font-black tabular-nums text-text">{gear === 0 ? 'N' : gear}</span>
                  </div>
                  <div className="col-span-6 flex items-end gap-3">
                    <div className="flex flex-1 flex-col">
                      <div className="mb-1 flex justify-between font-mono text-[9px] font-bold uppercase tracking-widest">
                        <span className="text-muted">Brake</span>
                        <span className="text-red-500">{Math.round(Math.max(0, brake))}%</span>
                      </div>
                      <div className="h-6 w-full overflow-hidden rounded-sm border border-border bg-bg">
                        <div className="h-full bg-red-600" style={{ width: `${Math.max(0, brake)}%`, opacity: brake > 0 ? 1 : 0 }} />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col">
                      <div className="mb-1 flex justify-between font-mono text-[9px] font-bold uppercase tracking-widest">
                        <span className="text-muted">Throttle</span>
                        <span className="text-emerald-500">{Math.round(throttle)}%</span>
                      </div>
                      <div className="h-6 w-full overflow-hidden rounded-sm border border-border bg-bg">
                        <div className="h-full bg-emerald-500" style={{ width: `${throttle}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 border-t border-border bg-bg p-3">
        <button
          type="button"
          onClick={() => {
            if (atEnd) playback.seek(0)
            playback.toggle()
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-text text-bg transition-colors hover:bg-accent hover:text-bg"
        >
          {playback.playing ? <PauseIcon size={18} /> : atEnd ? <ResetIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => playback.seek(parseFloat(e.target.value) * durationMs)}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-accent"
        />
      </div>
    </div>
  )
}
