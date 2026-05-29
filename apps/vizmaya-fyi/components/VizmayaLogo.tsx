'use client'

import { useEffect } from 'react'
import {
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceColor,
  useViewModelInstanceString,
} from '@rive-app/react-canvas'

export interface VizmayaLogoPalette {
  text?: string
  teal?: string
  accent?: string
  accent2?: string
  surface?: string
  muted?: string
  line?: string
}

interface VizmayaLogoProps {
  className?: string
  palette?: VizmayaLogoPalette
  /**
   * Overrides the logo's themeable prefix segment — the "Viz" in "Vizmaya".
   * Bound to the `logoPreString` String view-model property in
   * `vizmaya-logo.riv` (default "Viz"); pass "Biz" to render "Bizmaya".
   * Omit (undefined) to keep the asset default.
   */
  wordmarkPrefix?: string
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '')
  if (m.length !== 3 && m.length !== 6) return null
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export default function VizmayaLogo({ className, palette, wordmarkPrefix }: VizmayaLogoProps) {
  const { rive, RiveComponent } = useRive({
    src: '/vizmaya-logo.riv',
    autoplay: true,
  })

  const viewModel = useViewModel(rive, { useDefault: true })
  const instance = useViewModelInstance(viewModel, { rive })
  const text = useViewModelInstanceColor('textColor', instance)
  const teal = useViewModelInstanceColor('tealColor', instance)
  const accent = useViewModelInstanceColor('accentColor', instance)
  const accent2 = useViewModelInstanceColor('accent2Color', instance)
  const surface = useViewModelInstanceColor('surfaceColor', instance)
  const muted = useViewModelInstanceColor('mutedColor', instance)
  const line = useViewModelInstanceColor('lineColor', instance)
  const preString = useViewModelInstanceString('logoPreString', instance)

  useEffect(() => {
    if (!palette) return
    const apply = (
      hex: string | undefined,
      target: { setRgba?: (r: number, g: number, b: number, a: number) => void } | null,
    ) => {
      if (!hex || !target?.setRgba) return
      const rgb = parseHex(hex)
      if (!rgb) return
      target.setRgba(rgb.r, rgb.g, rgb.b, 255)
    }
    apply(palette.text, text)
    apply(palette.teal, teal)
    apply(palette.accent, accent)
    apply(palette.accent2, accent2)
    apply(palette.surface, surface)
    apply(palette.muted, muted)
    apply(palette.line, line)
  }, [palette, text, teal, accent, accent2, surface, muted, line])

  useEffect(() => {
    if (wordmarkPrefix === undefined) return
    preString?.setValue?.(wordmarkPrefix)
  }, [wordmarkPrefix, preString])

  // TEMP DIAGNOSTIC — remove once the prefix swap is confirmed working.
  // Reads as `[VizmayaLogo diag]` in the browser console on every render.
  useEffect(() => {
    let vmProps: unknown
    try {
      vmProps = (viewModel as { properties?: unknown })?.properties ?? '(none)'
    } catch (e) {
      vmProps = `(error: ${String(e)})`
    }
    // eslint-disable-next-line no-console
    console.log('[VizmayaLogo diag]', {
      wordmarkPrefix, // undefined on non-deck; should be "Biz" on a deck story
      hasInstance: !!instance, // false => view-model instance never resolved
      preStringValue: preString?.value, // null => `.riv` lacks `logoPreString`
      vmProps, // the View Model's actual property list (names + types)
    })
  }, [wordmarkPrefix, instance, preString, preString?.value, viewModel])

  return (
    <div className={className}>
      <RiveComponent style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
