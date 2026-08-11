/**
 * Curated media feed for the scrapbook story. DB-first (travel_trip_media —
 * what /curate edits), falling back to the git manifest when the env is
 * missing, the table isn't migrated/seeded yet, or the query fails — so local
 * dev renders an uncurated-but-plausible scrapbook.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { getSelectedTripMedia } from '@vismay/content-source/travelMedia'
import {
  groupCuratedMediaByStop,
  type CuratedMediaItem,
} from '@vismay/content-source/travelScrapbook'

const STORIES_DIR =
  process.env.STORY_CONTENT_DIR || path.join(process.cwd(), 'content/stories')

export type { CuratedMediaItem }

/** Curated (selected) media for one day, keyed by stop slug, in display order. */
export async function getCuratedDayMedia(
  slug: string,
  day: number
): Promise<Map<string, CuratedMediaItem[]>> {
  const rows = await getSelectedTripMedia(slug, day)
  const items: CuratedMediaItem[] =
    rows.length > 0 ? rows.map((r) => ({
      file: r.file,
      ref: `assets://${slug}/${r.file}`,
      kind: r.kind,
      stop: r.stop,
      caption: r.caption ?? undefined,
    })) : fallbackFromManifest(slug, day)

  return groupCuratedMediaByStop(items)
}

interface ManifestEntry {
  file?: string
  kind?: string
  day?: number | null
  stop?: string | null
  caption?: string
  original?: string
}

/**
 * Uncurated fallback: every manifest row for the day except obvious junk
 * (screenshots that EXIF-matched into a stop window).
 */
function fallbackFromManifest(slug: string, day: number): CuratedMediaItem[] {
  const p = path.join(STORIES_DIR, `${slug}.media.yaml`)
  if (!fs.existsSync(p)) return []
  try {
    const parsed = YAML.parse(fs.readFileSync(p, 'utf8')) as { media?: ManifestEntry[] } | null
    return (parsed?.media ?? [])
      .filter(
        (e): e is ManifestEntry & { file: string } =>
          !!e.file && e.day === day && !(e.original ?? '').startsWith('Screenshot_')
      )
      .map((e) => ({
        file: e.file,
        ref: `assets://${slug}/${e.file}`,
        kind: e.kind === 'video' ? ('video' as const) : ('image' as const),
        stop: e.stop ?? null,
        caption: e.caption,
      }))
  } catch {
    return []
  }
}
