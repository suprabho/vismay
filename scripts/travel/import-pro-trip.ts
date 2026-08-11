/**
 * Import a pro-trip itinerary (content/trips/<id>.md in the pro-trip repo)
 * into the travel app's story content.
 *
 *   pnpm travel:import /path/to/pro-trip/content/trips/new-york.md
 *   pnpm travel:import <md> --slug new-york-2026 --force
 *
 * Outputs (in apps/travel/web/content/stories/):
 *   <slug>.trip.yaml    — ALWAYS rewritten. Canonical structured itinerary;
 *                         the journey map view reads this. Safe to regenerate:
 *                         it never carries media or hand-written prose.
 *   <slug>.md           — story markdown scaffold. Written only when absent
 *   <slug>.config.yaml  — (or with --force, which overwrites hand edits).
 *   <slug>.media.yaml   — NEVER touched here; owned by the photo-inflow
 *                         pipeline (scripts/travel/prepare-media.ts).
 *
 * Format notes (mirrors pro-trip's scripts/generate-trips.ts semantics):
 *   - Day header:  "## Day N: Title" (or any "## Heading", e.g. a bonus
 *     section with zero stops) + <!-- label/subtitle/color/center/zoom/stay/
 *     airport --> comments.
 *   - Stop header: "### TIME | EMOJI | NAME" + desc lines, "> Tip: …",
 *     <!-- location/suggestedBy/tag -->, todo checkboxes (todos are DROPPED —
 *     they're planning artifacts, not story content).
 *   - Day-level blockquotes before the first stop ("> **Cluster logic:** …")
 *     become the day's `notes`.
 *   - COORDINATES FLIP: pro-trip comments are "lat, lng"; everything this
 *     script emits is Mapbox order **[lng, lat]**.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hasSupabaseEnv, upsertItineraryDb, type ItineraryDoc } from './itinerary-db'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface TripStop {
  slug: string
  time: string
  emoji: string
  name: string
  desc: string
  tip?: string
  coordinates: [number, number] | null
  tag?: string
  suggestedBy?: string[]
}

interface TripDay {
  n: number | null
  heading: string
  title: string
  label?: string
  subtitle?: string
  color: string
  center: [number, number] | null
  zoom: number | null
  stay?: { name: string; coordinates: [number, number] }
  notes?: string
  stops: TripStop[]
}

interface TripAirport {
  name: string
  code: string
  coordinates: [number, number]
  date?: string
  time?: string
  flight?: string
  kind: 'arrival' | 'departure'
  day: number | null
}

interface Trip {
  id: string
  city: string
  subtitle?: string
  emoji?: string
  highlights?: string
  startDate?: string
  endDate?: string
  days: TripDay[]
  airports: TripAirport[]
}

/* ─── Small helpers ─────────────────────────────────────────────────── */

const COMMENT_RE = /^<!--\s*(\w+):\s*(.+?)\s*-->$/

function parseLatLng(raw: string): [number, number] | null {
  const m = raw.split(',').map((s) => Number(s.trim()))
  if (m.length !== 2 || m.some((n) => !Number.isFinite(n))) return null
  // pro-trip order is lat, lng → emit [lng, lat]
  return [m[1], m[0]]
}

