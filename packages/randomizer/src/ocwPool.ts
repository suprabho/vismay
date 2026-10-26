/**
 * The OCW Desk's live pool: the page of MIT OpenCourseWare files a spin
 * draws from, read from the MIT Learn API (api.learn.mit.edu, the public
 * API behind ocw.mit.edu/search; no key, no auth), and the course record
 * that fills in the instructors and level afterwards.
 *
 * Two shapes of pool, from the plan's query (draw.ts planOcw):
 *   - a topic page: content_file_search filtered by topic and kind, one
 *     call for the count and one for the page at the plan's offset. The
 *     endpoint refuses offset + limit past 10,000, so the offset is scaled
 *     into what it allows;
 *   - a course: every file of the kind in one course (sequence mode, and a
 *     course or resource lock), from the course's contentfiles listing.
 *
 * Pure apart from fetch (no Supabase), so spins.ts and a smoke script can
 * both use it, and the mapping is unit-tested on recorded hits. The API
 * has no documented rate limit; calls carry a timeout and a failure
 * surfaces as a spin error, never a hang.
 */

import { DRAW_RULES } from './draw'
import type { OcwCourse, OcwFile, OcwPlan, OcwPool } from './types'

export const OCW_RULES = {
  api: 'https://api.learn.mit.edu/api/v1',
  timeoutMs: 8000,
  /** A course's files of one kind are read in pages of this many, up to courseFilesMax. */
  coursePage: 100,
  courseFilesMax: 200,
} as const

/** The fields of a content file the pool keeps, as both search hits and course listings carry them. */
export interface OcwHit {
  id: number
  key?: string | null
  url?: string | null
  title?: string | null
  content_title?: string | null
  content_type?: string | null
  file_type?: string | null
  content_feature_type?: string[] | null
  youtube_id?: string | null
  resource_id?: string | number | null
  resource_readable_id?: string | null
  run_title?: string | null
  run_slug?: string | null
  course_number?: string[] | null
  departments?: Array<{ name?: string | null }> | null
  year?: number | null
  semester?: string | null
}

/** The course record (learning_resources/{id}), the parts the enrichment reads. */
export interface OcwCourseRecord {
  id: number
  readable_id?: string | null
  title?: string | null
  url?: string | null
  course_feature?: string[] | null
  runs?: Array<{
    instructors?: Array<{ full_name?: string | null; first_name?: string | null; last_name?: string | null }> | null
    level?: Array<{ name?: string | null }> | null
    semester?: string | null
    year?: number | null
  }> | null
}

/** Null when the hit lacks what a spin needs (a key, a URL, a course). */
export function ocwFileFromHit(h: OcwHit): OcwFile | null {
  const courseId = h.resource_id === null || h.resource_id === undefined || h.resource_id === '' ? NaN : Number(h.resource_id)
  if (!h.id || !h.key || !h.url || !(courseId > 0) || !h.resource_readable_id || !h.run_slug) return null
  const title = (h.title || h.content_title || '').trim() || h.key.split('/').filter(Boolean).pop() || `file ${h.id}`
  return {
    id: h.id,
    key: h.key,
    url: h.url,
    title: title.slice(0, 200),
    contentType: h.content_type || 'file',
    fileType: h.file_type ?? null,
    kinds: h.content_feature_type ?? [],
    youtubeId: h.youtube_id ?? null,
    courseId,
    courseReadableId: h.resource_readable_id,
    courseTitle: (h.run_title || '').trim() || h.resource_readable_id.split('+')[0]!,
    courseSlug: h.run_slug.replace(/^\/+|\/+$/g, ''),
    courseNumber: h.course_number?.[0] || h.resource_readable_id.split('+')[0]!,
    departments: (h.departments ?? []).map((d) => d.name).filter((n): n is string => !!n),
    year: h.year ?? null,
    semester: h.semester ?? null,
  }
}

/** Where the page starts: the plan's draw scaled into the files the endpoint will page over. */
export function ocwPageOffset(u: number, count: number, pageSize = DRAW_RULES.ocwPageSize, cap = DRAW_RULES.ocwSearchCap): number {
  const reachable = Math.min(count, cap)
  const last = Math.max(0, reachable - pageSize)
  return Math.min(last, Math.floor(Math.min(Math.max(u, 0), 0.999999) * (last + 1)))
}

