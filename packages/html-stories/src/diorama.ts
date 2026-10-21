/**
 * The diorama format's data contract (formats/diorama.js reads it from the
 * page's <script type="application/json" class="diorama-data">) and its
 * checks: references between places, routes, beats and quantities, the
 * certainty of every place, and every `computed` quantity recomputed from
 * its derivation (haversine distances from the places' coordinates, route
 * lengths, sums, ratios, counts). The lint runs them on a posted page, so a
 * figure the agent forgot to recompute is caught before readers see it.
 *
 * Pure: no Supabase / Node imports.
 */

export const DIORAMA_CERTAINTIES = ['excavated', 'hinge', 'tradition', 'contested'] as const
export type DioramaCertainty = (typeof DIORAMA_CERTAINTIES)[number]

export const DIORAMA_BEAT_TYPES = ['cover', 'reveal', 'hinge', 'stepper', 'layers', 'interstitial', 'close-up', 'epilogue'] as const
export type DioramaBeatType = (typeof DIORAMA_BEAT_TYPES)[number]

export const DIORAMA_QUANTITY_STATUSES = ['sourced', 'computed', 'reconstructed', 'estimate'] as const

/**
 * Props the runtime draws. The data objects are every kind but line and ship
 * (a leader and a marker): the object vocabulary is ruler (dates), section
 * (finds by layer), trays (items × categories), grove (a share of 100), stack
 * (quantities at true scale), arc (flows), split (two accounts), lapse
 * (change across eras), and tower, ring and pulse for single values. A page
 * may register more with Story.props.<kind>.
 */
export const DIORAMA_PROP_KINDS = ['tower', 'ring', 'line', 'pulse', 'ship', 'ruler', 'section', 'trays', 'grove', 'stack', 'arc', 'split', 'lapse'] as const
export type DioramaPropKind = (typeof DIORAMA_PROP_KINDS)[number]
export const DIORAMA_OBJECT_KINDS: readonly DioramaPropKind[] = DIORAMA_PROP_KINDS.filter((k) => k !== 'line' && k !== 'ship')

export interface DioramaPlate {
  bbox: [[number, number], [number, number]]
  projection?: 'mercator' | 'conic-equal-area'
  land?: 'land-110m' | 'land-50m' | 'land-10m'
  size?: [number, number]
  caption?: string
  /** Real elevation, draped and shaded (on unless false); exaggeration overrides the automatic one. */
  relief?: boolean | { exaggeration?: number }
  /** Modern country borders drawn on the land (off by default: anachronistic for most history). */
  borders?: boolean
}
export interface DioramaPlace {
  id: string
  name: string
  lat: number
  lon: number
  certainty: DioramaCertainty
  note?: string
  proposedBy?: string[]
  /** Which side of the marker its label sits: l, r, t or b. */
  label?: 'l' | 'r' | 't' | 'b'
  sources: string[]
}
export interface DioramaRoute {
  id: string
  label: string
  by?: string
  style?: { color?: string; dash?: [number, number]; width?: number }
  /** Place ids, or [lon, lat] waypoints that only bend the line. */
  stops: (string | [number, number])[]
  /** Stops the proponent never named, filled from another reading: drawn hollow. */
  gapFilled?: string[]
  curve?: 'smooth' | 'straight'
}
export interface DioramaQuantity {
  id: string
  label: string
  value: number
  unit: string
  status: (typeof DIORAMA_QUANTITY_STATUSES)[number]
  derivation?: string
  sources?: string[]
  note?: string
}
export interface DioramaBeat {
  id: string
  type: DioramaBeatType
  plate?: string
  /** target: a place id, [lon, lat], or "props" (where the beat's objects stand). */
  camera?: { target?: string | [number, number]; zoom?: number; tilt?: number; azimuth?: number; spin?: boolean }
  layers?: {
    routes?: string[]
    on?: string[]
    labels?: string[]
    labelsSm?: string[]
    places?: string[]
    fog?: boolean | { west?: number; east?: number; labels?: { west?: string; east?: string }; caption?: string }
  }
  props?: Array<{ kind: DioramaPropKind | (string & {}); [k: string]: unknown }>
  stepper?: { route?: string; next?: string }
}
export interface DioramaStory {
  id: string
  title: string
  plate: DioramaPlate
  insets?: (DioramaPlate & { id: string })[]
  places: DioramaPlace[]
  routes: DioramaRoute[]
  quantities: DioramaQuantity[]
  beats: DioramaBeat[]
  sources: { id: string; title: string; url: string }[]
}

