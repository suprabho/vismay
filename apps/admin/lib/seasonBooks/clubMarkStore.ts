import 'server-only'
import { createServiceClient } from '@vismay/content-source/supabase'
import { HISTORY_CLUB_MARKS_TABLE, HISTORY_CRESTS_BUCKET } from '@footshorts/shared/historicalCrests'
import {
  CREST_FAMILIES, ClubMarkError, KIT_PATTERNS, chargesFromText, chargesToText, isValidCode, rimFromText, rimToText, toClubMark, type ClubMarkInput, type CrestFamily, type KitPattern,
} from '@vismay/club-marks'
import { crestEra, isHex, leagueCode, markCharges, markFamily, markRim, markFingerprint, markKit, type CrestView } from './crests'
import { CrestStoreError, fail, getCrestView, loadMarks } from './crestStore'

/**
 * Generates and reviews club marks (admin_club_marks, footshorts migrations
 * 20261021000000 + 20261023000000). The crest is read once, to classify the
 * family, and is not kept; the kit comes from data/kits.csv (pushed by
 * history:club-marks-sync) or the editor's overrides; the charges (plain shapes,
 * "shape:#hex[@scale,rotate,x,y];…") are set by hand. Node only (sharp); every caller is behind `isAuthed()`.
 */

export type MarkOverrides = {
  family?: CrestFamily | null
  code?: string | null
  pattern?: KitPattern | null
  c1?: string | null
  /** '' = explicitly no second colour; null = back to the kit's. */
  c2?: string | null
  /** "shape:#a/#b[@scale,rotate,x,y[,sx,sy]][~layer];…". '' = explicitly none; null = back to the editorial default. */
  charge?: string | null
  /** "#HEX@width;…" edge first, "none", or '' for the default ring; null = back to the editorial default. */
  rim?: string | null
}

async function update(season: string, wiki: string, patch: Record<string, unknown>) {
  const { error } = await createServiceClient().from(HISTORY_CLUB_MARKS_TABLE).upsert({ season, wiki, ...patch }, { onConflict: 'season,wiki' })
  if (error) fail(error.message)
}

async function crestSource(c: CrestView): Promise<ClubMarkInput['crest']> {
  if (c.upload_path) {
    const { data, error } = await createServiceClient().storage.from(HISTORY_CRESTS_BUCKET).download(c.upload_path)
    if (error || !data) throw new ClubMarkError('E_FETCH', error?.message ?? 'upload not found')
    return { data: new Uint8Array(await data.arrayBuffer()) }
  }
  return c.file_url ? { url: c.file_url } : undefined
}

/** Run toClubMark() for one club and store the row (or the error). */
export async function generateMark(season: string, wiki: string, by: string | null): Promise<CrestView> {
  const crest = await getCrestView(season, wiki)
  const m = crest.mark
  const others = [...(await loadMarks(season))].filter(([w]) => w !== wiki)
  const takenCodes = others.filter(([, o]) => o.status === 'ok' && o.code).map(([, o]) => o.code!)
  const base = { generated_from: markFingerprint(crest), generated_by: by, generated_at: new Date().toISOString() }
  try {
    const kit = markKit(m)
    const result = await toClubMark({
      clubId: crest.canonical_id || crest.slug || wiki,
      name: crest.name,
      league: leagueCode(crest),
      era: crestEra(crest),
      crest: markFamily(m) ? undefined : await crestSource(crest),
      kit: kit ?? undefined,
      overrides: { family: markFamily(m) ?? undefined, code: m?.override_code ?? undefined },
      charges: markCharges(m),
      rim: markRim(m) ?? null,
    }, { takenCodes })
    const reasons = [...result.reviewReasons]
    if (m?.kit_needs_review && !m.override_pattern && !m.override_c1 && !m.seed_c1) reasons.push(`Kit: ${m.kit_note || 'flagged in kits.csv'}`)
    const { row } = result
    await update(season, wiki, {
      ...base, status: 'ok', error_code: null, error_message: null,
      code: row.code, crest: row.crest, pattern: row.pattern, c1: row.c1, c2: row.c2, ring: row.ring, rim: rimToText(row.rim),
      charge: row.charges.length ? chargesToText(row.charges) : null, league: row.league, era_from: row.from, era_to: row.to,
      family_confidence: result.familyConfidence, checks: result.checks, print: { ...result.printSwatches, cmyk: result.print },
      needs_review: reasons.length > 0, review_reasons: reasons, alt: result.alt, spec_version: result.specVersion,
    })
  } catch (e) {
    if (!(e instanceof ClubMarkError)) throw e
    await update(season, wiki, {
      ...base, status: 'error', error_code: e.code, error_message: e.message, code: null, crest: null, pattern: null, c1: null, c2: null,
      ring: null, rim: null, charge: null,
      checks: null, print: null, needs_review: true, review_reasons: [e.message],
    })
  }
  return getCrestView(season, wiki)
}

