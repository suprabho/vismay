import { NextResponse } from 'next/server'
import { z } from 'zod'
import { stringify as yamlStringify } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'
import {
  writeComposeState,
  type ComposeOutlineEntry,
} from '@vismay/content-source/composeState'
import { insertStorySource } from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  getTripItinerary,
  type TripData,
  type TripDay,
  type TripStop,
} from '@vismay/content-source/travelTrips'
import {
  getSelectedTripMedia,
  type TravelTripMediaRow,
} from '@vismay/content-source/travelMedia'
import { generateText, hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { TRAVEL_PACK } from '@vismay/story-pipeline'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Travel compose — the trip-grounded one-shot. Unlike route 0 (title +
 * format → empty draft → sources/angles/outline stages), a travel scrapbook's
 * structure is already dictated by the itinerary: pick a trip + day, and this
 * route builds the whole story deterministically — cover + one spread per
 * stop, map camera from stop coordinates, a `scrapbook: {stop}` block per
 * spread (visuals are injection-owned; see
 * `@vismay/content-source/travelScrapbook`) — then runs ONE AI pass for the
 * prose, grounded strictly in the itinerary + curated photo captions.
 *
 * The AI pass is best-effort: on failure the story is still created with the
 * itinerary descriptions as placeholder prose — the canvas compose drawer's
 * per-section content pass (seeded via compose_state below) regenerates any
 * spread. That per-section pass is forced to phase:'content' for the travel
 * pack (the VISUAL pass would replace the section body and drop
 * `scrapbook:` + the camera).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** The travel scrapbook theme — the paper palette + fonts the hand-authored
 *  new-york-2026 story established. */
const TRAVEL_THEME = {
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
  fonts: { serif: 'Lora', sans: 'Manrope', mono: 'Space Mono' },
} as const

interface Body {
  tripSlug?: string
  day?: number
  title?: string
}

const proseSchema = z.object({
  intro: z
    .string()
    .describe(
      'The cover intro: 1–2 short evocative sentences for the whole day. No stop-by-stop list.',
    ),
  spreads: z.array(
    z.object({
      id: z.string().describe('The spread id — MUST be one of the provided stop slugs, verbatim.'),
      prose: z
        .string()
        .describe(
          '1–2 SHORT past-tense paragraphs (2–4 sentences total) for this stop, blank-line separated.',
        ),
    }),
  ),
})

/** `Mar 14, 2026` for day N of a trip starting `startDate` (day 1). */
function dayDateLabel(startDate: string | undefined, n: number): string | null {
  if (!startDate) return null
  const d = new Date(`${startDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + (n - 1))
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function captionsByStop(rows: TravelTripMediaRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.stop || !row.caption) continue
    const list = map.get(row.stop) ?? []
    if (list.length < 6) list.push(row.caption)
    map.set(row.stop, list)
  }
  return map
}

/** The grounding document: the day's itinerary + curated captions, also
 *  persisted as a story source so later per-section regens stay grounded. */
function buildItineraryText(
  trip: TripData,
  day: TripDay,
  captions: Map<string, string[]>,
): string {
  const lines: string[] = [`# ${trip.city} — Day ${day.n}: ${day.title}`]
  if (day.notes) lines.push(`Day notes: ${day.notes}`)
  if (day.stay) lines.push(`Staying at: ${day.stay.name}`)
  for (const stop of day.stops) {
    lines.push('', `## ${stop.name} (${stop.time}) [slug: ${stop.slug}]`)
    if (stop.desc) lines.push(stop.desc)
    if (stop.tip) lines.push(`Tip: ${stop.tip}`)
    if (stop.suggestedBy?.length) lines.push(`Suggested by: ${stop.suggestedBy.join(', ')}`)
    const caps = captions.get(stop.slug)
    if (caps?.length) lines.push(`Photo captions: ${caps.join(' · ')}`)
  }
  return lines.join('\n')
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const tripSlug = typeof body.tripSlug === 'string' ? body.tripSlug.trim() : ''
  const dayN = typeof body.day === 'number' && Number.isInteger(body.day) ? body.day : NaN
  if (!tripSlug || Number.isNaN(dayN)) {
    return NextResponse.json({ error: 'missing "tripSlug" / integer "day"' }, { status: 400 })
  }

  let trip: TripData | null
  try {
    trip = await getTripItinerary(tripSlug)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
  if (!trip) {
    return NextResponse.json(
      {
        error: `no itinerary synced for trip "${tripSlug}" — run: pnpm travel:sync-trip-db --slug ${tripSlug}`,
      },
      { status: 422 },
    )
  }
  const day = trip.days.find((d) => d.n === dayN)
  if (!day || day.stops.length === 0) {
    return NextResponse.json(
      { error: `trip "${tripSlug}" has no stops for day ${dayN}` },
      { status: 400 },
    )
  }

  const src = getContentSource()

  // Slug: one scrapbook story per trip+day; suffix on collision so a redo
  // never clobbers an existing story.
  const base = `${tripSlug}-day-${dayN}`
  let slug: string | null = null
  for (const candidate of [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)]) {
    if ((await src.readMarkdown(candidate)) == null) {
      slug = candidate
      break
    }
  }
  if (!slug) {
    return NextResponse.json(
      { error: `too many stories already exist for ${base}` },
      { status: 409 },
    )
  }

  // Curated media: captions ground the prose; the first day photo covers the
  // hero. Fail-soft — no media just means a photo-less draft.
  const mediaRows = await getSelectedTripMedia(tripSlug, dayN)
  const captions = captionsByStop(mediaRows)
  const coverPhoto = mediaRows.find((r) => r.kind === 'image')

  const dateLabel = dayDateLabel(trip.startDate, dayN)
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : trip.city

  // ── Deterministic structure ──────────────────────────────────────────────
  const coverCenter = day.center ?? day.stops.find((s) => s.coordinates)?.coordinates ?? [0, 0]
  const sections: Record<string, unknown>[] = [
    {
      id: 'cover',
      kind: 'hero',
      text: title,
      eyebrow: [trip.emoji, `Day ${dayN}`].filter(Boolean).join(' ') + (dateLabel ? ` · ${dateLabel}` : ''),
      layout: 'hero-full-bleed',
      map: { center: coverCenter, zoom: day.zoom ?? 11.6, pitch: 30, bearing: 0, opacity: 0.85 },
      ...(coverPhoto
        ? {
            foreground: [
              {
                type: 'image',
                src: `assets://${tripSlug}/${coverPhoto.file}`,
                fit: 'cover',
                priority: true,
              },
            ],
          }
        : {}),
    },
    ...day.stops.map((stop, i) => ({
      id: stop.slug,
      text: stop.name,
      scrapbook: { stop: stop.slug },
      map: {
        center: stop.coordinates ?? coverCenter,
        zoom: 15.2,
        pitch: 40,
        ...(i % 2 === 1 ? { bearing: -20 } : {}),
      },
    })),
  ]
  const config = {
    defaults: {
      mapStyle: 'mapbox://styles/mapbox/light-v11',
      mapOpacity: 0.55,
      pinColor: day.color || TRAVEL_THEME.colors.teal,
      pinRadius: 8,
      flySpeed: 0.9,
    },
    sections,
  }

  // ── One AI pass for the prose (best-effort) ──────────────────────────────
  const itineraryText = buildItineraryText(trip, day, captions)
  const model = await getFeatureModel('generateSection')
  const proseById = new Map<string, string>()
  let intro = ''
  let modelUsed: string | null = null
  try {
    const system =
      TRAVEL_PACK.persona +
      '\n\n' +
      TRAVEL_PACK.contentGuidance +
      '\n\nYou are given one day of a real trip itinerary (with photo captions where they exist). ' +
      'Write the cover intro plus one prose entry per stop, keyed by the stop slug. Cover every ' +
      'stop exactly once.'
    const res = await generateText({
      model,
      system,
      prompt: itineraryText,
      schema: proseSchema,
      metadata: { feature: 'travel-compose', slug },
    })
    const out = res.result as z.infer<typeof proseSchema>
    modelUsed = res.modelUsed
    intro = out.intro?.trim() ?? ''
    for (const spread of out.spreads) proseById.set(spread.id, spread.prose.trim())
  } catch (e) {
    console.warn(`[travel-compose] prose pass failed for ${slug}:`, e)
  }
  if (!intro) intro = `Day ${dayN} in ${trip.city} — ${day.stops.length} stops. ${day.title}.`

  // ── Assemble the markdown ────────────────────────────────────────────────
  const frontmatter = {
    title,
    subtitle: `Day ${dayN}${dateLabel ? ` — ${dateLabel}` : ''} · ${day.stops.length} stops`,
    byline: TRAVEL_PACK.bylineExample,
    date: new Date().toISOString().slice(0, 10),
    // Trip stories stay draft/unlisted forever — the per-trip password gate
    // (travel_trips) is the real access boundary.
    status: 'draft',
    listed: false,
    vertical: 'travel',
    format: 'map',
    trip: tripSlug,
    day: dayN,
    theme: TRAVEL_THEME,
  }
  const mdParts = [`---\n${yamlStringify(frontmatter)}---`, `# ${title}`, intro]
  for (const stop of day.stops) {
    // Fallback prose: the itinerary description reads well enough to hold the
    // spread until the canvas regenerates it.
    mdParts.push(`## ${stop.name}`, proseById.get(stop.slug) ?? stop.desc ?? '')
  }
  const markdown = mdParts.join('\n\n') + '\n'

  // ── Persist (ordering load-bearing: writeMarkdown creates the row; the
  // source + compose state need it to exist) ───────────────────────────────
  try {
    await src.writeMarkdown(slug, markdown)
    await src.writeConfig(slug, JSON.stringify(config, null, 2) + '\n', 'json')
    await src.updateMetadata(slug, { appSlug: 'travel' })
    await insertStorySource({
      storySlug: slug,
      kind: 'text',
      title: `${trip.city} — Day ${dayN} itinerary`,
      extractedText: itineraryText,
      status: 'extracted',
    })
    const outline: ComposeOutlineEntry[] = day.stops.map((stop: TripStop) => ({
      id: stop.slug,
      heading: stop.name,
      intent: `Scrapbook spread recalling ${stop.name}`,
      kind: 'text',
      expectedContent: [stop.desc, stop.tip].filter(Boolean).join(' — ') || undefined,
      geo: stop.coordinates
        ? { focus: stop.name, center: stop.coordinates, zoom: 15.2 }
        : { focus: stop.name },
      status: 'accepted',
      sectionId: stop.slug,
    }))
    await writeComposeState(slug, {
      phase: 'content',
      format: 'map',
      // The sections above are real content — `attached` makes any future
      // materialise APPEND rather than replace.
      attached: true,
      model,
      angles: [],
      outline,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `failed to create scrapbook draft: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  // Best-effort audit (ai_generations) when the prose pass ran.
  if (modelUsed) {
    try {
      const supabase = createServiceClient()
      const auditParams = { feature: 'travel-compose', tripSlug, day: dayN }
      await recordGeneration(supabase, {
        kind: 'text',
        storySlug: slug,
        prompt: `travel scrapbook prose for ${tripSlug} day ${dayN}`,
        model: modelUsed,
        params: auditParams,
        requestHash: hashRequest({ model, prompt: `travel:${slug}:${Date.now()}`, params: auditParams }),
        resultRef: null,
        resultText: JSON.stringify({ intro, spreads: proseById.size }),
      })
    } catch {
      // best-effort audit
    }
  }

  return NextResponse.json({
    ok: true,
    slug,
    canvasPath: `/travel/${slug}/canvas`,
    proseGenerated: proseById.size > 0,
  })
}