const KM_PER: Record<string, number> = { km: 1, nm: 1.852, mi: 1.609344, m: 0.001 }
const EARTH_KM = 6371.0088
/** A computed figure more than this far from its derivation is flagged (the brief's 10% rule is for research figures; computed ones should match). */
const TOLERANCE = 0.02

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180
  const d =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(d))
}

/** The <script class="diorama-data"> JSON in a page, parsed; an error message when it's missing or broken. */
export function extractDioramaStory(html: string): { story: DioramaStory | null; error: string | null } {
  const m = /<script\b[^>]*\bclass="[^"]*\bdiorama-data\b[^"]*"[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!m) return { story: null, error: 'No <script type="application/json" class="diorama-data">: a diorama reads its places, routes, quantities and beats from it.' }
  try {
    return { story: JSON.parse(m[1] ?? '') as DioramaStory, error: null }
  } catch (e) {
    return { story: null, error: `The diorama-data JSON doesn't parse: ${(e as Error).message}` }
  }
}

/**
 * What a derivation evaluates to, in the quantity's unit:
 *   haversine(a, b)        great-circle distance between two places
 *   route(a, b, c, …)      the sum of great-circle legs through places
 *   sum(q1, q2, …)         quantities added
 *   ratio(q1, q2)          q1 / q2 (share(q1, q2): as a percentage)
 *   stops(route)           a route's place stops
 *   count(x, y, …)         how many things are listed
 * Null when it can't be evaluated (the message says why).
 */
export function evaluateDerivation(
  derivation: string,
  unit: string,
  story: Pick<DioramaStory, 'places' | 'routes' | 'quantities'>,
): { value: number | null; error?: string } {
  const m = /^\s*([a-z]+)\s*\(([^)]*)\)\s*$/i.exec(derivation)
  if (!m) return { value: null, error: `"${derivation}" isn't a derivation (haversine, route, sum, ratio, share, stops or count)` }
  const fn = m[1]!.toLowerCase()
  const args = m[2]!.split(',').map((a) => a.trim()).filter(Boolean)
  const place = (id: string) => story.places.find((p) => p.id === id)
  const qty = (id: string) => story.quantities.find((q) => q.id === id)
  const distance = (ids: string[]) => {
    const pts = ids.map(place)
    const missing = ids.filter((_, i) => !pts[i])
    if (missing.length) return { value: null, error: `no place ${missing.map((x) => `"${x}"`).join(', ')}` }
    const per = KM_PER[unit.toLowerCase()]
    if (!per) return { value: null, error: `a distance needs a unit of km, nm or mi (got "${unit}")` }
    let km = 0
    for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1]!, pts[i]!)
    return { value: km / per }
  }
  const values = (ids: string[]) => {
    const qs = ids.map(qty)
    const missing = ids.filter((_, i) => !qs[i])
    return missing.length ? { error: `no quantity ${missing.map((x) => `"${x}"`).join(', ')}` } : { vals: qs.map((q) => +q!.value) }
  }
  switch (fn) {
    case 'haversine':
      if (args.length !== 2) return { value: null, error: 'haversine() takes two places' }
      return distance(args)
    case 'route':
      if (args.length < 2) return { value: null, error: 'route() takes two or more places' }
      return distance(args)
    case 'sum': {
      const v = values(args)
      return 'vals' in v ? { value: v.vals!.reduce((a, b) => a + b, 0) } : { value: null, error: v.error }
    }
    case 'ratio':
    case 'share': {
      if (args.length !== 2) return { value: null, error: `${fn}() takes two quantities` }
      const v = values(args)
      if (!('vals' in v)) return { value: null, error: v.error }
      const [a, b] = v.vals!
      if (!b) return { value: null, error: `${fn}() divides by zero` }
      return { value: (a! / b) * (fn === 'share' ? 100 : 1) }
    }
    case 'stops': {
      const r = story.routes.find((x) => x.id === args[0])
      return r ? { value: r.stops.filter((s) => typeof s === 'string').length } : { value: null, error: `no route "${args[0]}"` }
    }
    case 'count':
      return { value: args.length }
    default:
      return { value: null, error: `unknown derivation "${fn}"` }
  }
}

function close(value: number, computed: number): boolean {
  if (computed === 0) return value === 0
  // Rounded to the figure's own precision, or within the tolerance.
  const dec = (String(value).split('.')[1] ?? '').length
  return Math.abs(value - computed) <= 0.5 * 10 ** -dec + 1e-9 || Math.abs(value - computed) / Math.abs(computed) <= TOLERANCE
}

