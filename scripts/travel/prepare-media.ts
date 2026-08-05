/**
 * Organize a folder of trip photos/videos into upload-ready, manifest-tracked
 * media for a travel story.
 *
 *   pnpm travel:prepare-media --slug new-york-2026 [--day 3] [--source <dir>] [--dry-run]
 *
 * Reads:
 *   <source>                                   raw media (default:
 *                                              vizmaya-data/travel-media/<slug>/incoming/)
 *   apps/travel/web/content/stories/<slug>.trip.yaml   stop times + coordinates
 *
 * Writes:
 *   vizmaya-data/travel-media/<slug>/staged/   renamed, downscaled, GPS-stripped copies
 *   apps/travel/web/content/stories/<slug>.media.yaml  manifest (MERGED — existing
 *                                              rows and their captions are never touched)
 *
 * Matching: per photo, EXIF DateTimeOriginal picks the day (date offset from
 * the trip's startDate; --day forces it), then GPS proximity picks the stop
 * (nearest stop within 1 km), falling back to the time slot (the last stop
 * whose scheduled time precedes the photo). Files without usable EXIF are
 * still staged and land in the manifest with `match: manual` + null day/stop
 * for hand assignment.
 *
 * Downscaling: images re-encoded as JPEG, max edge 2560 px, quality 82,
 * auto-oriented, metadata stripped (photos land in a PUBLIC bucket — GPS
 * EXIF must not ship). Videos are copied untouched (only .mp4 plays
 * everywhere and matches the bucket's MIME allowlist — convert .mov first:
 * `ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4`).
 * If sharp can't decode a file (typically HEIC — not supported by prebuilt
 * sharp), the original is copied verbatim with a warning; prefer "JPG" when
 * downloading from Google Photos.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.heic', '.heif'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm'])
const MAX_EDGE = 2560
const JPEG_QUALITY = 82
const GPS_MAX_METERS = 1000

interface TripStopLite {
  slug: string
  time: string
  name: string
  coordinates: [number, number] | null
  minutes: number | null
}

interface TripDayLite {
  n: number | null
  date: string | null // YYYY-MM-DD
  stops: TripStopLite[]
}

interface ManifestEntry {
  file: string
  kind: 'image' | 'video'
  day: number | null
  stop: string | null
  caption?: string
  takenAt?: string
  match: 'auto' | 'manual'
  original?: string
}

/* ── helpers ────────────────────────────────────────────────────────── */

