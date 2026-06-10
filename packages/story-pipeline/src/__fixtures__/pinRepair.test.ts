/** Throwaway check: pin-shape repair in genSchema (run: npx tsx src/__fixtures__/pinRepair.test.ts) */
import { zodToJsonSchema } from 'zod-to-json-schema'
import { sectionBodySchema, normalizeSectionBody } from '../vizEngine'

const cases: Array<{ name: string; pins: unknown[] }> = [
  { name: 'lng/lat keys', pins: [{ lng: 76.5, lat: 24.1, label: 'A' }] },
  { name: 'coordinates object', pins: [{ coordinates: { lng: 72.6, lat: 23.0 }, label: 'B' }] },
  { name: 'string coords', pins: [{ coordinates: ['77.2', '28.6'], label: 'C' }] },
  { name: 'longitude/latitude keys', pins: [{ longitude: 80.2, latitude: 13.0, label: 'D', pulse: true }] },
  { name: 'canonical (unchanged)', pins: [{ coordinates: [69.7, 22.7], label: 'E' }] },
]
for (const c of cases) {
  const r = sectionBodySchema.safeParse({ map: { center: [76.5, 24], zoom: 5, pins: c.pins } })
  const pin = r.success ? (r.data as { map: { pins: Array<{ coordinates: number[]; label?: string }> } }).map.pins[0] : null
  console.log(
    c.name.padEnd(26),
    r.success && pin
      ? `→ coordinates=${JSON.stringify(pin.coordinates)} label=${pin.label}`
      : `✗ ${r.success ? 'no pin' : r.error.issues[0]!.message}`,
  )
}

const bad = sectionBodySchema.safeParse({ map: { center: [0, 0], zoom: 1, pins: [{ label: 'no coords' }] } })
console.log('missing coords still fails  ', bad.success ? '✗ PASSED (bad!)' : '✓ rejected')

// Color tokens are ENFORCED: bare names repair to $-form; hex/unknowns DROP to
// the theme default (undefined) — they never reach the page.
const colorCases: Array<{ in: string; want: string | undefined }> = [
  { in: 'accent', want: '$accent' },
  { in: '$teal', want: '$teal' },
  { in: '#ff0000', want: undefined },
  { in: 'hotpink', want: undefined },
]
for (const c of colorCases) {
  const r = sectionBodySchema.safeParse({
    map: { center: [0, 0], zoom: 1, pins: [{ coordinates: [1, 2], color: c.in }] },
  })
  const got = r.success
    ? (r.data as { map: { pins: Array<{ color?: string }> } }).map.pins[0]!.color
    : '(parse failed)'
  console.log(`pin color ${c.in.padEnd(10)}`, got === c.want ? `✓ → ${got ?? '(default)'}` : `✗ got ${got}, want ${c.want}`)
}

// Region item color repairs the same way; a ramp with an unrepairable stop
// drops whole so `colors` never falls out of step with `ramp`.
const region = sectionBodySchema.safeParse({
  map: {
    center: [0, 0],
    zoom: 1,
    regions: {
      level: 'country',
      items: [{ code: 'IN', color: 'accent2' }],
      colors: ['surface', 'teal', '#123456'],
      lineColor: 'background',
    },
  },
})
if (!region.success) {
  console.log('region layer               ✗ parse failed:', region.error.issues[0]!.message)
} else {
  const layer = (region.data as {
    map: { regions: { items: Array<{ color?: string }>; colors?: string[]; lineColor?: string } }
  }).map.regions
  console.log('region item color accent2  ', layer.items[0]!.color === '$accent2' ? '✓ → $accent2' : `✗ got ${layer.items[0]!.color}`)
  console.log('ramp w/ hex stop drops     ', layer.colors === undefined ? '✓ → (engine default)' : `✗ got ${JSON.stringify(layer.colors)}`)
  console.log('lineColor background       ', layer.lineColor === '$background' ? '✓ → $background' : `✗ got ${layer.lineColor}`)
}

// Editorial cover surface: layout/eyebrow/dek validate and pass through
// normalizeSectionBody onto the section entry (section-root, not foreground).
const cover = sectionBodySchema.safeParse({
  layout: 'hero-full-bleed',
  eyebrow: 'SpaceX S-1 · May 20, 2026 · $1.75 Trillion IPO Analysis',
  dek: "Three companies inside one stock — and only one makes money.",
})
if (!cover.success) {
  console.log('cover surface              ✗ parse failed:', cover.error.issues[0]!.message)
} else {
  const norm = normalizeSectionBody(cover.data) as Record<string, unknown>
  const ok = norm.layout === 'hero-full-bleed' && !!norm.eyebrow && !!norm.dek && !('foreground' in norm)
  console.log('cover surface              ', ok ? '✓ layout/eyebrow/dek pass through' : `✗ got ${JSON.stringify(norm)}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const js = zodToJsonSchema(sectionBodySchema as any, { $refStrategy: 'none' }) as any
const pinSchema = js.properties.map.properties.pins.items
console.log('advertised pin schema       ', JSON.stringify({ required: pinSchema.required, coords: pinSchema.properties.coordinates }))
