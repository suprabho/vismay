'use client'

import { useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  Alignment,
  Fit,
  Layout,
  useRive,
  useStateMachineInput,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceBoolean,
  useViewModelInstanceColor,
  useViewModelInstanceNumber,
  useViewModelInstanceString,
} from '@rive-app/react-canvas'
import type { Rive, ViewModelInstance } from '@rive-app/canvas'
import { resolveAssetUrl } from '@/lib/assetUrl'
import type { VizCaptureHandle, VizRenderProps } from '../../types'
import type {
  RiveBindingValue,
  RiveLayerConfig,
  RiveLayoutAlignment,
  RiveLayoutFit,
} from './index'

/* ─── Layout enum mapping ──────────────────────────────────────── */

const FIT_MAP: Record<RiveLayoutFit, Fit> = {
  cover: Fit.Cover,
  contain: Fit.Contain,
  fill: Fit.Fill,
  fitWidth: Fit.FitWidth,
  fitHeight: Fit.FitHeight,
  scaleDown: Fit.ScaleDown,
  none: Fit.None,
}

const ALIGN_MAP: Record<RiveLayoutAlignment, Alignment> = {
  center: Alignment.Center,
  topLeft: Alignment.TopLeft,
  topCenter: Alignment.TopCenter,
  topRight: Alignment.TopRight,
  centerLeft: Alignment.CenterLeft,
  centerRight: Alignment.CenterRight,
  bottomLeft: Alignment.BottomLeft,
  bottomCenter: Alignment.BottomCenter,
  bottomRight: Alignment.BottomRight,
}

/* ─── Binding sub-components ───────────────────────────────────── */
// Each binding name gets its own sub-component that owns its hook call. The
// parent renders one child per binding entry. This is the only way to keep
// the rules of hooks honest while supporting arbitrary YAML-declared bindings.

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '')
  if (m.length !== 3 && m.length !== 6) return null
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function ColorBinding({
  path,
  value,
  instance,
}: {
  path: string
  value: string
  instance: ViewModelInstance | null
}) {
  const target = useViewModelInstanceColor(path, instance)
  useEffect(() => {
    if (!target?.setRgba) return
    const rgb = parseHex(value)
    if (!rgb) return
    target.setRgba(rgb.r, rgb.g, rgb.b, 255)
  }, [target, value])
  return null
}

function NumberBinding({
  path,
  value,
  instance,
}: {
  path: string
  value: number
  instance: ViewModelInstance | null
}) {
  const target = useViewModelInstanceNumber(path, instance)
  useEffect(() => {
    if (!target?.setValue) return
    target.setValue(value)
  }, [target, value])
  return null
}

function BooleanBinding({
  path,
  value,
  instance,
}: {
  path: string
  value: boolean
  instance: ViewModelInstance | null
}) {
  const target = useViewModelInstanceBoolean(path, instance)
  useEffect(() => {
    if (!target?.setValue) return
    target.setValue(value)
  }, [target, value])
  return null
}

function StringBinding({
  path,
  value,
  instance,
}: {
  path: string
  value: string
  instance: ViewModelInstance | null
}) {
  const target = useViewModelInstanceString(path, instance)
  useEffect(() => {
    if (!target?.setValue) return
    target.setValue(value)
  }, [target, value])
  return null
}

function pickBindingKind(value: RiveBindingValue): 'color' | 'number' | 'boolean' | 'string' {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && (value.startsWith('#') || /^[0-9a-f]{6}$/i.test(value))) return 'color'
  return 'string'
}

function ViewModelBindings({
  bindings,
  instance,
}: {
  bindings: Record<string, RiveBindingValue> | undefined
  instance: ViewModelInstance | null
}) {
  // Stable key order: sort by name so the React reconciler renders the
  // sub-components in a deterministic sequence across renders. This is
  // required for the rules-of-hooks contract since each sub-component
  // owns its own hook call.
  const entries = useMemo(() => {
    if (!bindings) return [] as Array<[string, RiveBindingValue]>
    return Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b))
  }, [bindings])
  return (
    <>
      {entries.map(([path, value]) => {
        const kind = pickBindingKind(value)
        if (kind === 'color') {
          return <ColorBinding key={path} path={path} value={value as string} instance={instance} />
        }
        if (kind === 'number') {
          return <NumberBinding key={path} path={path} value={value as number} instance={instance} />
        }
        if (kind === 'boolean') {
          return <BooleanBinding key={path} path={path} value={value as boolean} instance={instance} />
        }
        return <StringBinding key={path} path={path} value={value as string} instance={instance} />
      })}
    </>
  )
}

