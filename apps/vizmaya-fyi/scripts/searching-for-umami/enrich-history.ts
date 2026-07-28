/**
 * Food-history enrichment worker — builds the review-gated history/geography
 * dataset behind the umami History tab (migration 071):
 *
 *   food_dishes + history-subjects.ts  →  food_history_subjects
 *   en.wikipedia.org (MediaWiki API)   →  LLM event extraction  →  food_history_events
 *
 * Per subject (50 dishes + ~50 curated ingredients): resolve the Wikipedia
 * article (one call: full plain-text extract + revision id), have
 * gemini-2.5-flash extract 3–12 dated/placed events as paraphrased one-line
 * claims, validate hard, geocode places (curated overrides → Mapbox), and
 * insert as status='ai-draft' rows for human review in the admin.
 *
 * Run locally:  pnpm searching-for-umami:enrich-history [flags]
 *   --dry-run           resolve + extract + print, write nothing
 *   --subject <slug>    only this subject (repeatable; matches dish or ingredient slug)
 *   --dishes-only / --ingredients-only
 *   --limit N           first N subjects (smoke runs)
 *   --force             re-enrich: deletes the subject's ai-draft rows first
 *                       (reviewed/rejected rows are NEVER touched), re-resolves wiki
 *   --geocode           no enrichment: scan existing events missing coords and
 *                       print ready-to-paste historyPlaceCoords.ts suggestions
 *
 * Required env (apps/vizmaya-fyi/.env.local / .env): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY. Optional: MAPBOX_TOKEN ??
 * NEXT_PUBLIC_MAPBOX_TOKEN (absent → coords stay null, place text kept).
 *
 * Rights: Wikipedia text is CC BY-SA. Claims must be PARAPHRASED (the prompt
 * demands it and a verbatim guard rejects ≥60-char exact substrings);
 * source_url + wiki_oldid on every row carry attribution and a permalink.
 *
 * Degradation stance (same as scrape-news.ts): per-subject try/catch with one
 * LLM retry; any failure warns and moves on; the run never throws mid-fleet.
 */

import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { INGREDIENT_SUBJECTS, EXCLUDED_INGREDIENTS, DISH_WIKI_TITLES } from './history-subjects'
import { HISTORY_PLACE_COORDS } from '../../lib/searching-for-umami/historyPlaceCoords'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(SCRIPT_DIR, '../../')
loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const EPIC_SLUG = 'searching-for-umami'
const WP_API = 'https://en.wikipedia.org/w/api.php'
const UA = 'Vizmaya-Umami/1.0 (food history enrich; hello@promad.design)'
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const MAX_EXTRACT_CHARS = 60_000
const EVENT_KINDS = new Set(['origin', 'spread', 'introduction', 'etymology', 'cultivation', 'other'])

const args = process.argv.slice(2)
const flag = (name: string): boolean => args.includes(name)
const multiOpt = (name: string): string[] => {
  const out: string[] = []
  for (let i = 0; i < args.length - 1; i++) if (args[i] === name) out.push(args[i + 1])
  return out
}
const opt = (name: string): string | null => multiOpt(name)[0] ?? null

const DRY_RUN = flag('--dry-run')
const FORCE = flag('--force')
const GEOCODE_MODE = flag('--geocode')
const DISHES_ONLY = flag('--dishes-only')
const INGREDIENTS_ONLY = flag('--ingredients-only')
const ONLY_SUBJECTS = new Set(multiOpt('--subject'))
const LIMIT = Number(opt('--limit') ?? Infinity)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── shared types ────────────────────────────────────────────────────────── */

interface Subject {
  kind: 'dish' | 'ingredient'
  slug: string
  name: string
  entityId: number | null
  titleOverride?: string
  /** Extra title candidates tried before search (dishes: parenthetical variants). */
  titleCandidates: string[]
}

interface WikiPage {
  title: string
  url: string
  oldid: number
  extract: string
  description: string | null
}

interface RawEvent {
  kind: string
  date_text: string
  year: number | null
  year_end: number | null
  place: string | null
  country_code: string | null
  claim: string
  confidence: string
}