/** Every problem with the story JSON a reader (or the fact-check) would trip over. */
const BEAT_KEYS = new Set(['id', 'type', 'plate', 'camera', 'layers', 'props', 'stepper', 'copy'])
const LAYER_KEYS = new Set(['routes', 'on', 'labels', 'labelsSm', 'places', 'fog'])
const PLATE_KEYS = new Set(['id', 'bbox', 'projection', 'land', 'size', 'caption', 'relief', 'borders'])

export function checkDioramaStory(story: DioramaStory): string[] {
  const out: string[] = []
  const places = Array.isArray(story.places) ? story.places : []
  const routes = Array.isArray(story.routes) ? story.routes : []
  const quantities = Array.isArray(story.quantities) ? story.quantities : []
  const beats = Array.isArray(story.beats) ? story.beats : []
  const sources = Array.isArray(story.sources) ? story.sources : []
  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id))
  const placeIds = ids(places), routeIds = ids(routes), sourceIds = ids(sources)
  const plateIds = new Set(['main', ...(story.insets ?? []).map((p) => p.id)])

  if (!story.plate || !Array.isArray(story.plate.bbox)) out.push('plate.bbox is missing: [[west, south], [east, north]].')
  for (const plate of [story.plate, ...(story.insets ?? [])]) {
    for (const k of Object.keys(plate ?? {})) if (!PLATE_KEYS.has(k)) out.push(`A plate has "${k}", which the runtime doesn't read (${[...PLATE_KEYS].join(', ')}).`)
  }
  for (const p of places) {
    if (!(DIORAMA_CERTAINTIES as readonly string[]).includes(p.certainty)) {
      out.push(`Place "${p.id}" needs a certainty (${DIORAMA_CERTAINTIES.join(', ')}): its marker shows how sure anyone is.`)
    }
    if (!p.sources?.length) out.push(`Place "${p.id}" has no source.`)
    for (const s of p.sources ?? []) if (!sourceIds.has(s)) out.push(`Place "${p.id}" cites "${s}", which isn't in sources.`)
    if (!isFinite(+p.lat) || !isFinite(+p.lon)) out.push(`Place "${p.id}" has no lat/lon.`)
  }
  for (const r of routes) {
    for (const s of r.stops ?? []) if (typeof s === 'string' && !placeIds.has(s)) out.push(`Route "${r.id}" stops at "${s}", which isn't in places.`)
    for (const s of r.gapFilled ?? []) if (!(r.stops ?? []).includes(s)) out.push(`Route "${r.id}" gap-fills "${s}", which isn't one of its stops.`)
  }
  for (const q of quantities) {
    if (!(DIORAMA_QUANTITY_STATUSES as readonly string[]).includes(q.status)) {
      out.push(`Quantity "${q.id}" needs a status (${DIORAMA_QUANTITY_STATUSES.join(', ')}).`)
    }
    for (const s of q.sources ?? []) if (!sourceIds.has(s)) out.push(`Quantity "${q.id}" cites "${s}", which isn't in sources.`)
    if (q.status === 'computed') {
      if (!q.derivation) {
        out.push(`Quantity "${q.id}" is computed but has no derivation.`)
        continue
      }
      const r = evaluateDerivation(q.derivation, q.unit, { places, routes, quantities })
      if (r.value === null) out.push(`Quantity "${q.id}": ${r.error}.`)
      else if (!close(+q.value, r.value)) {
        out.push(`Quantity "${q.id}" says ${q.value} ${q.unit}, but ${q.derivation} gives ${+r.value.toFixed(2)} ${q.unit}: use the computed value.`)
      }
    } else if (q.status === 'sourced' || q.status === 'reconstructed') {
      if (!q.sources?.length) out.push(`Quantity "${q.id}" is ${q.status} but cites no source.`)
    } else if (q.status === 'estimate' && !q.note && !q.derivation) {
      out.push(`Quantity "${q.id}" is an estimate: say how it was reached in its note.`)
    }
  }
  if (beats.length < 6 || beats.length > 10) out.push(`A diorama has 6 to 10 beats (this one has ${beats.length}).`)
  for (const b of beats) {
    if (!(DIORAMA_BEAT_TYPES as readonly string[]).includes(b.type)) out.push(`Beat "${b.id}" has an unknown type "${b.type}" (${DIORAMA_BEAT_TYPES.join(', ')}).`)
    if (b.plate && !plateIds.has(b.plate)) out.push(`Beat "${b.id}" is on plate "${b.plate}", which isn't in insets.`)
    for (const k of Object.keys(b)) {
      if (BEAT_KEYS.has(k)) continue
      out.push(
        LAYER_KEYS.has(k)
          ? `Beat "${b.id}" has "${k}" at the top level; it goes under "layers", or the runtime ignores it.`
          : `Beat "${b.id}" has "${k}", which the runtime doesn't read (${[...BEAT_KEYS].join(', ')}).`,
      )
    }
    const L = b.layers ?? {}
    for (const k of Object.keys(L)) if (!LAYER_KEYS.has(k)) out.push(`Beat "${b.id}" layers has "${k}", which the runtime doesn't read (${[...LAYER_KEYS].join(', ')}).`)
    for (const r of [...(L.routes ?? []), ...(L.on ?? [])]) if (!routeIds.has(r)) out.push(`Beat "${b.id}" shows route "${r}", which isn't in routes.`)
    for (const p of [...(L.labels ?? []), ...(L.labelsSm ?? []), ...(L.places ?? [])]) if (!placeIds.has(p)) out.push(`Beat "${b.id}" labels "${p}", which isn't in places.`)
    if ((L.labels?.length ?? 0) > 8) out.push(`Beat "${b.id}" labels ${L.labels!.length} places: at most 8 (and 4 on phones, via labelsSm).`)
    const target = b.camera?.target
    if (typeof target === 'string' && target !== 'props' && !placeIds.has(target)) out.push(`Beat "${b.id}" points the camera at "${target}", which isn't in places.`)
    for (const p of b.props ?? []) {
      for (const v of propPlaces(p)) if (!placeIds.has(v)) out.push(`Beat "${b.id}": a ${p.kind} at "${v}", which isn't in places.`)
      for (const v of propQuantities(p)) {
        if (!quantities.some((q) => q.id === v)) out.push(`Beat "${b.id}": a ${p.kind} sized by "${v}", which isn't in quantities.`)
      }
    }
    if (b.type === 'stepper' && b.stepper?.route && !routeIds.has(b.stepper.route)) out.push(`Beat "${b.id}" steps along "${b.stepper.route}", which isn't in routes.`)
  }
  out.push(...checkDioramaObjects(beats))
  return out
}

