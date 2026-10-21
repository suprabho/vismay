/**
 * Colour maths for club marks: sRGB ↔ OKLab and CIELAB (D65), CIEDE2000, WCAG 2.1
 * relative luminance and contrast. Client-safe, no dependencies.
 */

export type Rgb = [number, number, number]
export type Lab = [number, number, number]

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const LINEAR = Array.from({ length: 256 }, (_, i) => toLinear(i))

export function parseHex(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex colour: ${hex}`)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

/** Björn Ottosson's OKLab from 8-bit sRGB. */
export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[Math.round(r)]!, lg = LINEAR[Math.round(g)]!, lb = LINEAR[Math.round(b)]!
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map(v => {
    const c = Math.min(1, Math.max(0, v))
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
  }) as Rgb
}

export const hexToOklab = (hex: string): Lab => rgbToOklab(...parseHex(hex))

export function deltaEOK(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** OKLCH chroma: below ~0.04 a colour reads as neutral (black, white, grey). */
export const chroma = ([, a, b]: Lab) => Math.hypot(a, b)

/** WCAG 2.1 relative luminance of an 8-bit sRGB colour. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[Math.round(r)]! + 0.7152 * LINEAR[Math.round(g)]! + 0.0722 * LINEAR[Math.round(b)]!
}

export function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export function contrastHex(a: string, b: string): number {
  return contrastRatio(luminance(...parseHex(a)), luminance(...parseHex(b)))
}

/** CSS `cmyk(C% M% Y% K%)` → 8-bit sRGB, the uncalibrated device conversion. */
export function cmykToRgb(cmyk: string): Rgb {
  const m = cmyk.match(/^cmyk\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i)
  if (!m) throw new Error(`Not a cmyk() colour: ${cmyk}`)
  const [c, mg, y, k] = m.slice(1).map(v => Number(v) / 100) as [number, number, number, number]
  return [255 * (1 - c) * (1 - k), 255 * (1 - mg) * (1 - k), 255 * (1 - y) * (1 - k)].map(Math.round) as Rgb
}

// ── CIELAB (D65) ───────────────────────────────────────────────────────────

const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
const labFInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[Math.round(r)]!, lg = LINEAR[Math.round(g)]!, lb = LINEAR[Math.round(b)]!
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883
  return [116 * labF(y) - 16, 500 * (labF(x) - labF(y)), 200 * (labF(y) - labF(z))]
}

function labToRgbUnclamped([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const x = labFInv(fx) * 0.95047, y = labFInv(fy), z = labFInv(fz) * 1.08883
  const lin = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ]
  return lin.map(v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)) as [number, number, number]
}

export const hexToLab = (hex: string): Lab => rgbToLab(...parseHex(hex))
/** CIE L* (0–100): what a colour reads as in grayscale print. */
export const lightness = (hex: string) => hexToLab(hex)[0]

/** CIEDE2000 colour difference. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const h = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360)
  const h1p = h(b1, a1p), h2p = h(b2, a2p)
  const dLp = L2 - L1, dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad)
  const Lmp = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2
  let hmp = h1p + h2p
  if (C1p * C2p !== 0) hmp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  const T = 1 - 0.17 * Math.cos((hmp - 30) * rad) + 0.24 * Math.cos(2 * hmp * rad) + 0.32 * Math.cos((3 * hmp + 6) * rad) - 0.2 * Math.cos((4 * hmp - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2)
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

/**
 * The colour at lightness L* along its own hue (CIE LCh), chroma reduced only as
 * far as needed to stay inside sRGB.
 */
export function withLightness(hex: string, L: number): string {
  const [, a, b] = hexToLab(hex)
  const target = Math.min(100, Math.max(0, L))
  for (let k = 1; k >= 0; k -= 0.02) {
    const rgb = labToRgbUnclamped([target, a * k, b * k])
    if (rgb.every(v => v >= -0.5 && v <= 255.5)) return toHex(rgb)
  }
  return toHex(labToRgbUnclamped([target, 0, 0]))
}