/* ── subject assembly ────────────────────────────────────────────────────── */

async function loadSubjects(sb: SupabaseClient): Promise<{ subjects: Subject[]; unmatched: string[] }> {
  const { data, error } = await sb
    .from('food_dishes')
    .select('slug, name, ingredients')
    .eq('epic_slug', EPIC_SLUG)
    .order('cuisine')
    .order('rank_in_cuisine')
  if (error) throw new Error(`food_dishes read: ${error.message}`)
  const dishes = (data ?? []) as Array<{ slug: string; name: string; ingredients: string[] }>

  const dishSubjects: Subject[] = dishes.map((d) => {
    const paren = d.name.match(/^(.*?)\s*\((.*?)\)\s*$/)
    const candidates = [paren?.[2], paren?.[1], d.name].filter((x): x is string => !!x?.trim())
    return {
      kind: 'dish',
      slug: d.slug,
      name: d.name,
      entityId: null,
      titleOverride: DISH_WIKI_TITLES[d.slug],
      titleCandidates: [...new Set(candidates)],
    }
  })

  const ingredientSubjects: Subject[] = INGREDIENT_SUBJECTS.map((s) => ({
    kind: 'ingredient',
    slug: s.slug,
    name: s.name,
    entityId: s.entityId ?? null,
    titleOverride: s.wikiTitle,
    titleCandidates: [s.name],
  }))

  // Registry drift check: every raw ingredient string must be matched or excluded.
  const matched = new Set(INGREDIENT_SUBJECTS.flatMap((s) => s.matches.map((m) => m.toLowerCase())))
  const unmatched = [
    ...new Set(
      dishes
        .flatMap((d) => (Array.isArray(d.ingredients) ? d.ingredients : []))
        .map((i) => i.toLowerCase().trim())
        .filter((i) => i && !matched.has(i) && !EXCLUDED_INGREDIENTS.has(i))
    ),
  ].sort()

  return { subjects: [...dishSubjects, ...ingredientSubjects], unmatched }
}

/* ── Wikipedia ───────────────────────────────────────────────────────────── */

async function wpQuery(params: Record<string, string>): Promise<any> {
  const url = `${WP_API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`)
  return res.json()
}

/** Full plain-text extract + current revision id for one title, or null. */
async function fetchPage(title: string): Promise<WikiPage | null> {
  const json = await wpQuery({
    action: 'query',
    redirects: '1',
    prop: 'extracts|revisions|description',
    explaintext: '1',
    exlimit: '1',
    rvprop: 'ids',
    titles: title,
  })
  const page = json?.query?.pages?.[0]
  if (!page || page.missing || page.invalid) return null
  const extract: string = (page.extract ?? '').trim()
  const oldid: number | undefined = page.revisions?.[0]?.revid
  if (!extract || !oldid) return null
  // Disambiguation pages are lists of links, not articles.
  if (/may (also )?refer to[:\s]/i.test(extract.slice(0, 300))) return null
  return {
    title: page.title as string,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title as string).replace(/ /g, '_'))}`,
    oldid,
    extract,
    description: (page.description as string | undefined) ?? null,
  }
}

/** Resolve a subject to an article: override → name candidates → search API. */
async function resolveWikiPage(subject: Subject): Promise<WikiPage | null> {
  const candidates = [subject.titleOverride, ...subject.titleCandidates].filter(
    (x): x is string => !!x
  )
  for (const title of candidates) {
    const page = await fetchPage(title)
    if (page) return page
    await sleep(250)
  }
  // Fallback: full-text search, take the first sensible hit.
  const search = await wpQuery({
    action: 'query',
    list: 'search',
    srsearch: `${subject.name} food`,
    srlimit: '5',
  })
  const hits = (search?.query?.search ?? []) as Array<{ title: string }>
  for (const hit of hits.slice(0, 2)) {
    const page = await fetchPage(hit.title)
    if (page) return page
    await sleep(250)
  }
  return null
}

/* ── LLM extraction ──────────────────────────────────────────────────────── */

function extractionPrompt(subject: Subject, page: WikiPage, text: string): string {
  return `You extract the historical and geographic timeline of a food subject from a Wikipedia article's plain text.

