/**
 * Colour schemes generated from the Vizmaya logo: the three dots of the
 * Penrose mark (teal, pink, blue). Everything else (backgrounds, surfaces,
 * text, lines, the book's paper, tint ramps) is derived from them in OKLCH,
 * so every neutral carries a trace of a logo hue and every accent is a logo
 * colour lifted just enough to read on the dark ground.
 *
 * One scheme leads with each dot (teal, pink, blue), and a fourth, Penrose,
 * keeps the pink lead on the blue's ground. The home page gives each binding
 * its own: Book teal, Board pink, Deck blue, Scroll Penrose
 * (HOME_SCHEMES in ./homeShape). Pure, so the client can import it.
 */

/** The logo's own colours (the Penrose mark), exactly as drawn. */
export const LOGO = { teal: '#0BBFAB', pink: '#E84D7A', blue: '#2B4ACF' } as const
export type LogoHue = keyof typeof LOGO

export interface Scheme {
  name: string
  /** Page ground, a deep tint of the ground hue. */
  bg: string
  surface: string
  surface2: string
  text: string
  muted: string
  dim: string
  line: string
  line2: string
  /** The lead: one logo colour, lifted to read on bg. */
  signal: string
  /** The other two logo colours, lifted the same way. */
  second: string
  third: string
  /** Text set on the signal colour. */
  onSignal: string
  /** The lead deepened to read on the paper (links and italics on light pages). */
  inkSignal: string
  /** Each logo colour, lifted to read on bg (whatever its place in the scheme). */
  logo: Record<LogoHue, string>
  /** The book's pages, their ink and their quiet ink. */
  paper: string
  /** A shade under the paper (endpapers, tiles on a page) and a card above it. */
  paper2: string
  card: string
  paperInk: string
  paperMuted: string
  /**
   * Light tints for the board's sticky notes: the three logo colours, and a
   * gold from the hue halfway between the pink and the teal.
   */
  tints: [string, string, string, string]
}

// ── OKLCH ↔ sRGB ──────────────────────────────────────────────────────────

type Lch = { l: number; c: number; h: number }

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

export function hexToOklch(hex: string): Lch {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToLinear({ l, c, h }: Lch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

/** OKLCH to hex, pulling chroma in until the colour fits sRGB (hue and lightness kept). */
export function oklchToHex(lch: Lch): string {
  let c = lch.c
  for (let i = 0; i < 40; i++) {
    const rgb = oklchToLinear({ ...lch, c })
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(rgb.map(toGamma) as [number, number, number])
    c *= 0.93
  }
  return rgbToHex(oklchToLinear({ ...lch, c: 0 }).map(toGamma) as [number, number, number])
}

const tone = (hue: LogoHue | number, l: number, c: number) =>
  oklchToHex({ l, c, h: typeof hue === 'number' ? hue : hexToOklch(LOGO[hue]).h })

// ── contrast ──────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** A logo colour lightened (hue and as much chroma as fits kept) until it reaches `min` contrast on `ground`. */
function liftOn(color: string, ground: string, min: number): string {
  const lch = hexToOklch(color)
  let out = color
  for (let l = lch.l; l <= 0.96 && contrast(out, ground) < min; l += 0.01) out = oklchToHex({ ...lch, l })
  return out
}

/** The same, darkening instead, for a light ground. */
function dropOn(color: string, ground: string, min: number): string {
  const lch = hexToOklch(color)
  let out = color
  for (let l = lch.l; l >= 0.2 && contrast(out, ground) < min; l -= 0.01) out = oklchToHex({ ...lch, l })
  return out
}

const alpha = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255))
  return `rgba(${r},${g},${b},${a})`
}

// ── schemes ───────────────────────────────────────────────────────────────

/**
 * A scheme led by one logo colour on a ground tinted by another (by default
 * the same). Neutrals are the ground hue at very low chroma; the accents are
 * the logo colours lifted to 4.5:1 on the ground; the paper is a warm off-white
 * with a breath of the ground hue.
 */
export function logoScheme(name: string, lead: LogoHue, ground: LogoHue = lead): Scheme {
  const order: LogoHue[] = ['teal', 'pink', 'blue']
  const [second, third] = order.filter((h) => h !== lead)
  const bg = tone(ground, 0.16, 0.03)
  const text = tone(ground, 0.95, 0.012)
  const logo = Object.fromEntries(order.map((h) => [h, liftOn(LOGO[h], bg, 4.5)])) as Record<LogoHue, string>
  const signal = logo[lead]
  // Halfway round the wheel from the pink to the teal, through the warm side.
  const gold = (hexToOklch(LOGO.pink).h + hexToOklch(LOGO.teal).h) / 2
  // The darkest light ground the ink sits on, so it reads on all of them.
  const paper2 = oklchToHex({ l: 0.915, c: 0.016, h: 85 })
  return {
    name,
    bg,
    surface: tone(ground, 0.2, 0.035),
    surface2: tone(ground, 0.245, 0.04),
    text,
    muted: tone(ground, 0.76, 0.02),
    dim: tone(ground, 0.6, 0.022),
    line: alpha(text, 0.1),
    line2: alpha(text, 0.2),
    signal,
    second: logo[second],
    third: logo[third],
    onSignal: contrast(signal, bg) >= contrast(signal, text) ? bg : text,
    inkSignal: dropOn(LOGO[lead], paper2, 4.5),
    logo,
    paper: oklchToHex({ l: 0.955, c: 0.012, h: 85 }),
    paper2,
    card: oklchToHex({ l: 0.975, c: 0.008, h: 85 }),
    paperInk: tone(ground, 0.21, 0.025),
    paperMuted: tone(ground, 0.5, 0.02),
    tints: [...order.map((h) => tone(h, 0.9, 0.06)), tone(gold, 0.9, 0.08)] as Scheme['tints'],
  }
}

/** A scheme as the CSS custom properties the page and the stages share. */
export function schemeVars(s: Scheme): Record<string, string> {
  return {
    '--bg': s.bg,
    '--surface': s.surface,
    '--surface2': s.surface2,
    '--text': s.text,
    '--muted': s.muted,
    '--dim': s.dim,
    '--line': s.line,
    '--line2': s.line2,
    '--signal': s.signal,
    '--second': s.second,
    '--third': s.third,
    '--on-signal': s.onSignal,
    '--teal': s.logo.teal,
    '--pink': s.logo.pink,
    '--blue': s.logo.blue,
    '--paper': s.paper,
    '--paper2': s.paper2,
    '--card': s.card,
    '--paper-ink': s.paperInk,
    '--paper-ink-2': `color-mix(in srgb,${s.paperInk} 80%,${s.paper})`,
    '--paper-muted': s.paperMuted,
    '--paper-line': `color-mix(in srgb,${s.paperInk} 15%,transparent)`,
    '--ink-signal': s.inkSignal,
  }
}

/**
 * A light-to-dark ramp of one logo colour, 50 to 900, at even OKLCH
 * lightness steps with the hue held (for charts, tags, anything that needs a
 * graded shade of the brand).
 */
export function logoRamp(hue: LogoHue): Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string> {
  const { c, h } = hexToOklch(LOGO[hue])
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
  const lights = [0.97, 0.93, 0.86, 0.78, 0.7, 0.62, 0.53, 0.44, 0.35, 0.26]
  // Chroma peaks mid-ramp and eases off at the ends, as the gamut does.
  return Object.fromEntries(steps.map((s, i) => [s, oklchToHex({ l: lights[i], c: c * Math.sin(Math.PI * (0.15 + 0.7 * (1 - Math.abs(lights[i] - 0.6) / 0.6))), h })])) as never
}