function validOverrides(o: MarkOverrides): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (o.family !== undefined) {
    if (o.family !== null && !CREST_FAMILIES.includes(o.family)) throw new CrestStoreError('Unknown crest family', 400)
    out.override_family = o.family
  }
  if (o.code !== undefined) {
    const code = o.code?.trim().toUpperCase() || null
    if (code && !isValidCode(code)) throw new CrestStoreError('A code is 2–3 capital letters or digits', 400)
    out.override_code = code
  }
  if (o.pattern !== undefined) {
    if (o.pattern !== null && !KIT_PATTERNS.includes(o.pattern)) throw new CrestStoreError('Unknown kit pattern', 400)
    out.override_pattern = o.pattern
  }
  for (const k of ['c1', 'c2'] as const) {
    const v = o[k]
    if (v === undefined) continue
    if (v !== null && !(k !== 'c1' && v === '') && !isHex(v)) throw new CrestStoreError(`${k} must be a hex colour like #A50044`, 400)
    out[`override_${k}`] = v === null ? null : v === '' ? '' : (v.startsWith('#') ? v : `#${v}`).toUpperCase()
  }
  if (o.charge !== undefined) {
    const charges = o.charge ? chargesFromText(o.charge) : []
    if (o.charge && !charges.length) throw new CrestStoreError('Charges are plain shapes like triangle:#A50044@1,0,0,0, separated by ;', 400)
    out.override_charge = charges.length ? chargesToText(charges) : o.charge
  }
  if (o.rim !== undefined) {
    if (o.rim && o.rim !== 'none' && !rimFromText(o.rim)) throw new CrestStoreError('A rim is up to 3 bands like #F2B300@9;#FFFFFF@3, or none', 400)
    out.override_rim = o.rim === null ? null : o.rim === '' || o.rim === 'none' ? o.rim : rimToText(rimFromText(o.rim))
  }
  return out
}

/** Review queue: write the editor's overrides back into the input and regenerate. */
export async function overrideMark(season: string, wiki: string, overrides: MarkOverrides, by: string | null): Promise<CrestView> {
  await update(season, wiki, { ...validOverrides(overrides), reviewed_by: by, reviewed_at: new Date().toISOString() })
  return generateMark(season, wiki, by)
}

/** Review queue: confirm the mark as generated — its family and code become overrides, and the row leaves the queue. */
export async function confirmMark(season: string, wiki: string, by: string | null): Promise<CrestView> {
  const crest = await getCrestView(season, wiki)
  const m = crest.mark
  if (m?.status !== 'ok' || !m.crest || !m.code) throw new CrestStoreError('Generate the mark before confirming it.', 409)
  await update(season, wiki, {
    override_family: m.crest, override_code: m.code, override_charge: m.charge ?? '', override_rim: m.rim ?? '', reviewed_by: by, reviewed_at: new Date().toISOString(),
  })
  const next = await generateMark(season, wiki, by)
  // What is left (a print ΔE, a kit note) was seen and accepted.
  await update(season, wiki, { needs_review: false })
  return { ...next, mark: next.mark ? { ...next.mark, needs_review: false } : null }
}
