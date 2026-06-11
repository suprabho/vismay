import type { SectionGeo } from './types'

/**
 * Deterministic completion of a MAP story's hero — the establishing shot.
 *
 * The deck cover taught the lesson (see cover.ts): camera dressing the
 * exemplars rely on is exactly what a model skips, so the hero shape is
 * guaranteed in code rather than prompted for. The target is the hand-built
 * kashmir opener:
 *
 *   - id: hero
 *     kind: hero
 *     eyebrow: "Jammu & Kashmir · 1941–1951 · Census + Land Reform"
 *     map:
 *       center: [76.0, 34.4]
 *       zoom: 5.6
 *       pitch: 15          ← slight tilt, never flat top-down
 *       opacity: 0.45      ← dimmed so the title card reads over the map
 *       pins:
 *         - coordinates: [74.797, 34.083]
 *           label: "Srinagar"
 *           pulse: true    ← ONE pulsing anchor pin
 *
 * The eyebrow is the model's (required by the map visual schema); everything
 * else here is derived: camera fallback from the planned `geo`, pitch and
 * opacity clamped into the establishing-shot band, a pulsing focal pin
 * (synthesised from the geo focus when the model marked none), and no
 * foreground — the title and dek render from the heading and prose.
 * Idempotent — safe to apply at visual and materialise time.
 */

/** Default camera tilt when the model leaves the hero flat. */
const HERO_PITCH = 15
/** The opacity band that keeps the title card readable over the map. */
const HERO_OPACITY_MIN = 0.45
const HERO_OPACITY_MAX = 0.6

export function completeMapHero(
  body: Record<string, unknown>,
  opts: { geo?: SectionGeo } = {},
): Record<string, unknown> {
  const map: Record<string, unknown> =
    body.map && typeof body.map === 'object' && !Array.isArray(body.map)
      ? { ...(body.map as Record<string, unknown>) }
      : {}

  // Camera fallback: anchor to the outline's planned geography.
  if (map.center == null && opts.geo?.center) map.center = opts.geo.center
  if (map.zoom == null && opts.geo?.zoom != null) map.zoom = opts.geo.zoom

  // Slight tilt — a 0/absent pitch is the flat deck-cover look.
  const pitch = typeof map.pitch === 'number' ? map.pitch : 0
  if (pitch <= 0) map.pitch = HERO_PITCH

  // Dim the basemap so the title card reads over it.
  const opacity = typeof map.opacity === 'number' ? map.opacity : NaN
  map.opacity = Number.isFinite(opacity)
    ? Math.min(HERO_OPACITY_MAX, Math.max(HERO_OPACITY_MIN, opacity))
    : HERO_OPACITY_MIN

  // One pulsing anchor pin. Prefer the model's pins (pulse the first if it
  // pulsed none); synthesise from the planned geo only when it marked nothing.
  const pins = Array.isArray(map.pins)
    ? map.pins.map((p) => (p && typeof p === 'object' ? { ...(p as Record<string, unknown>) } : p))
    : []
  if (pins.length > 0) {
    const hasPulse = pins.some(
      (p) => p && typeof p === 'object' && (p as Record<string, unknown>).pulse === true,
    )
    if (!hasPulse && pins[0] && typeof pins[0] === 'object') {
      ;(pins[0] as Record<string, unknown>).pulse = true
    }
  } else if (opts.geo?.center && opts.geo.focus) {
    pins.push({ coordinates: opts.geo.center, label: opts.geo.focus, pulse: true })
  }
  if (pins.length > 0) map.pins = pins

  // The title and dek come from the heading and prose — never a foreground.
  const { foreground: _drop, ...rest } = body
  return { ...rest, map }
}

/**
 * The prose half of the hero contract: the hero's markdown block is the title
 * anchor plus ONE standfirst paragraph wrapped in `*…*` — the italic-dek
 * convention `extractHeroBits` (story-reader's MapStorySection) renders below
 * the title. The content prompt asks for exactly that; this guarantees the
 * marker when the model writes a plain paragraph. Idempotent.
 */
export function completeMapHeroProse(paragraphs: string[]): string[] {
  const trimmed = paragraphs.map((p) => p.trim()).filter(Boolean)
  // Already carries an italic dek line (`*…` but not `**bold…`) — leave as-is.
  if (trimmed.some((p) => /^\*[^*]/.test(p))) return trimmed
  const at = trimmed.findIndex((p) => !p.startsWith('**'))
  if (at === -1) return trimmed
  return trimmed.map((p, i) => (i === at ? `*${p.replace(/^\*+|\*+$/g, '')}*` : p))
}
