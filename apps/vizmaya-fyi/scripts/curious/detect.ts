/**
 * Curious Desk, stage 2: turn fetched documents into candidate claims.
 *
 * For each curious_documents row with status 'fetched': take its stored
 * text (library sources) or fetch the publisher page once (GDELT, under the
 * web policy, text never stored), run the regex detector, send at most 3
 * passages per document to the extractor (schema-constrained Claude Haiku
 * through the AI gateway), keep each claim with its verbatim evidence quote
 * and offsets, link its entities, write the detector's own 'supports'
 * source row with the document's independence group, then cluster the new
 * claims against the last 90 days and flag contradictions.
 *
 * Usage:
 *   pnpm curious:detect -- --limit 400 --llm-cap 300            # the nightly budget
 *   pnpm curious:detect -- --source loc --limit 20 --dry-run      # prints the candidates and the claims, writes nothing
 *   pnpm curious:detect -- --no-llm --limit 50                    # detector only: marks documents, extracts nothing
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_GATEWAY_API_KEY (or the gateway's OIDC), optional CURIOUS_EXTRACT_MODEL.
 */

import { config as loadEnv } from 'dotenv'
import { detectCandidates, DETECT_VERSION } from '@vismay/curious-pipeline/detect'
import { extractClaims, EXTRACT_VERSION, DEFAULT_EXTRACT_MODEL } from '@vismay/curious-pipeline/extract'
import { fetchArticleText } from '@vismay/curious-pipeline/fetchText'
import { findContradictions } from '@vismay/curious-pipeline/contradict'
import { independenceGroup, lexicalClusters } from '@vismay/curious-pipeline/dedupe'
import { policyFor } from '@vismay/curious-pipeline/policy'
import { pool } from '@vismay/curious-pipeline/http'
import {
  insertClaims,
  linkClaimEntities,
  listDocumentsToDetect,
  listRecentClaims,
  setDocumentStatus,
  updateClaim,
  upsertClaimSources,
  type ClaimInsert,
} from '@vismay/curious-pipeline/store'
import { yearOf } from '@vismay/curious-pipeline/text'
import type { ClaimFlag, ClaimRow, DocumentRow, SourceId } from '@vismay/curious-pipeline/types'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const DEADLINE_MS = Number(process.env.DEADLINE_MINUTES ?? 25) * 60_000
const CLUSTER_DAYS = 90

interface Args {
  limit: number
  llmCap: number
  source?: SourceId
  concurrency: number
  dryRun: boolean
  noLlm: boolean
  maxPassages: number
}