type Prop = NonNullable<DioramaBeat['props']>[number]
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
/** The place ids a prop stands on or threads back to. */
function propPlaces(p: Prop): string[] {
  const ids: unknown[] = [p.at, p.from, p.to, p.anchor]
  for (const r of list(p.rows)) ids.push(r.at)
  for (const s of list(p.spans)) ids.push(s.at)
  for (const f of list(p.frames)) ids.push(...(Array.isArray(f.places) ? f.places : []))
  return ids.filter((v): v is string => typeof v === 'string')
}
/** The quantity ids a prop is sized by: every `value` in it, a ring's range, a grove's `of`, a ruler's dates given as ids. */
function propQuantities(p: Prop): string[] {
  const ids: unknown[] = [...((p.range as unknown[]) ?? []), p.of]
  if (p.kind === 'ruler') {
    ids.push(p.from, p.to)
    for (const s of list(p.spans)) ids.push(s.from, s.to)
  }
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o)) {
      if (k === 'value') ids.push(v)
      else if (typeof v === 'object') walk(v)
    }
  }
  walk(p)
  return ids.filter((v): v is string => typeof v === 'string')
}

/**
 * The map is the stage, not the story: a story needs three kinds of data
 * object or more, and no more than half its beats may be led by the map
 * alone (no object on the plinth).
 */
export function checkDioramaObjects(beats: DioramaBeat[]): string[] {
  const out: string[] = []
  const objects = (b: DioramaBeat) => (b.props ?? []).filter((p) => p.kind !== 'line' && p.kind !== 'ship')
  const kinds = new Set(beats.flatMap((b) => objects(b).map((p) => p.kind)))
  if (beats.length && kinds.size < 3) {
    out.push(
      `The story uses ${kinds.size ? [...kinds].join(', ') : 'no data objects'}: give each data shape its object (ruler, section, trays, grove, stack, arc, split, lapse, tower, ring, pulse), three kinds or more.`,
    )
  }
  const mapOnly = beats.filter((b) => b.type !== 'interstitial' && !objects(b).length)
  if (mapOnly.length > beats.length / 2) {
    out.push(`${mapOnly.length} of ${beats.length} beats are led by the map alone (${mapOnly.map((b) => `"${b.id}"`).join(', ')}): no more than half; put a data object on the plinth.`)
  }
  return out
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6)
  const c = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}
