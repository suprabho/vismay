'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import {
  CAMERA_ORDER,
  RECAP_BEATS,
  RECAP_CAMERAS,
  RECAP_CARS,
  TOTAL_LAPS,
  type CameraKey,
} from '@/lib/recap/sampleRecap'

/** The track plane's own size; beat positions and camera origins use it. */
const PLANE_W = 640
const PLANE_H = 420

const TRACK =
  'M 90 330 L 430 330 C 520 330 560 290 545 240 L 505 150 C 490 110 445 100 415 125 L 360 170 C 335 190 300 185 285 160 L 250 95 C 232 62 190 55 165 80 L 85 165 C 60 192 55 240 65 280 C 72 312 80 330 90 330 Z'

/** The camera's flight and the cars' moves share one curve and duration. */
const FLY = '1100ms cubic-bezier(.65,0,.25,1)'

interface RecapReplayProps {
  beat: number
  cam: CameraKey
  playing: boolean
  onPickBeat: (i: number) => void
  onPickCam: (k: CameraKey) => void
  onTogglePlay: () => void
}

/**
 * The "3D replay": an SVG circuit on a plane under a CSS perspective, flown
 * between broadcast-style camera presets as the story moves from beat to beat.
 * The cars glide to the beat's positions on the same curve as the camera.
 */