Subject: "${subject.name}" (a ${subject.kind}). Article: "${page.title}".

Extract 3-12 events. Rules:
- ONLY facts stated in the provided text. No outside knowledge. If the text supports fewer than 3 events, return fewer (even zero).
- Each claim is ONE sentence (max 280 characters), PARAPHRASED IN YOUR OWN WORDS — never copy sentences from the article (the source is CC BY-SA licensed).
- Every event needs date_text AND/OR place. Prefer events with both.
- kind: one of origin | spread | introduction | etymology | cultivation | other. 'origin' = where/when it first arose; 'introduction' = arrival in a new region; 'spread' = wider diffusion; 'etymology' = name history; 'cultivation' = domestication/agriculture milestones.
- date_text is the display string as the source frames it ("16th century", "c. 3000 BCE", "1958"). year is the sortable integer start year (negative for BCE: 3000 BCE = -3000; "16th century" = 1500). year_end only for ranges.
- place is the location as the source names it ("Fujian", "Persia", "Punjab"). country_code is the MODERN ISO-2 country containing that place, when clear (else null).
- confidence: high = explicit in the text; medium = lightly inferred framing; low = the text itself hedges ("possibly", "disputed").

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{"events": [{"kind": "origin", "date_text": "16th century", "year": 1500, "year_end": null, "place": "Punjab", "country_code": "IN", "claim": "...", "confidence": "high"}]}

ARTICLE TEXT:
${text}`
}

async function extractEvents(genai: GoogleGenAI, subject: Subject, page: WikiPage): Promise<RawEvent[]> {
  const text = page.extract.slice(0, MAX_EXTRACT_CHARS)
  const res = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: extractionPrompt(subject, page, text),
    config: { responseMimeType: 'application/json', temperature: 0.3 },
  })
  let raw = (res.text ?? '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) raw = fenced[1]
  const obj = raw.match(/\{[\s\S]*\}/)
  if (!obj) throw new Error('no JSON object in model output')
  const parsed = JSON.parse(obj[0]) as { events?: unknown }
  if (!Array.isArray(parsed.events)) throw new Error('events missing/not array')

  const normText = page.extract.replace(/\s+/g, ' ')
  const out: RawEvent[] = []
  for (const e of parsed.events as Array<Record<string, unknown>>) {
    if (!e || typeof e !== 'object') continue
    const claim = typeof e.claim === 'string' ? e.claim.replace(/\s+/g, ' ').trim() : ''
    const dateText = typeof e.date_text === 'string' ? e.date_text.trim() : ''
    const place = typeof e.place === 'string' && e.place.trim() ? e.place.trim() : null
    if (!claim || claim.length > 400) continue
    if (!dateText && !place) continue
    // Verbatim guard — CC BY-SA: paraphrase only.
    if (claim.length >= 60 && normText.includes(claim)) {
      console.warn(`  ⚠ dropped verbatim claim: "${claim.slice(0, 60)}…"`)
      continue
    }
    const year = typeof e.year === 'number' && Number.isInteger(e.year) ? e.year : null
    const yearEnd = typeof e.year_end === 'number' && Number.isInteger(e.year_end) ? e.year_end : null
    const thisYear = new Date().getFullYear()
    out.push({
      kind: EVENT_KINDS.has(String(e.kind)) ? String(e.kind) : 'other',
      date_text: dateText || (place ? 'undated' : ''),
      year: year != null && year >= -15000 && year <= thisYear ? year : null,
      year_end: yearEnd != null && yearEnd >= -15000 && yearEnd <= thisYear ? yearEnd : null,
      place,
      country_code:
        typeof e.country_code === 'string' && /^[A-Z]{2}$/.test(e.country_code.trim().toUpperCase())
          ? e.country_code.trim().toUpperCase()
          : null,
      claim,
      confidence: ['high', 'medium', 'low'].includes(String(e.confidence)) ? String(e.confidence) : 'medium',
    })
  }
  return out.slice(0, 12)
}

/* ── geocoding ───────────────────────────────────────────────────────────── */

const geoCache = new Map<string, { lat: number; lng: number } | null>()
const regionName = new Intl.DisplayNames(['en'], { type: 'region' })

function mapboxToken(): string | null {
  return process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null
}

async function geocodePlace(place: string, countryCode: string | null): Promise<{ lat: number; lng: number } | null> {
  const key = place.toLowerCase().trim()
  const curated = HISTORY_PLACE_COORDS[key]
  if (curated) return curated
  if (geoCache.has(key)) return geoCache.get(key)!
  const token = mapboxToken()
  if (!token) return null
  let country: string | null = null
  try {
    country = countryCode ? (regionName.of(countryCode) ?? null) : null
  } catch {
    country = null
  }
  const query = [place, country].filter(Boolean).join(', ')
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&access_token=${token}`
    )
    if (!res.ok) {
      geoCache.set(key, null)
      return null
    }
    const json = (await res.json()) as { features?: Array<{ center?: [number, number] }> }
    const center = json.features?.[0]?.center ?? null
    const coord = center ? { lat: center[1], lng: center[0] } : null
    geoCache.set(key, coord)
    return coord
  } catch {
    geoCache.set(key, null)
    return null
  }
}