const DEFAULT_TOKENS: Record<string, string> = { ground: '#120E16', land: '#EDE3CF', 'sea-1': '#30346E', 'sea-2': '#241B45' }

/**
 * The model's colours, from the page's --dio-* custom properties: the stage
 * reads hex only, and the land has to stand off the ground and the sea or the
 * model disappears into the page.
 */
export function checkDioramaPalette(html: string): string[] {
  const out: string[] = []
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  const tokens: Record<string, string> = {}
  for (const [, name, value] of css.matchAll(/--dio-([a-z0-9-]+)\s*:\s*([^;}]+)/gi)) tokens[name!.toLowerCase()] = value!.trim()
  const colourTokens = ['ground', 'paper', 'muted', 'accent', 'sea-1', 'sea-2', 'sea-3', 'land', 'strata-1', 'strata-2', 'strata-3', 'route-2', 'route-3', 'route-4', 'plinth', 'plinth-side', 'fog']
  for (const k of colourTokens) {
    if (tokens[k] && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(tokens[k]!)) {
      out.push(`--dio-${k} is "${tokens[k]}": the stage reads #rgb or #rrggbb only, so it falls back to the default colour.`)
    }
  }
  const hex = (k: string) => (tokens[k] && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(tokens[k]!) ? tokens[k]! : DEFAULT_TOKENS[k]!)
  const land = hex('land'), ground = hex('ground'), sea = hex('sea-2')
  if (contrast(land, ground) < 3) {
    out.push(
      `--dio-land (${land}) is too close to --dio-ground (${ground}), contrast ${contrast(land, ground).toFixed(1)}:1: the model disappears into the page. ` +
        'Make the land a light paper (bone, sand, chalk) on a dark ground, at 3:1 or more.',
    )
  }
  if (contrast(land, sea) < 2) {
    out.push(`--dio-land (${land}) and --dio-sea-2 (${sea}) are too alike (${contrast(land, sea).toFixed(1)}:1): coasts and lakes won't read. Aim for 2:1 or more.`)
  }
  return out
}

/**
 * The lint's diorama checks: the JSON, its contract, one <section
 * class="beat" data-beat> per beat (and back), [data-q] numbers that point
 * at real quantities, and a Sources section that links every source.
 */
export function lintDiorama(html: string, warnings: string[]): void {
  const { story, error } = extractDioramaStory(html)
  if (!story) {
    warnings.push(error!)
    return
  }
  for (const w of checkDioramaStory(story)) warnings.push(`Diorama: ${w}`)
  for (const w of checkDioramaPalette(html)) warnings.push(`Diorama: ${w}`)
  // A kind the runtime doesn't draw needs the page to register it.
  for (const b of story.beats ?? []) {
    for (const p of b.props ?? []) {
      if ((DIORAMA_PROP_KINDS as readonly string[]).includes(p.kind)) continue
      const k = String(p.kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!new RegExp(`Story\\.props(?:\\.${k}\\b|\\[['"]${k}['"]\\])`).test(html)) {
        warnings.push(`Diorama: beat "${b.id}" has a "${p.kind}" prop, which isn't a kind the runtime draws (${DIORAMA_PROP_KINDS.join(', ')}); register it with Story.props.${p.kind} in the page, or the stage leaves it out.`)
      }
    }
  }
  const sections = [...html.matchAll(/<section\b[^>]*\bdata-beat="([^"]+)"/gi)].map((m) => m[1]!)
  const beatIds = (story.beats ?? []).map((b) => b.id)
  for (const id of beatIds) if (!sections.includes(id)) warnings.push(`Diorama: beat "${id}" has no <section class="beat" data-beat="${id}"> with its words.`)
  for (const id of sections) if (!beatIds.includes(id)) warnings.push(`Diorama: <section data-beat="${id}"> has no beat in the JSON.`)
  const qids = new Set((story.quantities ?? []).map((q) => q.id))
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  for (const [, id] of markup.matchAll(/\bdata-q="([^"]+)"/g)) {
    if (!qids.has(id!)) warnings.push(`Diorama: data-q="${id}" isn't in quantities.`)
  }
  const missing = (story.sources ?? []).filter((s) => s.url && !markup.includes(`href="${s.url}"`))
  if (missing.length) {
    warnings.push(`Diorama: the page's Sources section doesn't link ${missing.map((s) => `"${s.id}"`).join(', ')}; link every source in the JSON.`)
  }
}
