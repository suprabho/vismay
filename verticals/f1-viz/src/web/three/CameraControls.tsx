'use client'

import { useEffect, useState } from 'react'
import {
  CarProfile,
  CubeFocus,
  Drone,
  MagicWand,
  SteeringWheel,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react'
import type { CameraHudInfo } from './CameraRig'
import { CAMERA_MODES, type CameraMode, type ShotKind } from './cameraModes'

const MODE_META: Record<CameraMode, { label: string; title: string; icon: Icon }> = {
  auto: { label: 'Auto', title: 'Auto camera — cuts to the action', icon: MagicWand },
  pov: { label: 'POV', title: 'Driver POV — onboard helmet cam', icon: SteeringWheel },
  chase: { label: 'Chase', title: 'Chase cam — behind the car', icon: CarProfile },
  tv: { label: 'TV', title: 'Trackside TV cameras', icon: VideoCamera },
  heli: { label: 'Heli', title: 'Helicopter — aerial follow', icon: Drone },
  orbit: { label: 'Orbit', title: 'Free orbit around the circuit', icon: CubeFocus },
}

const SHOT_LABEL: Record<ShotKind, string> = {
  pov: 'Onboard',
  chase: 'Chase cam',
  tv: 'Trackside',
  heli: 'Helicopter',
}

/** Segmented camera-mode picker overlaid on the 3D view. */
export function CameraModeSwitcher({ mode, onChange }: { mode: CameraMode; onChange: (m: CameraMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Camera"
      className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-black/60 p-0.5 backdrop-blur"
    >
      {CAMERA_MODES.map((m) => {
        const meta = MODE_META[m]
        const IconCmp = meta.icon
        const active = m === mode
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            title={meta.title}
            onClick={() => onChange(m)}
            className={
              active
                ? 'flex items-center gap-1 rounded-full bg-white px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-black'
                : 'flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-white/70 transition-colors hover:text-white'
            }
          >
            <IconCmp size={13} weight={active ? 'fill' : 'regular'} />
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export interface HudBus {
  emit: (info: CameraHudInfo) => void
  subscribe: (fn: (info: CameraHudInfo) => void) => () => void
}

/** Tiny pub/sub so the per-frame camera rig can update the HUD without re-rendering the scene. */
export function createHudBus(): HudBus {
  const subs = new Set<(info: CameraHudInfo) => void>()
  let last: CameraHudInfo | null = null
  return {
    emit(info) {
      last = info
      subs.forEach((fn) => fn(info))
    },
    subscribe(fn) {
      subs.add(fn)
      if (last) fn(last)
      return () => {
        subs.delete(fn)
      }
    },
  }
}

/** Broadcast-style caption: shot type, the car on screen, its speed and why it's on screen. */
export function CameraHud({ bus }: { bus: HudBus }) {
  const [info, setInfo] = useState<CameraHudInfo | null>(null)
  useEffect(() => bus.subscribe(setInfo), [bus])
  if (!info || info.driverNumber == null || !info.shot) return null
  return (
    <div className="pointer-events-none flex flex-col items-start gap-1">
      <span className="bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white/70">
        {info.mode === 'auto' ? 'Auto · ' : ''}
        {SHOT_LABEL[info.shot]}
      </span>
      <div className="flex items-stretch overflow-hidden bg-black/70">
        <span className="w-1" style={{ background: info.teamColour }} />
        <span className="px-2 py-1 font-mono text-xs font-bold tracking-wider text-white">{info.abbreviation}</span>
        <span className="border-l border-white/10 px-2 py-1 font-mono text-xs tabular-nums text-white/90">
          {Math.round(info.speedKmh)}
          <span className="ml-0.5 text-[9px] text-white/50">km/h</span>
        </span>
      </div>
      {(info.reason || info.partner) && (
        <span className="bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white/60">
          {info.reason}
          {info.partner ? ` · vs ${info.partner}` : ''}
        </span>
      )}
    </div>
  )
}