export function RecapReplay({ beat, cam, playing, onPickBeat, onPickCam, onTogglePlay }: RecapReplayProps) {
  const b = RECAP_BEATS[beat]
  const camera = RECAP_CAMERAS[cam]
  const scale = usePlaneScale()

  return (
    <div
      ref={scale.ref}
      aria-label="3D race replay"
      className="relative h-[380px] flex-none overflow-hidden border-b border-border bg-[#08090d] lg:h-full lg:flex-[0_0_58%] lg:border-b-0 lg:border-r"
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: PLANE_W,
          height: PLANE_H,
          marginLeft: -PLANE_W / 2,
          marginTop: -250,
          transform: `scale(${scale.value})`,
          perspective: 1100,
        }}
      >
        <div
          className="absolute inset-0 motion-reduce:!transition-none"
          style={{
            transformOrigin: camera.origin,
            transform: camera.transform,
            transition: `transform ${FLY}, transform-origin ${FLY}`,
          }}
        >
          {/* ground grid, oversized so no edge shows at any camera angle */}
          <div
            className="absolute -inset-[700px]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <svg
            width={PLANE_W}
            height={PLANE_H}
            viewBox={`0 0 ${PLANE_W} ${PLANE_H}`}
            className="absolute left-0 top-0 overflow-visible"
            aria-hidden
          >
            <path d={TRACK} fill="none" stroke="#151924" strokeWidth={40} strokeLinejoin="round" />
            <path d={TRACK} fill="none" stroke="#3a4154" strokeWidth={22} strokeLinejoin="round" />
            <path d={TRACK} fill="none" stroke="#262b38" strokeWidth={18} strokeLinejoin="round" />
            <path d={TRACK} fill="none" stroke="var(--color-accent)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 6" />
            <path d="M 150 352 L 420 352" fill="none" stroke="#3a4154" strokeWidth={6} strokeLinecap="round" />
            <path d="M 120 340 C 135 352 140 352 150 352 M 420 352 C 440 352 450 345 460 334" fill="none" stroke="#3a4154" strokeWidth={4} />
            <rect x={298} y={319} width={4} height={22} fill="#f5f5f5" />
            <text x={300} y={312} textAnchor="middle" className="font-mono" fontSize={8} fill="#8e8e99">S/F</text>
            <text x={402} y={104} textAnchor="middle" className="font-mono" fontSize={8} fill="#8e8e99">T4</text>
            <text x={285} y={368} textAnchor="middle" className="font-mono" fontSize={7} fill="#5b6275">PIT LANE</text>
          </svg>

          {RECAP_CARS.map((c, i) => {
            const focused = b.focus.includes(c.code)
            const [x, y] = b.positions[i]
            return (
              <div
                key={c.code}
                className="absolute h-0 w-0 motion-reduce:!transition-none"
                style={{
                  left: x,
                  top: y,
                  opacity: focused ? 1 : 0.5,
                  zIndex: focused ? 3 : 2,
                  transition: `left ${FLY}, top ${FLY}, opacity 400ms`,
                }}
              >
                <div
                  className="absolute -left-[7px] -top-[7px] size-2.5 rounded-full border-2 border-[#08090d] box-content"
                  style={{
                    background: c.color,
                    boxShadow: focused ? `0 0 0 4px rgba(255,255,255,0.18), 0 0 16px 4px ${c.color}` : 'none',
                  }}
                />
                <div
                  className="absolute left-[9px] -top-[22px] whitespace-nowrap rounded-[3px] px-[5px] py-0.5 font-mono text-[9px] font-bold"
                  style={{
                    background: focused ? c.color : 'rgba(11,13,18,0.85)',
                    color: focused ? '#0b0d12' : '#c9c9d1',
                  }}
                >
                  {c.code}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,9,13,0)_55%,rgba(8,9,13,0.85)_100%)]" />

      {/* camera chip */}
      <div className="absolute left-3 top-3 z-[5] flex flex-col gap-[3px] rounded-lg border border-border bg-[rgba(11,13,18,0.82)] px-2.5 py-[7px] lg:left-5 lg:top-5 lg:px-3.5 lg:py-2.5">
        <span className="font-mono text-[9px] tracking-[0.12em] text-muted">CAM {camera.num}</span>
        <span className="text-[13px] font-bold uppercase tracking-[0.02em] [font-stretch:75%] lg:text-base">
          {camera.name} <span className="font-medium text-muted">· {camera.desc}</span>
        </span>
      </div>

      {/* replay + lap chips */}
      <div className="absolute right-3 top-3 z-[5] flex items-center gap-2 lg:right-5 lg:top-5">
        <span className="flex items-center gap-1.5 rounded-md border border-border bg-[rgba(11,13,18,0.82)] px-[9px] py-1.5 font-mono text-[10px] tracking-[0.08em]">
          <span className="size-1.5 animate-[vf-pulse_1.4s_ease-in-out_infinite] rounded-full bg-accent motion-reduce:animate-none" />
          REPLAY
        </span>
        <span className="rounded-md border border-border bg-[rgba(11,13,18,0.82)] px-2.5 py-1.5 font-mono text-[11px] font-semibold lg:text-[13px]">
          LAP {b.lap}/{TOTAL_LAPS}
        </span>
      </div>

      {/* timeline + camera angles */}
      <div className="absolute inset-x-3 bottom-3 z-[5] flex flex-col gap-2.5 lg:inset-x-5 lg:bottom-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-text text-bg"
          >
            {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
          <div className="relative h-7 flex-1">
            <div className="absolute inset-x-0 top-3 h-1 rounded-sm bg-[#262b38]" />
            <div
              className="absolute left-0 top-3 h-1 rounded-sm bg-accent motion-reduce:!transition-none"
              style={{ width: `${b.pct}%`, transition: `width ${FLY}` }}
            />
            {RECAP_BEATS.map((x, i) => (
              <button
                key={x.label}
                type="button"
                onClick={() => onPickBeat(i)}
                aria-label={`Jump to chapter ${i + 1}: ${x.label}`}
                className="absolute top-0 -ml-3.5 flex size-7 cursor-pointer items-center justify-center"
                style={{ left: `${x.pct}%` }}
              >
                <span
                  className="block size-3 rounded-full border-2 border-[#08090d] box-content"
                  style={{ background: i <= beat ? 'var(--color-accent)' : '#4a5163' }}
                />
              </button>
            ))}
          </div>
        </div>
        <div
          role="group"
          aria-label="Camera angle"
          className="flex gap-[3px] self-stretch rounded-[10px] border border-border bg-[rgba(19,22,29,0.92)] p-[3px] lg:self-start"
        >
          {CAMERA_ORDER.map((k) => {
            const on = k === cam
            return (
              <button
                key={k}
                type="button"
                onClick={() => onPickCam(k)}
                aria-pressed={on}
                className={`h-10 flex-1 cursor-pointer rounded-[7px] px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-[250ms] lg:h-[34px] lg:flex-none ${
                  on ? 'bg-text text-bg' : 'text-[#a3a3ad] hover:text-text'
                }`}
              >
                {RECAP_CAMERAS[k].name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Scales the 640 × 420 plane to the replay pane: about 1.2× in the desktop
 * pane, about 0.6× in the phone's 380px band.
 */
function usePlaneScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width && height) setValue(Math.min((width / PLANE_W) * 0.94, (height / PLANE_H) * 0.95))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, value }
}