export function enrichedOcwCourse(course: OcwCourse, r: OcwCourseRecord): OcwCourse {
  const run = r.runs?.[0]
  const name = (i: { full_name?: string | null; first_name?: string | null; last_name?: string | null }) =>
    (i.full_name || [i.first_name, i.last_name].filter(Boolean).join(' ')).trim()
  return {
    ...course,
    title: (r.title || '').trim() || course.title,
    url: r.url || course.url,
    instructors: (run?.instructors ?? []).map(name).filter(Boolean),
    level: (run?.level ?? []).map((l) => l.name).filter((n): n is string => !!n),
    courseFeatures: r.course_feature ?? [],
  }
}

type Fetch = typeof fetch

async function get<T>(path: string, fetchImpl: Fetch): Promise<T> {
  const res = await fetchImpl(`${OCW_RULES.api}${path}`, {
    headers: { accept: 'application/json', 'user-agent': 'vismay-randomizer (ocw desk)' },
    signal: AbortSignal.timeout(OCW_RULES.timeoutMs),
  })
  if (!res.ok) throw new Error(`MIT Learn API ${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

interface Page<T> {
  count: number
  results: T[]
}

/**
 * The pool a plan asks for. Throws on an API failure (spins.ts answers 503);
 * an empty pool (no files of that kind under that topic, or in that course)
 * is returned, not thrown, so the caller can re-plan.
 */
export async function loadOcwPool(plan: OcwPlan, opts: { now?: Date; fetch?: Fetch } = {}): Promise<OcwPool> {
  const fetchImpl = opts.fetch ?? fetch
  const asOf = (opts.now ?? new Date()).toISOString()
  const { topic, kind, courseId } = plan.query
  const q = (o: Record<string, string | number>) =>
    Object.entries(o)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')

  if (courseId !== null) {
    const files: OcwFile[] = []
    let count = 0
    for (let offset = 0; offset < OCW_RULES.courseFilesMax; offset += OCW_RULES.coursePage) {
      const page = await get<Page<OcwHit>>(
        `/learning_resources/${courseId}/contentfiles/?${q({ content_feature_type: kind, limit: OCW_RULES.coursePage, offset })}`,
        fetchImpl,
      )
      count = page.count
      for (const h of page.results) {
        const f = ocwFileFromHit(h)
        if (f && f.kinds.includes(kind)) files.push(f)
      }
      if (offset + page.results.length >= page.count || !page.results.length) break
    }
    return { asOf, query: { topic, kind, courseId }, count, offset: 0, files }
  }

  const base = q({ platform: 'ocw', topic, content_feature_type: kind })
  const head = await get<Page<OcwHit>>(`/content_file_search/?${base}&limit=0`, fetchImpl)
  const count = head.count
  if (!count) return { asOf, query: { topic, kind, courseId: null }, count: 0, offset: 0, files: [] }
  const offset = ocwPageOffset(plan.u, count)
  const page = await get<Page<OcwHit>>(`/content_file_search/?${base}&limit=${DRAW_RULES.ocwPageSize}&offset=${offset}`, fetchImpl)
  const files = page.results.map(ocwFileFromHit).filter((f): f is OcwFile => !!f && f.kinds.includes(kind))
  return { asOf, query: { topic, kind, courseId: null }, count, offset, files }
}

/**
 * The course page's instructors, level and feature list, added to a drawn
 * course. Never throws: the brief works from the file's own fields when
 * the course record cannot be read, and says the instructors are on the
 * course page.
 */
export async function enrichOcwCourse(course: OcwCourse, opts: { fetch?: Fetch } = {}): Promise<OcwCourse> {
  try {
    const r = await get<OcwCourseRecord>(`/learning_resources/${course.id}/`, opts.fetch ?? fetch)
    return enrichedOcwCourse(course, r)
  } catch (e) {
    console.warn(`[randomizer] ocw course ${course.id} not enriched: ${e instanceof Error ? e.message : String(e)}`)
    return course
  }
}
