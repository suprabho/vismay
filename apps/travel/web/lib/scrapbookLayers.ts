/**
 * The scrapbook injection seam: turns curated media + the trip itinerary into
 * foreground layers on the story config, so the config stays a lean set of
 * per-spread declarations (camera + layout + `scrapbook:` block) and photos
 * flow in from what /curate selected.
 *
 * This lib is the ONLY author of injected layer shapes — if a module schema
 * changes, fix it here once. Injection merges UNDER hand-authored region
 * layers: an authored region keeps its content, injection only fills regions
 * it owns that are empty.
 *
 * Every injected visual layer sets `style.portrait.size.height` — travel:*
 * types are not in the engine's portrait-stack defaults and would collapse
 * to zero height on phones without it.
 */

import type {
  ForegroundRegionsInput,
  StoryConfig,
  StorySectionConfig,
  VizLayer,
} from '@vismay/viz-engine'
import type { TripData, TripDay, TripStop } from './trips'
import type { CuratedMediaItem } from './scrapbookMedia'

export type ScrapbookTemplate = 'hero' | 'scatter' | 'grid' | 'stack' | 'ticket' | 'note'

export interface ScrapbookMeta {
  /** Stop slug in the trip.yaml this spread narrates. */
  stop: string
  /** Photo treatment. Auto-picked from the selected count when omitted. */
  template?: ScrapbookTemplate
  /** Cap on photos shown (remainder becomes the "+ N more" tab). */
  max?: number
  /** Skip the first N curated photos — for a stop's second/third spread. */
  offset?: number
  /** Inject the stop's tip as a footer tapeNote (default true). */
  tip?: boolean
  /**
   * Include one of the stop's curated videos: `true` = first, a number =
   * that index. Off by default so multi-spread stops don't repeat the clip.
   */
  video?: boolean | number
}

export type ScrapbookSectionConfig = StorySectionConfig & { scrapbook?: ScrapbookMeta }

const SCATTER_ROTATIONS = [-5, 4, -3]
const SCATTER_POSITIONS: Array<{ x: string; y: string; w: string; h: string }> = [
  { x: '2%', y: '2%', w: '40%', h: '52%' },
  { x: '46%', y: '12%', w: '40%', h: '52%' },
  { x: '22%', y: '46%', w: '42%', h: '50%' },
]

function pickTemplate(count: number): ScrapbookTemplate {
  if (count === 0) return 'note'
  if (count === 1) return 'hero'
  if (count <= 3) return 'scatter'
  if (count <= 6) return 'grid'
  return 'stack'
}

function findStop(day: TripDay, slug: string): TripStop | undefined {
  return day.stops.find((s) => s.slug === slug)
}

function regionsOf(section: StorySectionConfig): Record<string, unknown> {
  const fg = section.foreground
  if (fg && typeof fg === 'object' && !Array.isArray(fg) && 'regions' in fg) {
    return (fg as ForegroundRegionsInput).regions
  }
  return {}
}

const portrait = (height: string) => ({ portrait: { size: { height } } })

function photoLayers(
  template: ScrapbookTemplate,
  images: CuratedMediaItem[],
  opts: { max: number; total: number; journeyHref: string; dayColor: string }
): VizLayer[] {
  const shown = images.slice(0, opts.max)
  const hidden = opts.total - shown.length
  const more = hidden > 0 ? { moreCount: hidden, moreHref: opts.journeyHref } : {}

  switch (template) {
    case 'hero':
      return [
        {
          type: 'image',
          src: shown[0].ref,
          fit: 'cover',
          alt: shown[0].caption ?? '',
          style: portrait('100%'),
        } as VizLayer,
      ]
    case 'scatter':
      return shown.slice(0, 3).map(
        (img, i) =>
          ({
            type: 'travel:polaroid',
            src: img.ref,
            caption: img.caption,
            aspect: 'portrait',
            rotation: SCATTER_ROTATIONS[i % SCATTER_ROTATIONS.length],
            tape: i === 1 ? 'corner' : 'top',
            enterDelay: 120 * i,
            style: {
              position: { x: SCATTER_POSITIONS[i].x, y: SCATTER_POSITIONS[i].y },
              size: { width: SCATTER_POSITIONS[i].w, height: SCATTER_POSITIONS[i].h },
              ...portrait('44vh'),
            },
          }) as VizLayer
      )
    case 'grid':
      return [
        {
          type: 'imageGrid',
          items: shown.slice(0, 6).map((img) => ({
            src: img.ref,
            caption: img.caption,
            alt: img.caption ?? '',
          })),
          style: portrait('52vh'),
        } as VizLayer,
      ]
    case 'stack':
      return [
        {
          type: 'travel:photoStack',
          items: shown.slice(0, 5).map((img) => ({ src: img.ref, caption: img.caption })),
          ...more,
          enterDelay: 100,
          style: portrait('52vh'),
        } as VizLayer,
      ]
    default:
      return []
  }
}