function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const mer = m[3]?.toUpperCase()
  if (mer === 'PM' && h !== 12) h += 12
  if (mer === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/* ── main ───────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2)
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const slug = getFlag('slug')
  const forceDay = getFlag('day') ? Number(getFlag('day')) : null
  const dryRun = args.includes('--dry-run')
  if (!slug) {
    console.error(
      'usage: pnpm travel:prepare-media --slug <trip-slug> [--day N] [--source <dir>] [--dry-run]'
    )
    process.exit(1)
  }

  const root = process.cwd()
  const mediaRoot = path.join(root, 'vizmaya-data/travel-media', slug)
  const sourceDir = getFlag('source') ?? path.join(mediaRoot, 'incoming')
  const stagedDir = path.join(mediaRoot, 'staged')
  const contentDir = path.join(root, 'apps/travel/web/content/stories')
  const tripYamlPath = path.join(contentDir, `${slug}.trip.yaml`)
  const manifestPath = path.join(contentDir, `${slug}.media.yaml`)

  if (!fs.existsSync(sourceDir)) {
    console.error(`source folder not found: ${sourceDir}`)
    console.error('Drop the downloaded photos there (or pass --source <dir>).')
    process.exit(1)
  }
  if (!fs.existsSync(tripYamlPath)) {
    console.error(`trip file not found: ${tripYamlPath} — run pnpm travel:import first.`)
    process.exit(1)
  }

  // Trip → day dates + stop times/coords.
  const tripRaw = YAML.parse(fs.readFileSync(tripYamlPath, 'utf8')) as {
    startDate?: string
    days?: {
      n: number | null
      stops?: { slug: string; time: string; name: string; coordinates: [number, number] | null }[]
    }[]
  }
  const days: TripDayLite[] = (tripRaw.days ?? []).map((d) => ({
    n: d.n ?? null,
    date:
      d.n != null && tripRaw.startDate ? addDays(tripRaw.startDate, d.n - 1) : null,
    stops: (d.stops ?? []).map((s) => ({
      slug: s.slug,
      time: s.time,
      name: s.name,
      coordinates: s.coordinates ?? null,
      minutes: parseTimeToMinutes(s.time),
    })),
  }))

  // Existing manifest — merged, never clobbered.
  let existing: ManifestEntry[] = []
  if (fs.existsSync(manifestPath)) {
    const parsed = YAML.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      media?: ManifestEntry[]
    } | null
    existing = parsed?.media ?? []
  }
  const existingFiles = new Set(existing.map((e) => e.file))
  const existingOriginals = new Set(existing.map((e) => e.original).filter(Boolean))

  const { default: sharp } = await import('sharp')
  const { default: exifr } = await import('exifr')

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase()
      return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext)
    })
    .sort()

  if (files.length === 0) {
    console.log(`No media files found in ${sourceDir}. Nothing to do.`)
    return
  }
  if (!dryRun) fs.mkdirSync(stagedDir, { recursive: true })

  const added: ManifestEntry[] = []
  const seqByPrefix = new Map<string, number>()
  const nextSeq = (prefix: string) => {
    // Continue numbering after anything already in the manifest or staged dir.
    if (!seqByPrefix.has(prefix)) {
      let max = 0
      const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.`)
      for (const f of existingFiles) {
        const m = f.match(re)
        if (m) max = Math.max(max, Number(m[1]))
      }
      seqByPrefix.set(prefix, max)
    }
    const n = (seqByPrefix.get(prefix) ?? 0) + 1
    seqByPrefix.set(prefix, n)
    return n
  }

  for (const file of files) {
    if (existingOriginals.has(file)) {
      console.log(`· skip   ${file} (already staged in a previous run)`)
      continue
    }
    const ext = path.extname(file).toLowerCase()
    const isVideo = VIDEO_EXT.has(ext)
    const srcPath = path.join(sourceDir, file)

    // EXIF (images only — video metadata is a can of worms; use --day).
    let takenAt: Date | null = null
    let gps: [number, number] | null = null
    if (!isVideo) {
      try {
        const exif = await exifr.parse(srcPath, { gps: true })
        if (exif?.DateTimeOriginal instanceof Date) takenAt = exif.DateTimeOriginal
        else if (exif?.CreateDate instanceof Date) takenAt = exif.CreateDate
        if (
          typeof exif?.longitude === 'number' &&
          typeof exif?.latitude === 'number' &&
          Number.isFinite(exif.longitude) &&
          Number.isFinite(exif.latitude)
        ) {
          gps = [exif.longitude, exif.latitude]
        }
      } catch {
        /* no EXIF — falls through to manual */
      }
    }

    // Day assignment.
    let day: TripDayLite | null = null
    if (forceDay != null) {
      day = days.find((d) => d.n === forceDay) ?? null
    } else if (takenAt) {
      const dateStr = `${takenAt.getFullYear()}-${pad2(takenAt.getMonth() + 1)}-${pad2(takenAt.getDate())}`
      day = days.find((d) => d.date === dateStr) ?? null
    }

    // Stop assignment: GPS proximity first, then time slot.
    let stop: TripStopLite | null = null
    if (day) {
      const withCoords = day.stops.filter((s) => s.coordinates)
      if (gps && withCoords.length > 0) {
        let best: TripStopLite | null = null
        let bestDist = Infinity
        for (const s of withCoords) {
          const dist = haversineMeters(gps, s.coordinates!)
          if (dist < bestDist) {
            best = s
            bestDist = dist
          }
        }
        if (best && bestDist <= GPS_MAX_METERS) stop = best
      }
      if (!stop && takenAt) {
        const photoMin = takenAt.getHours() * 60 + takenAt.getMinutes()
        const timed = day.stops.filter((s) => s.minutes != null)
        if (timed.length > 0) {
          const before = timed.filter((s) => (s.minutes as number) <= photoMin)
          stop = before.length > 0 ? before[before.length - 1] : timed[0]
        }
      }
    }

    const matched = day != null && (forceDay != null || takenAt != null)
    const prefix = day
      ? stop
        ? `d${day.n}-${stop.slug}`
        : `d${day.n}-day`
      : 'unassigned'
    const outExt = isVideo ? ext : '.jpg'
    const outName = `${prefix}-${pad2(nextSeq(prefix))}${outExt}`

    if (dryRun) {
      console.log(
        `→ would stage ${file} as ${outName}  (day: ${day?.n ?? '—'}, stop: ${stop?.slug ?? '—'}, ${gps ? 'gps' : takenAt ? 'time' : 'no exif'})`
      )
      continue
    }

    const outPath = path.join(stagedDir, outName)
    if (isVideo) {
      fs.copyFileSync(srcPath, outPath)
      if (ext !== '.mp4') {
        console.warn(
          `⚠ ${outName}: not .mp4 — convert before upload (bucket + <video> want video/mp4).`
        )
      }
    } else {
      try {
        // .rotate() bakes in EXIF orientation; sharp strips metadata (incl.
        // GPS) by default on re-encode — exactly what a public bucket needs.
        await sharp(srcPath)
          .rotate()
          .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toFile(outPath)
      } catch (e) {
        console.warn(
          `⚠ ${file}: sharp couldn't process (${e instanceof Error ? e.message : e}) — copying original. ` +
            'If this is HEIC, re-download from Google Photos as JPG.'
        )
        fs.copyFileSync(srcPath, path.join(stagedDir, `${prefix}-${pad2(seqByPrefix.get(prefix) ?? 1)}${ext}`))
      }
    }

    added.push({
      file: outName,
      kind: isVideo ? 'video' : 'image',
      day: day?.n ?? null,
      stop: stop?.slug ?? null,
      ...(takenAt ? { takenAt: takenAt.toISOString() } : {}),
      match: matched && (gps || takenAt || forceDay != null) ? 'auto' : 'manual',
      original: file,
    })
    console.log(
      `✓ staged ${outName}  (day: ${day?.n ?? '—'}, stop: ${stop?.slug ?? '—'}, via ${gps ? 'gps' : takenAt ? 'time' : forceDay != null ? '--day' : 'nothing — review!'})`
    )
  }

  if (dryRun || added.length === 0) {
    console.log(dryRun ? '\n(dry run — nothing written)' : '\nNo new files staged.')
    return
  }

  const merged = [...existing, ...added]
  const header = [
    '# Media manifest — one row per staged photo/video.',
    '#   file:  filename in vizmaya-data/travel-media/<slug>/staged/ and (after',
    '#          upload) in the story-assets bucket → assets://<slug>/<file>',
    '#   day/stop: where it appears in the journey view. `match: auto` rows were',
    '#          EXIF-matched — spot-check them; `match: manual` rows need day/stop',
    '#          filled in by hand. Add `caption:` freely — re-runs never touch',
    '#          existing rows.',
    '',
  ].join('\n')
  fs.writeFileSync(
    manifestPath,
    header + YAML.stringify({ media: merged }, { lineWidth: 100, aliasDuplicateObjects: false })
  )
  console.log(`\n✓ manifest updated: ${path.relative(root, manifestPath)} (+${added.length} rows)`)

  const manual = added.filter((a) => a.match === 'manual').length
  if (manual > 0) {
    console.log(`⚠ ${manual} row(s) need manual day/stop assignment — edit the manifest.`)
  }
  console.log(`\nNext: review the manifest, then upload with:`)
  console.log(`  pnpm travel:upload-media --slug ${slug}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