function kebab(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Match contentAnchors.ts normalization so the collision check is faithful. */
function normalizeHeading(s: string): string {
  return s.toLowerCase().replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim()
}

function fmtDateRange(start?: string, end?: string): string | null {
  if (!start) return null
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  if (!end || end === start) return fmt(start)
  const s = new Date(`${start}T12:00:00Z`)
  const e = new Date(`${end}T12:00:00Z`)
  const sameMonth = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()
  if (sameMonth) {
    const month = s.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    return `${month} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

/** Rough Web-Mercator fit: zoom that frames the given coordinate bounds. */
function zoomForBounds(coords: [number, number][]): { center: [number, number]; zoom: number } {
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
  const lngSpan = Math.max(maxLng - minLng, 0.01)
  const latSpan = Math.max(maxLat - minLat, 0.01)
  const zoomLng = Math.log2(360 / lngSpan) - 0.6
  const zoomLat = Math.log2(180 / latSpan) - 0.6
  const zoom = Math.max(3, Math.min(13, Math.min(zoomLng, zoomLat)))
  return { center, zoom: Math.round(zoom * 10) / 10 }
}

/* ─── pro-trip markdown parser ──────────────────────────────────────── */

function parseProTrip(md: string): Trip {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!fmMatch) throw new Error('missing frontmatter')
  const fm: Record<string, string> = {}
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  const body = md.slice(fmMatch[0].length)

  const trip: Trip = {
    id: fm.id ?? 'trip',
    city: fm.city ?? 'Trip',
    subtitle: fm.subtitle,
    emoji: fm.emoji,
    highlights: fm.highlights,
    startDate: fm.startDate,
    endDate: fm.endDate,
    days: [],
    airports: [],
  }

  let day: TripDay | null = null
  let stop: TripStop | null = null
  let dayNotes: string[] = []
  const usedStopSlugs = new Set<string>()

  const pushStop = () => {
    if (day && stop) day.stops.push(stop)
    stop = null
  }
  const pushDay = () => {
    pushStop()
    if (day) {
      const notes = dayNotes
        .join(' ')
        .replace(/\*\*Cluster logic:\*\*\s*/i, '')
        .trim()
      if (notes) day.notes = notes
      trip.days.push(day)
    }
    day = null
    dayNotes = []
  }

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd()

    const h2 = line.match(/^##\s+(.+)$/)
    if (h2 && !line.startsWith('###')) {
      pushDay()
      const heading = h2[1].trim()
      const dm = heading.match(/^Day\s+(\d+)\s*:\s*(.*)$/i)
      day = {
        n: dm ? Number(dm[1]) : null,
        heading,
        title: dm ? dm[2].trim() : heading,
        color: '#8a8172',
        center: null,
        zoom: null,
        stops: [],
      }
      continue
    }

    const h3 = line.match(/^###\s+(.+)$/)
    if (h3 && day) {
      pushStop()
      const parts = h3[1].split('|').map((s) => s.trim())
      const [time = '', emoji = '', ...rest] = parts
      const name = rest.join(' | ') || emoji || time
      let slug = kebab(name) || 'stop'
      while (usedStopSlugs.has(slug)) slug = `${slug}-2`
      usedStopSlugs.add(slug)
      stop = {
        slug,
        time,
        emoji: rest.length > 0 ? emoji : '',
        name,
        desc: '',
        coordinates: null,
      }
      continue
    }

    const comment = line.match(COMMENT_RE)
    if (comment) {
      const [, key, value] = comment
      if (stop && day) {
        if (key === 'location') stop.coordinates = parseLatLng(value)
        else if (key === 'suggestedBy')
          stop.suggestedBy = value.split(',').map((s) => s.trim()).filter(Boolean)
        else if (key === 'tag') stop.tag = value
      } else if (day) {
        if (key === 'label') day.label = value
        else if (key === 'subtitle') day.subtitle = value
        else if (key === 'color') day.color = value
        else if (key === 'center') day.center = parseLatLng(value)
        else if (key === 'zoom') day.zoom = Number(value)
        else if (key === 'stay') {
          const [name, coords] = value.split('|').map((s) => s.trim())
          const c = coords ? parseLatLng(coords) : null
          if (name && c) day.stay = { name, coordinates: c }
        } else if (key === 'airport') {
          const parts = value.split('|').map((s) => s.trim())
          const [name, code, coords, date, time, flight] = parts
          const c = coords ? parseLatLng(coords) : null
          if (name && c) {
            trip.airports.push({
              name,
              code: code ?? '',
              coordinates: c,
              date,
              time,
              flight,
              kind: 'departure', // fixed up after parse — first airport day = arrival
              day: day.n,
            })
          }
        }
      }
      continue
    }

    if (/^- \[[ x]\]/.test(line)) continue // todos: planning-only, dropped

    if (line.startsWith('>')) {
      const text = line.replace(/^>\s?/, '').trim()
      if (!text) continue
      if (stop) {
        const tip = text.replace(/^Tip:\s*/i, '').trim()
        stop.tip = stop.tip ? `${stop.tip} · ${tip}` : tip
      } else if (day) {
        dayNotes.push(text)
      }
      continue
    }

    if (line.trim() && stop) {
      stop.desc = stop.desc ? `${stop.desc} ${line.trim()}` : line.trim()
    }
  }
  pushDay()

  // Arrival vs departure: the airport attached to the earliest day is the
  // arrival; everything later is a departure. (Multi-hop trips can hand-edit
  // trip.yaml — this is just the scaffold heuristic.)
  const withDay = trip.airports.filter((a) => a.day != null)
  if (withDay.length > 0) {
    const firstDay = Math.min(...withDay.map((a) => a.day as number))
    for (const a of trip.airports) a.kind = a.day === firstDay ? 'arrival' : 'departure'
  }

  return trip
}

/* ─── Story markdown + config generation ────────────────────────────── */

const THEME = {
  colors: {
    background: '#f6f1e7',
    text: '#2b2419',
    accent: '#c94f2c',
    accent2: '#2c6bc9',
    teal: '#2ca089',
    surface: '#fffdf8',
    muted: '#8a8172',
    positive: '#5a8a4a',
    amber: '#d9a84a',
    red: '#b04a3a',
    line: '#e2d9c8',
  },
  fonts: {
    serif: 'Lora',
    sans: 'Manrope',
    mono: 'Space Mono',
  },
}

const STAY_PIN_COLOR = '#6b6254'
const AIRPORT_PIN_COLOR = '#43413c'

interface HeadingPlan {
  /** Final markdown heading (also the config anchor) per stop slug. */
  stopHeadings: Map<string, string>
}

/**
 * Anchors resolve by first-normalized-prefix match over the heading list, so
 * an earlier heading that is a prefix of a later anchor would hijack it.
 * Disambiguate any stop heading that collides by suffixing its time.
 */
function planHeadings(trip: Trip): HeadingPlan {
  const stopHeadings = new Map<string, string>()
  const all: string[] = [trip.city, ...trip.days.map((d) => d.heading)]
  const collides = (candidate: string) => {
    const c = normalizeHeading(candidate)
    return all.some((h) => {
      const n = normalizeHeading(h)
      if (n === c) return true
      if (n.startsWith(c)) {
        const next = n.charAt(c.length)
        return next === '' || /[^a-z0-9]/.test(next)
      }
      if (c.startsWith(n)) {
        const next = c.charAt(n.length)
        return next === '' || /[^a-z0-9]/.test(next)
      }
      return false
    })
  }
  for (const day of trip.days) {
    for (const stop of day.stops) {
      let heading = stop.name
      if (collides(heading)) heading = `${stop.name} — ${stop.time}`
      if (collides(heading)) heading = `${stop.name} — Day ${day.n ?? '?'}, ${stop.time}`
      stopHeadings.set(stop.slug, heading)
      all.push(heading)
    }
  }
  return { stopHeadings }
}

function generateStoryMarkdown(trip: Trip, plan: HeadingPlan): string {
  const dateRange = fmtDateRange(trip.startDate, trip.endDate)
  const totalStops = trip.days.reduce((n, d) => n + d.stops.length, 0)
  const dayCount = trip.days.filter((d) => d.n != null).length

  const fm = [
    '---',
    `title: "${trip.city}"`,
    `subtitle: "${[dateRange, `${dayCount} days`, `${totalStops} stops`].filter(Boolean).join(' · ')}"`,
    `byline: "A travel journal"`,
    `date: "${trip.endDate ?? trip.startDate ?? new Date().toISOString().slice(0, 10)}"`,
    'status: "draft"',
    'listed: false',
    'vertical: "travel"',
    'format: "map"',
    ...YAML.stringify({ theme: THEME }).trimEnd().split('\n'),
    '---',
  ].join('\n')

  const lines: string[] = [fm, '', `# ${trip.city}`, '']
  if (trip.highlights) lines.push(`*${trip.highlights}*`, '')
  if (dateRange) {
    lines.push(`${dayCount} days and ${totalStops} stops — ${dateRange}.`, '')
  }

  for (const day of trip.days) {
    lines.push(`## ${day.heading}`, '')
    if (day.subtitle) lines.push(`*${day.subtitle}*`, '')
    if (day.notes) lines.push(day.notes, '')
    for (const stop of day.stops) {
      const heading = plan.stopHeadings.get(stop.slug) ?? stop.name
      lines.push(`## ${heading}`, '')
      const meta = [stop.time, stop.tag].filter(Boolean).join(' · ')
      if (meta) lines.push(`*${stop.emoji ? `${stop.emoji} ` : ''}${meta}*`, '')
      if (stop.desc) lines.push(stop.desc, '')
      if (stop.tip) lines.push(`*💡 ${stop.tip}*`, '')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

function generateStoryConfig(trip: Trip, plan: HeadingPlan): string {
  const allCoords: [number, number][] = trip.days.flatMap((d) =>
    d.stops.map((s) => s.coordinates).filter((c): c is [number, number] => c != null)
  )
  const overview =
    allCoords.length > 0
      ? zoomForBounds(allCoords)
      : { center: trip.days[0]?.center ?? [0, 0], zoom: 10 }

  const dateRange = fmtDateRange(trip.startDate, trip.endDate)

  const sections: unknown[] = []

  sections.push({
    id: 'cover',
    kind: 'hero',
    text: trip.city,
    eyebrow: [trip.emoji, dateRange].filter(Boolean).join(' '),
    map: {
      center: overview.center.map((n) => Math.round(n * 10000) / 10000),
      zoom: overview.zoom,
      pitch: 20,
      bearing: 0,
      pins: trip.days
        .filter((d) => d.center && d.stops.length > 0)
        .map((d) => ({
          coordinates: d.center,
          color: d.color,
          radius: 9,
          ...(d.n != null ? { label: `Day ${d.n}` } : {}),
          labelAnchor: 'top',
        })),
    },
  })

  for (const day of trip.days) {
    const center = day.center ?? overview.center
    const zoom = day.zoom ?? 12
    const pins: unknown[] = day.stops
      .filter((s) => s.coordinates)
      .map((s) => ({ coordinates: s.coordinates, color: day.color, radius: 8 }))
    if (day.stay) {
      pins.push({
        coordinates: day.stay.coordinates,
        color: STAY_PIN_COLOR,
        radius: 7,
        label: day.stay.name,
        labelAnchor: 'top',
      })
    }
    for (const airport of trip.airports) {
      if (airport.day != null && airport.day === day.n) {
        pins.push({
          coordinates: airport.coordinates,
          color: AIRPORT_PIN_COLOR,
          radius: 8,
          label: airport.code || airport.name,
          labelAnchor: 'top',
        })
      }
    }

    const section: Record<string, unknown> = {
      id: day.n != null ? `day-${day.n}` : kebab(day.heading),
      text: day.heading,
      map: {
        center,
        zoom,
        pitch: 30,
        bearing: 0,
        ...(pins.length > 0 ? { pins } : {}),
        mobile: { zoom: Math.max(3, Math.round((zoom - 0.8) * 10) / 10) },
      },
    }

    const subs = day.stops
      .filter((s) => s.coordinates)
      .map((s) => ({
        id: s.slug,
        text: plan.stopHeadings.get(s.slug) ?? s.name,
        map: {
          center: s.coordinates,
          zoom: 15.2,
          pitch: 40,
        },
      }))
    if (subs.length > 0) section.subsections = subs
    sections.push(section)
  }

  const config = {
    defaults: {
      mapStyle: 'mapbox://styles/mapbox/light-v11',
      mapOpacity: 0.92,
      pinColor: THEME.colors.accent,
      pinRadius: 8,
      flySpeed: 0.9,
      progress: true,
    },
    sections,
  }

  const header = [
    `# Story config — generated by scripts/travel/import-pro-trip.ts`,
    `# Source: pro-trip "${trip.id}". Coordinates are [lng, lat] (Mapbox order).`,
    `# One section per day (camera = the day's center/zoom, pins = that day's`,
    `# stops + stay + airport); one subsection per stop (camera flies to the`,
    `# stop, pins inherit from the day). Hand edits welcome — re-running the`,
    `# importer only overwrites this file with --force.`,
    '',
  ].join('\n')

  return header + YAML.stringify(config, { lineWidth: 100, aliasDuplicateObjects: false })
}

function generateTripYaml(trip: Trip): string {
  const doc = {
    id: trip.id,
    city: trip.city,
    subtitle: trip.subtitle,
    emoji: trip.emoji,
    highlights: trip.highlights,
    startDate: trip.startDate,
    endDate: trip.endDate,
    days: trip.days.map((d) => ({
      n: d.n,
      heading: d.heading,
      title: d.title,
      label: d.label,
      subtitle: d.subtitle,
      color: d.color,
      center: d.center,
      zoom: d.zoom,
      stay: d.stay,
      notes: d.notes,
      stops: d.stops.map((s) => ({
        slug: s.slug,
        time: s.time,
        emoji: s.emoji,
        name: s.name,
        desc: s.desc,
        tip: s.tip,
        coordinates: s.coordinates,
        tag: s.tag,
        suggestedBy: s.suggestedBy,
      })),
    })),
    airports: trip.airports,
  }
  const header = [
    '# Canonical structured itinerary — generated by scripts/travel/import-pro-trip.ts.',
    '# The journey map view reads this file. Regenerated on every import run;',
    "# don't hand-edit prose here (edit the story .md instead). Coordinates are",
    '# [lng, lat] (Mapbox order — flipped from pro-trip comments).',
    '',
  ].join('\n')
  return header + YAML.stringify(doc, { lineWidth: 100, aliasDuplicateObjects: false })
}

/* ─── CLI ───────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const force = args.includes('--force')

  const mdPath = positional[0]
  if (!mdPath) {
    console.error(
      'usage: pnpm travel:import <pro-trip md path> [--slug <story-slug>] [--out <dir>] [--force]'
    )
    process.exit(1)
  }

  const md = fs.readFileSync(mdPath, 'utf8')
  const trip = parseProTrip(md)

  const year = trip.startDate?.slice(0, 4)
  const slug = getFlag('slug') ?? (year ? `${trip.id}-${year}` : trip.id)
  const outDir =
    getFlag('out') ?? path.join(process.cwd(), 'apps/travel/web/content/stories')
  fs.mkdirSync(outDir, { recursive: true })

  const plan = planHeadings(trip)

  const tripYamlPath = path.join(outDir, `${slug}.trip.yaml`)
  const tripYaml = generateTripYaml(trip)
  fs.writeFileSync(tripYamlPath, tripYaml)
  console.log(`✓ wrote ${path.relative(process.cwd(), tripYamlPath)}`)

  // Mirror the itinerary into travel_trips.itinerary (migration 076) so
  // admin compose + the shared render surface can read stops without this
  // repo's filesystem. Offline imports still work — sync later with
  // `pnpm travel:sync-trip-db --slug <slug>`.
  if (hasSupabaseEnv()) {
    try {
      const outcome = await upsertItineraryDb(slug, YAML.parse(tripYaml) as ItineraryDoc)
      console.log(`✓ synced itinerary to DB (${outcome})`)
    } catch (e) {
      console.warn(
        `⚠ itinerary DB sync failed (files written; run travel:sync-trip-db later): ${
          e instanceof Error ? e.message : e
        }`
      )
    }
  } else {
    console.log('· skipped itinerary DB sync (no Supabase env) — run travel:sync-trip-db later')
  }

  for (const [file, generate] of [
    [`${slug}.md`, () => generateStoryMarkdown(trip, plan)],
    [`${slug}.config.yaml`, () => generateStoryConfig(trip, plan)],
  ] as const) {
    const p = path.join(outDir, file)
    if (fs.existsSync(p) && !force) {
      console.log(`· kept  ${path.relative(process.cwd(), p)} (exists; use --force to overwrite)`)
      continue
    }
    fs.writeFileSync(p, generate())
    console.log(`✓ wrote ${path.relative(process.cwd(), p)}`)
  }

  const stops = trip.days.reduce((n, d) => n + d.stops.length, 0)
  console.log(
    `\nImported "${trip.city}" → ${slug}: ${trip.days.length} day sections, ${stops} stops, ${trip.airports.length} airport(s).`
  )
  const noCoords = trip.days.flatMap((d) => d.stops.filter((s) => !s.coordinates))
  if (noCoords.length > 0) {
    console.warn(
      `⚠ ${noCoords.length} stop(s) without coordinates (excluded from maps): ${noCoords
        .map((s) => s.name)
        .join(', ')}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
