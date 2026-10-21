import source from './palette.cmyk.json'
import { cmykToRgb, deltaE2000, hexToLab, parseHex, toHex, type Lab } from './color'
import type { PrintSwatch } from './types'

/**
 * The project print palette (palette.cmyk.json, color-palette.json as supplied:
 * CMYK) and its sRGB previews. Kit colours snap to the nearest swatch here
 * (CIEDE2000); the CMYK string is what goes to print.
 */

export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type RampStep = (typeof RAMP_STEPS)[number]

type Source = Record<string, string | Record<string, string>>
const toCssHex = (v: string) => toHex(v.startsWith('cmyk(') ? cmykToRgb(v) : parseHex(v))

/** Every swatch: `red-600`, …, plus `black` and `white`. */
export const PRINT_SWATCHES: { token: string; cmyk: string; hex: string; lab: Lab }[] = Object.entries(source as Source).flatMap(([family, v]) => {
  if (typeof v === 'string') {
    const cmyk = family === 'black' ? 'cmyk(0% 0% 0% 100%)' : 'cmyk(0% 0% 0% 0%)'
    return [{ token: family, cmyk, hex: toCssHex(v), lab: hexToLab(toCssHex(v)) }]
  }
  return RAMP_STEPS.map(step => {
    const cmyk = v[String(step)]!
    const hex = toCssHex(cmyk)
    return { token: `${family}-${step}`, cmyk, hex, lab: hexToLab(hex) }
  })
})

export function paletteColor(token: string): string {
  const s = PRINT_SWATCHES.find(x => x.token === token)
  if (!s) throw new Error(`Not a palette token: ${token}`)
  return s.hex
}

const hueAngle = ([, a, b]: Lab) => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
const hueGap = (x: Lab, y: Lab) => { const d = Math.abs(hueAngle(x) - hueAngle(y)); return Math.min(d, 360 - d) }

/**
 * The swatch nearest a colour (CIEDE2000), with the distance. Near-ties (within
 * 1 ΔE) of a chromatic colour go to the closer hue, so an over-saturated kit red lands on red, not orange.
 */
export function nearestPrintSwatch(hex: string): PrintSwatch {
  const lab = hexToLab(hex)
  const scored = PRINT_SWATCHES.map(s => ({ s, d: deltaE2000(lab, s.lab) })).sort((a, b) => a.d - b.d)
  const chromatic = Math.hypot(lab[1], lab[2]) > 15
  const best = chromatic
    ? scored.filter(x => x.d <= scored[0]!.d + 1).sort((a, b) => hueGap(lab, a.s.lab) - hueGap(lab, b.s.lab) || a.d - b.d)[0]!
    : scored[0]!
  return { token: best.s.token, hex: best.s.hex, cmyk: best.s.cmyk, deltaE: Math.round(best.d * 10) / 10 }
}

/** The swatches of a token's family (e.g. every `red-*`), light to dark; black and white stand alone. */
export function rampOf(token: string): typeof PRINT_SWATCHES {
  const family = token.replace(/-\d+$/, '')
  return PRINT_SWATCHES.filter(s => s.token === token || s.token.startsWith(`${family}-`))
}