function parseArgs(argv: string[]): Args {
  const a: Args = { limit: 400, llmCap: 300, concurrency: 3, dryRun: false, noLlm: false, maxPassages: 3 }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = argv[i + 1]
    if (k === '--') continue
    if (k === '--limit') (a.limit = Number(v)), i++
    else if (k === '--llm-cap') (a.llmCap = Number(v)), i++
    else if (k === '--source') (a.source = v as SourceId), i++
    else if (k === '--concurrency') (a.concurrency = Number(v)), i++
    else if (k === '--max-passages') (a.maxPassages = Number(v)), i++
    else if (k === '--dry-run') a.dryRun = true
    else if (k === '--no-llm') a.noLlm = true
    else throw new Error(`Unknown flag ${k}`)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const started = Date.now()
  const stop = () => Date.now() - started > DEADLINE_MS
  const model = process.env.CURIOUS_EXTRACT_MODEL ?? DEFAULT_EXTRACT_MODEL
  console.log(`Curious detect: up to ${args.limit} documents${args.source ? ` from ${args.source}` : ''}, ${args.noLlm ? 'no model pass' : `model ${model}, at most ${args.llmCap} passages`}${args.dryRun ? ' · DRY RUN' : ''}`)

  const docs = await listDocumentsToDetect({ limit: args.limit, source: args.source })
  console.log(`  ${docs.length} documents waiting`)
  if (!docs.length) return

  let llmUsed = 0
  let detected = 0
  let noCandidates = 0
  let skipped = 0
  let failed = 0
  const newClaims: ClaimRow[] = []
  const limiters = new Map()
  const robots = new Map<string, string | null>()
  const log = (l: string) => console.log(l)

  const handle = async (doc: DocumentRow) => {
    try {
      let text = doc.text
      let fetchedMeta: { publishedAt: string | null; author: string | null } | null = null
      if (!text && doc.source_id === 'gdelt') {
        const article = await fetchArticleText(doc.canonical_url, { limiters, robots, log })
        if (!article) {
          if (!args.dryRun) await setDocumentStatus(doc.id, 'skipped', { error: 'no article text (robots, paywall or not HTML)' })
          skipped++
          return
        }
        text = article.text
        fetchedMeta = { publishedAt: article.publishedAt, author: article.author }
      }
      if (!text) {
        if (!args.dryRun) await setDocumentStatus(doc.id, 'skipped', { error: 'no text' })
        skipped++
        return
      }
      const candidates = detectCandidates(text, { maxPassages: args.maxPassages })
      if (!candidates.length) {
        if (!args.dryRun) await setDocumentStatus(doc.id, 'no-candidates')
        noCandidates++
        return
      }
      if (args.dryRun) {
        console.log(`\n■ ${doc.title ?? doc.canonical_url} (${doc.source_id})`)
        for (const c of candidates) console.log(`  [${c.rules.join(', ')} · ${c.score}] ${c.passage.slice(0, 220).replace(/\s+/g, ' ')}…`)
      }
      if (args.noLlm) {
        detected++
        return
      }
      const policy = policyFor(doc.source_id)
      const docYear = yearOf(doc.published_at ?? fetchedMeta?.publishedAt)
      const inserts: ClaimInsert[] = []
      const extracted: Array<ClaimInsert & { entities: Array<{ name: string; kind: 'person' | 'org' | 'place' | 'work' | 'event' | 'other' }>; speaker: string | null; anonymous: boolean; hearsay: boolean }> = []
      for (const cand of candidates) {
        if (llmUsed >= args.llmCap) break
        llmUsed++
        const claims = await extractClaims(cand, { source_id: doc.source_id, title: doc.title, publisher: doc.publisher, published_at: doc.published_at ?? fetchedMeta?.publishedAt ?? null, language: doc.language }, { model })
        for (const c of claims) {
          const flags: ClaimFlag[] = []
          if (c.sensitive) flags.push('sensitive')
          const row: ClaimInsert = {
            text: c.text,
            text_norm: c.text_norm,
            claim_hash: c.claim_hash,
            kind: c.kind,
            subject: c.subject,
            era: c.era,
            region: c.region,
            theme: c.theme,
            year_from: c.year_from,
            year_to: c.year_to,
            place: c.place,
            country_code: c.country_code,
            document_id: doc.id,
            evidence_quote: c.evidence_quote,
            evidence_start: c.evidence_start,
            evidence_end: c.evidence_end,
            evidence_page: pageOf(text, c.evidence_start),
            evidence_media_ts: null,
            is_quotation: c.is_quotation,
            is_anonymous: c.attribution.is_anonymous,
            is_hearsay: c.attribution.is_hearsay,
            speaker: c.attribution.speaker,
            extractor_confidence: c.confidence,
            detector_rules: cand.rules,
            detector_version: DETECT_VERSION,
            extractor_model: c.extractor_model,
            classifier_version: EXTRACT_VERSION,
            status: 'candidate',
            flags,
          }
          inserts.push(row)
          extracted.push({ ...row, entities: c.entities, speaker: c.attribution.speaker, anonymous: c.attribution.is_anonymous, hearsay: c.attribution.is_hearsay })
        }
      }
      if (args.dryRun) {
        for (const c of inserts) console.log(`  → [${c.kind} · ${c.theme} · ${c.year_from ?? '?'}] ${c.text}\n     "${c.evidence_quote}"`)
        detected++
        return
      }
      const rows = await insertClaims(inserts)
      const byHash = new Map(rows.map((r) => [r.claim_hash, r]))
      for (const e of extracted) {
        const row = byHash.get(e.claim_hash)
        if (!row) continue
        newClaims.push(row)
        await linkClaimEntities(row.id, e.entities)
        const claimYear = e.year_from
        const contemporaneous = docYear != null && claimYear != null && Math.abs(docYear - claimYear) <= 5
        await upsertClaimSources([
          {
            claim_id: row.id,
            document_id: doc.id,
            relation: 'supports',
            independence_group: independenceGroup({ byline: fetchedMeta?.author ?? doc.author, text: text.slice(0, 400), speaker: e.hearsay || e.anonymous ? e.speaker : null, year: claimYear, publisher: doc.publisher, url: doc.canonical_url, sourceId: doc.source_id }),
            is_primary: policy.kind === 'library' && contemporaneous,
            is_contemporaneous: contemporaneous,
            institutional_quality: policy.institutionalQuality,
            quote: e.evidence_quote,
            span_start: e.evidence_start,
            span_end: e.evidence_end,
            page: e.evidence_page,
            external_ref: null,
            verified_by: 'detector',
          },
        ])
      }
      await setDocumentStatus(doc.id, 'detected')
      detected++
      console.log(`  ✓ ${doc.title?.slice(0, 70) ?? doc.canonical_url}: ${rows.length} claims`)
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${doc.canonical_url}: ${msg}`)
      if (!args.dryRun) await setDocumentStatus(doc.id, 'failed', { error: msg }).catch(() => {})
    }
  }

  await pool(docs, args.concurrency, handle, stop)
  if (stop()) console.warn('  · soft deadline reached; the rest waits for the next run')

  if (!args.dryRun && newClaims.length) {
    const recent = await listRecentClaims(CLUSTER_DAYS)
    const byId = new Map(recent.map((c) => [c.id, c]))
    for (const c of newClaims) byId.set(c.id, c)
    const clusters = lexicalClusters([...byId.values()].map((c) => ({ id: c.id, text: c.text, publishedAt: c.created_at })))
    let clustered = 0
    let contradictions = 0
    for (const cl of clusters) {
      const fresh = cl.members.filter((m) => newClaims.some((n) => n.id === m))
      if (!fresh.length) continue
      for (const m of cl.members) {
        const row = byId.get(m)!
        if (row.cluster_id !== cl.representative) {
          await updateClaim(m, { cluster_id: cl.representative })
          clustered++
        }
      }
      if (cl.members.length > 1) {
        const found = findContradictions(cl.members.map((m) => ({ id: m, text: byId.get(m)!.text })))
        for (const f of found) {
          for (const [x, y] of [[f.a, f.b], [f.b, f.a]] as const) {
            const row = byId.get(x)!
            const flags = [...new Set([...(row.flags ?? []), 'contradiction' as const])]
            await updateClaim(x, { flags, contradicts: y })
          }
          contradictions++
        }
      }
    }
    console.log(`  clustered ${clustered} claims into ${clusters.length} clusters, ${contradictions} contradictions`)
  }

  console.log(`Done. ${detected} detected, ${noCandidates} without candidates, ${skipped} skipped, ${failed} failed; ${llmUsed} model passes; ${newClaims.length} new claims.`)
  if (failed && failed === docs.length) {
    console.error('Every document failed. Check the gateway credentials and the network.')
    process.exit(1)
  }
}

/** The [p.N] marker before an offset (Gallica snippets), else null. */
function pageOf(text: string, offset: number): number | null {
  const before = text.slice(0, offset)
  const m = [...before.matchAll(/\[p\.(\d+)\]/g)].pop()
  return m ? Number(m[1]) : null
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