/* ─── Step input driver ────────────────────────────────────────── */

function StepInputDriver({
  rive,
  stateMachine,
  activeStep,
  config,
}: {
  rive: Rive | null
  stateMachine: string | undefined
  activeStep: number
  config: NonNullable<RiveLayerConfig['stepInput']>
}) {
  const input = useStateMachineInput(rive, stateMachine, config.name)
  useEffect(() => {
    if (!input) return
    if (config.map === 'trigger') {
      input.fire?.()
      return
    }
    if (config.map === 'linear') {
      const total = Math.max(1, (config.totalSteps ?? 1) - 1)
      const v = activeStep / total
      input.value = v
      return
    }
    // stepwise
    const v = config.values?.[Math.max(0, Math.min((config.values?.length ?? 1) - 1, activeStep))]
    if (v != null) input.value = v
  }, [input, activeStep, config])
  return null
}

/* ─── Main component ───────────────────────────────────────────── */

export default function RiveLayerComponent({
  config,
  activeStep,
  mode,
  noteReady,
  captureRef,
}: VizRenderProps<RiveLayerConfig>) {
  const src = resolveAssetUrl(config.src)
  const posterUrl = config.posterImage ? resolveAssetUrl(config.posterImage) : undefined
  const isCapture = mode === 'capture' || mode === 'print'
  const usePosterFallback = isCapture && config.capture?.mode === 'posterImage' && !!posterUrl

  const layout = useMemo(
    () =>
      new Layout({
        fit: FIT_MAP[config.layout?.fit ?? 'contain'],
        alignment: ALIGN_MAP[config.layout?.alignment ?? 'center'],
      }),
    [config.layout?.fit, config.layout?.alignment]
  )

  const stateMachines = config.stateMachine ? [config.stateMachine] : undefined
  // Capture/print: never autoplay; the freeze hook decides what frame lands.
  const wantsAutoplay = !isCapture && (config.autoplay ?? true)

  const { rive, RiveComponent } = useRive({
    src,
    artboard: config.artboard,
    stateMachines,
    layout,
    autoplay: wantsAutoplay,
    onLoad: () => noteReady(),
  })

  const viewModel = useViewModel(rive, { useDefault: true })
  const instance = useViewModelInstance(viewModel, { rive })

  useImperativeHandle<VizCaptureHandle | null, VizCaptureHandle>(
    captureRef ?? { current: null },
    () => ({
      freeze: async () => {
        if (!rive) return
        const captureCfg = config.capture
        const captureMode = captureCfg?.mode ?? 'currentFrame'
        try {
          if (captureMode === 'advanceMs') {
            const ms = captureCfg?.advanceMs ?? 500
            rive.play()
            await new Promise((r) => setTimeout(r, ms))
            rive.pause()
            return
          }
          if (captureMode === 'stateMachineInput') {
            const sm = captureCfg?.stateMachineInput
            if (sm && config.stateMachine) {
              const inputs = rive.stateMachineInputs(config.stateMachine) ?? []
              const target = inputs.find((i) => i.name === sm.name)
              if (target) {
                if (sm.type === 'trigger') target.fire?.()
                else if (sm.value !== undefined) target.value = sm.value
              }
            }
            rive.pause()
            // One animation frame so the state-machine write reaches the
            // next render pass before we capture.
            await new Promise<void>((r) => requestAnimationFrame(() => r()))
            return
          }
          // currentFrame (default)
          rive.pause()
          await new Promise<void>((r) => requestAnimationFrame(() => r()))
        } catch {
          /* noop — best-effort */
        }
      },
      resume: () => {
        if (!rive || !wantsAutoplay) return
        rive.play()
      },
    }),
    [rive, config.capture, config.stateMachine, wantsAutoplay]
  )

  const wrapperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    background: config.background,
    position: 'relative',
  }

  // Capture/posterImage path: hooks above all ran (rules-of-hooks happy);
  // we just render the still image instead of the Rive canvas. The Rive
  // instance still loads in the background but nothing paints from it.
  if (usePosterFallback) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={posterUrl}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onLoad={() => noteReady()}
        draggable={false}
      />
    )
  }

  return (
    <div style={wrapperStyle}>
      <RiveComponent style={{ width: '100%', height: '100%' }} />
      <ViewModelBindings bindings={config.viewModel?.bindings} instance={instance} />
      {config.stepInput && (
        <StepInputDriver
          rive={rive}
          stateMachine={config.stateMachine}
          activeStep={activeStep}
          config={config.stepInput}
        />
      )}
    </div>
  )
}