/** Collect the image srcs a section's injected/authored photo layers reference. */
function sectionImageSrcs(regions: Record<string, unknown>): string[] {
  const srcs: string[] = []
  for (const value of Object.values(regions)) {
    const layers = Array.isArray(value) ? value : [value]
    for (const layer of layers as Array<Record<string, unknown>>) {
      if (!layer || typeof layer !== 'object') continue
      if (typeof layer.src === 'string' && layer.src.startsWith('assets://')) srcs.push(layer.src)
      if (Array.isArray(layer.items)) {
        for (const item of layer.items as Array<{ src?: string }>) {
          if (typeof item?.src === 'string' && item.src.startsWith('assets://')) srcs.push(item.src)
        }
      }
    }
  }
  return srcs
}

/**
 * Mutates a copy of the config: for each section carrying a `scrapbook:`
 * block, fills its foreground regions from curated media + the itinerary,
 * synthesizes the day's route pins, and appends a prefetch layer warming the
 * NEXT spread's images.
 */
export function injectScrapbookLayers(
  config: StoryConfig,
  mediaByStop: Map<string, CuratedMediaItem[]>,
  trip: TripData,
  opts: { day: number; slug: string }
): StoryConfig {
  const day = trip.days.find((d) => d.n === opts.day)
  if (!day) return config

  const journeyHref = `/t/${opts.slug}`
  const dayColor = day.color || '#2ca068'
  let sideParity = 0

  const sections: ScrapbookSectionConfig[] = (config.sections as ScrapbookSectionConfig[]).map(
    (section) => {
      const meta = section.scrapbook
      if (!meta?.stop) return section
      const stop = findStop(day, meta.stop)
      if (!stop) {
        console.warn(`[scrapbook] section "${section.id}" references unknown stop "${meta.stop}"`)
        return section
      }

      const media = mediaByStop.get(meta.stop) ?? []
      const images = media.filter((m) => m.kind === 'image').slice(meta.offset ?? 0)
      const videos = media.filter((m) => m.kind === 'video')
      const template = meta.template ?? pickTemplate(images.length)
      const max = meta.max ?? (template === 'grid' ? 6 : template === 'stack' ? 5 : 3)

      // Layout: authored wins; hero/note templates have dedicated spreads;
      // photo spreads alternate sides so the paper dodges the flown-to pin.
      let layout = section.layout
      if (!layout) {
        if (template === 'hero') layout = 'travel:spread-hero'
        else if (template === 'note' || template === 'ticket') layout = 'travel:spread-center'
        else layout = sideParity++ % 2 === 0 ? 'travel:spread-right' : 'travel:spread-left'
      }
      const isHero = layout === 'travel:spread-hero'
      const isCenter = layout === 'travel:spread-center'

      const authored = regionsOf(section)
      const regions: Record<string, unknown> = { ...authored }

      // Photo area (region name differs on the hero spread).
      const photoRegion = isHero ? 'photo' : isCenter ? 'content' : 'photos'
      if (!regions[photoRegion] && template !== 'note' && template !== 'ticket') {
        const layers = photoLayers(template, images, {
          max,
          total: images.length,
          journeyHref,
          dayColor,
        })
        const videoIdx = typeof meta.video === 'number' ? meta.video : 0
        if (meta.video !== undefined && meta.video !== false && videos[videoIdx]) {
          layers.push({
            type: 'video',
            src: videos[videoIdx].ref,
            fit: 'cover',
            style: {
              position: { x: '62%', y: '62%' },
              size: { width: '36%', height: '34%' },
              panel: {
                background: '#fdfcf8',
                padding: '0.5rem',
                borderRadius: '3px',
                shadow: '0 10px 26px rgba(20, 16, 8, 0.3)',
              },
              ...portrait('34vh'),
            },
          } as VizLayer)
        }
        if (layers.length > 0) regions[photoRegion] = layers
      }

      // Prose card. Side/hero spreads have a paper-card `note` region; center
      // spreads carry the paper chrome on the layer itself.
      if (!isCenter && !regions['note']) {
        regions['note'] = [{ type: 'bodyText' } as VizLayer]
      }
      if (isCenter && !regions['content']) {
        const centerLayers: VizLayer[] = [
          {
            type: 'bodyText',
            style: {
              position: { x: 'center', y: '6%' },
              size: { width: '100%', height: '48%' },
              panel: {
                background: 'rgba(253, 252, 248, 0.94)',
                border: '1px solid var(--color-line)',
                borderRadius: '3px',
                padding: '1.5rem',
                shadow: '0 10px 30px rgba(20, 16, 8, 0.18)',
              },
              ...portrait('34vh'),
            },
          } as VizLayer,
        ]
        if (stop.tip) {
          centerLayers.push({
            type: 'travel:tapeNote',
            text: stop.tip,
            title: stop.suggestedBy?.length ? `${stop.suggestedBy[0]}'s pick ✓` : undefined,
            rotation: 2,
            enterDelay: 200,
            style: {
              position: { x: 'center', y: '62%' },
              size: { width: '88%', height: '30%' },
              ...portrait('18vh'),
            },
          } as VizLayer)
        }
        regions['content'] = centerLayers
      }

      // Postmark.
      if (!regions['meta']) {
        regions['meta'] = [
          {
            type: 'travel:postmark',
            place: stop.name,
            time: stop.time,
            emoji: stop.emoji,
            color: dayColor,
            enterDelay: 260,
            style: portrait('110px'),
          } as VizLayer,
        ]
      }

      // Tip + attribution note.
      if (!isHero && !isCenter && meta.tip !== false && !regions['footer']) {
        const suggested = stop.suggestedBy?.length
          ? `${stop.suggestedBy[0]}'s pick ✓`
          : undefined
        if (stop.tip || suggested) {
          regions['footer'] = [
            {
              type: 'travel:tapeNote',
              text: stop.tip ?? suggested ?? '',
              title: stop.tip && suggested ? suggested : undefined,
              rotation: sideParity % 2 === 0 ? -2 : 2,
              enterDelay: 380,
              style: portrait('16vh'),
            } as VizLayer,
          ]
        }
      }

      // Route pins: full day 3 route, current stop featured.
      const map = section.map
      const mapWithPins =
        map && !map.pins
          ? {
              ...map,
              pins: day.stops
                .filter((s) => s.coordinates)
                .map((s) => ({
                  coordinates: s.coordinates as [number, number],
                  color: s.slug === stop.slug ? dayColor : `${dayColor}66`,
                  radius: s.slug === stop.slug ? 11 : 6,
                  ...(s.slug === stop.slug ? { label: s.name, labelAnchor: 'top' as const } : {}),
                })),
            }
          : map

      return {
        ...section,
        layout,
        map: mapWithPins,
        foreground: { layout, regions } as ForegroundRegionsInput,
      }
    }
  )

  // Prefetch: each spread idle-warms the next spread's images.
  for (let i = 0; i < sections.length; i++) {
    const fg = sections[i].foreground
    if (!fg || typeof fg !== 'object' || Array.isArray(fg) || !('regions' in fg)) continue
    const next = sections
      .slice(i + 1)
      .map((s) => sectionImageSrcs(regionsOf(s)))
      .find((srcs) => srcs.length > 0)
    if (next?.length) {
      // Piggyback on the always-injected `meta` region — a region name the
      // layout doesn't define would be dropped by the dispatcher.
      const regions = (fg as ForegroundRegionsInput).regions as Record<string, unknown>
      const meta = regions['meta']
      const prefetch = { type: 'travel:prefetch', srcs: next.slice(0, 8) } as VizLayer
      if (Array.isArray(meta)) meta.push(prefetch)
      else if (meta) regions['meta'] = [meta, prefetch]
      else regions['meta'] = [prefetch]
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const counts = sections
      .filter((s) => (s as ScrapbookSectionConfig).scrapbook)
      .map((s) => {
        const r = regionsOf(s)
        const n = Object.values(r).reduce<number>(
          (acc, v) => acc + (Array.isArray(v) ? v.length : 1),
          0
        )
        return `${s.id}:${n}`
      })
    console.info(`[scrapbook] injected layers → ${counts.join(' · ')}`)
  }

  return { ...config, sections }
}