/* ── persistence ─────────────────────────────────────────────────────────── */

const claimHash = (claim: string): string =>
  createHash('md5').update(claim.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex')

async function upsertSubjects(sb: SupabaseClient, subjects: Subject[]): Promise<void> {
  const rows = subjects.map((s) => ({
    kind: s.kind,
    slug: s.slug,
    name: s.name,
    entity_id: s.entityId,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('food_history_subjects').upsert(rows, { onConflict: 'kind,slug' })
  if (error) throw new Error(`subjects upsert: ${error.message}`)
}

/* ── geocode-suggestion mode ─────────────────────────────────────────────── */

async function runGeocodeMode(sb: SupabaseClient): Promise<void> {
  const { data, error } = await sb
    .from('food_history_events')
    .select('place, country_code')
    .is('lat', null)
    .not('place', 'is', null)
  if (error) throw new Error(`events read: ${error.message}`)
  const rows = (data ?? []) as Array<{ place: string; country_code: string | null }>
  const seen = new Map<string, string | null>()
  for (const r of rows) {
    const key = r.place.toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, r.country_code)
  }
  console.log(`[history] ${seen.size} distinct un-geocoded places`)
  for (const [place, cc] of seen) {
    const hit = await geocodePlace(place, cc)
    if (hit) {
      console.log(`  '${place}': { lat: ${hit.lat.toFixed(2)}, lng: ${hit.lng.toFixed(2)} }, // via mapbox — verify`)
    } else {
      console.log(`  '${place}': needs a manual judgment call (mapbox miss)`)
    }
    await sleep(150)
  }
  console.log('[history] paste verified lines into lib/searching-for-umami/historyPlaceCoords.ts, then re-run with --force for affected subjects')
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key)

  if (GEOCODE_MODE) {
    await runGeocodeMode(sb)
    return
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey && !DRY_RUN) throw new Error('missing GEMINI_API_KEY (use --dry-run to test without it)')
  const genai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null

  const { subjects: all, unmatched } = await loadSubjects(sb)
  if (unmatched.length > 0) {
    console.warn(
      `[history] ⚠ ${unmatched.length} raw ingredient strings neither matched nor excluded in history-subjects.ts:\n  ${unmatched.join(', ')}`
    )
  }

  let subjects = all
  if (DISHES_ONLY) subjects = subjects.filter((s) => s.kind === 'dish')
  if (INGREDIENTS_ONLY) subjects = subjects.filter((s) => s.kind === 'ingredient')
  if (ONLY_SUBJECTS.size > 0) subjects = subjects.filter((s) => ONLY_SUBJECTS.has(s.slug))
  if (Number.isFinite(LIMIT)) subjects = subjects.slice(0, LIMIT)
  console.log(
    `[history] ${subjects.length} subjects selected (${subjects.filter((s) => s.kind === 'dish').length} dishes, ${subjects.filter((s) => s.kind === 'ingredient').length} ingredients)${DRY_RUN ? ' — DRY RUN' : ''}`
  )

  if (!DRY_RUN) await upsertSubjects(sb, all)

  // Existing enrichment state, for skip-unless-force.
  const { data: existing } = await sb.from('food_history_subjects').select('kind, slug, enriched_at')
  const enrichedAt = new Map((existing ?? []).map((r: any) => [`${r.kind}:${r.slug}`, r.enriched_at]))

  let done = 0
  let skipped = 0
  let failed = 0
  let inserted = 0
  let geocoded = 0
  let placed = 0

  for (const subject of subjects) {
    const label = `${subject.kind}:${subject.slug}`
    if (!FORCE && enrichedAt.get(label)) {
      skipped++
      continue
    }
    try {
      const page = await resolveWikiPage(subject)
      if (!page) {
        console.warn(`  ✗ ${label} — no Wikipedia article resolved`)
        failed++
        continue
      }

      let events: RawEvent[] = []
      if (genai) {
        try {
          events = await extractEvents(genai, subject, page)
        } catch (err) {
          await sleep(5000) // free-tier RPM brush — retry once
          events = await extractEvents(genai, subject, page)
        }
      }

      // Geocode (skipped in dry-run to save quota; overrides still shown).
      for (const e of events) {
        if (!e.place) continue
        placed++
        const coord = DRY_RUN
          ? (HISTORY_PLACE_COORDS[e.place.toLowerCase().trim()] ?? null)
          : await geocodePlace(e.place, e.country_code)
        if (coord) geocoded++
        ;(e as any).lat = coord?.lat ?? null
        ;(e as any).lng = coord?.lng ?? null
      }

      console.log(
        `  ✓ ${label} → "${page.title}" (rev ${page.oldid}): ${events.length} events` +
          (events.length ? ` [${events.map((e) => e.kind).join(', ')}]` : '')
      )
      if (DRY_RUN) {
        for (const e of events) {
          console.log(
            `      · ${e.kind} | ${e.date_text}${e.place ? ` | ${e.place}${e.country_code ? ` (${e.country_code})` : ''}` : ''} | ${e.confidence}\n        ${e.claim}`
          )
        }
        done++
        continue
      }

      if (FORCE) {
        await sb
          .from('food_history_events')
          .delete()
          .eq('subject_kind', subject.kind)
          .eq('subject_slug', subject.slug)
          .eq('status', 'ai-draft')
      }
      if (events.length > 0) {
        const rows = events.map((e) => ({
          subject_kind: subject.kind,
          subject_slug: subject.slug,
          kind: e.kind,
          date_text: e.date_text,
          year_start: e.year,
          year_end: e.year_end,
          place: e.place,
          country_code: e.country_code,
          lat: (e as any).lat ?? null,
          lng: (e as any).lng ?? null,
          claim: e.claim,
          claim_hash: claimHash(e.claim),
          source_url: page.url,
          source_title: page.title,
          wiki_oldid: page.oldid,
          model: GEMINI_MODEL,
          confidence: e.confidence,
        }))
        const { error } = await sb
          .from('food_history_events')
          .upsert(rows, { onConflict: 'subject_kind,subject_slug,claim_hash', ignoreDuplicates: true })
        if (error) throw new Error(`events upsert: ${error.message}`)
        inserted += rows.length
      }
      const now = new Date().toISOString()
      await sb
        .from('food_history_subjects')
        .update({
          wiki_title: page.title,
          wiki_url: page.url,
          wiki_oldid: page.oldid,
          wiki_description: page.description,
          wiki_resolved_at: now,
          enriched_at: now,
          updated_at: now,
        })
        .eq('kind', subject.kind)
        .eq('slug', subject.slug)
      done++
    } catch (err) {
      console.warn(`  ✗ ${label} failed: ${err instanceof Error ? err.message : err}`)
      failed++
    }
    await sleep(400) // politeness: Wikipedia + Gemini free tier
  }

  console.log(
    `[history] done: ${done} enriched, ${skipped} skipped (already enriched; --force to redo), ${failed} failed, ` +
      `${inserted} events inserted, geocoded ${geocoded}/${placed} placed events`
  )
}

main().catch((err) => {
  console.error('[history] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
