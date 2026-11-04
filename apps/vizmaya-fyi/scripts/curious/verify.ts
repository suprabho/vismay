/**
 * Curious Desk, stage 4: chase citations for graded claims. Crossref for
 * cited scholarship (and whether its references loop back), Google Books
 * for cited books and for whether a quotation exists in print, Wikidata for
 * the entities' dates and countries. Writes claim-source rows and entity
 * facts, then re-grades the claims it touched.
 *
 * Usage:
 *   pnpm curious:verify -- --limit 150          # the nightly budget
 *   pnpm curious:verify -- --claim <uuid>       # one claim
 *   pnpm curious:verify -- --dry-run --limit 5  # prints what it would write
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional CROSSREF_MAILTO (polite pool), GOOGLE_BOOKS_API_KEY.
 */

import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { gradeClaims } from '@vismay/curious-pipeline/gradeRun'
import { listClaims, listClaimSources, updateEntityFacts, upsertClaimSources } from '@vismay/curious-pipeline/store'
import { verifyClaim, verifyLimiters } from '@vismay/curious-pipeline/verify'
import { curiousEnv, type ClaimRow, type EntityKind } from '@vismay/curious-pipeline/types'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const DEADLINE_MS = Number(process.env.DEADLINE_MINUTES ?? 25) * 60_000

function parseArgs(argv: string[]) {
  const a: { limit: number; claim: string | null; dryRun: boolean } = { limit: 150, claim: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--') continue
    if (k === '--limit') a.limit = Number(argv[++i])
    else if (k === '--claim') a.claim = argv[++i]
    else if (k === '--dry-run') a.dryRun = true
    else throw new Error(`Unknown flag ${k}`)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()
  const env = curiousEnv()
  const started = Date.now()
  const { claims } = args.claim ? await listClaims({ sb, ids: [args.claim] }) : await listClaims({ sb, status: ['graded', 'in_review'], limit: args.limit * 3 })
  // Verify the ones never verified first: no verify-* source rows yet.
  const existing = await listClaimSources(claims.map((c) => c.id), sb)
  const todo = claims.filter((c) => args.claim || !(existing.get(c.id) ?? []).some((s) => s.verified_by.startsWith('verify-'))).slice(0, args.limit)
  console.log(`Curious verify: ${todo.length} claims${args.dryRun ? ' · DRY RUN' : ''}${env.crossrefMailto ? '' : ' · set CROSSREF_MAILTO for the polite pool'}`)
  const limiters = verifyLimiters()
  const touched: ClaimRow[] = []
  let errors = 0
  for (const c of todo) {
    if (Date.now() - started > DEADLINE_MS) {
      console.warn('  · soft deadline reached')
      break
    }
    const { data: ents } = await sb.from('curious_claim_entities').select('curious_entities(name, kind)').eq('claim_id', c.id)
    const entities = ((ents ?? []) as unknown as Array<{ curious_entities: { name: string; kind: EntityKind } | { name: string; kind: EntityKind }[] | null }>)
      .map((r) => (Array.isArray(r.curious_entities) ? r.curious_entities[0] : r.curious_entities))
      .filter((e): e is { name: string; kind: EntityKind } => !!e)
    const dois = (existing.get(c.id) ?? []).map((s) => s.external_ref).filter((r): r is string => !!r && r.startsWith('doi:')).map((r) => r.slice(4))
    let clusterDois: string[] = []
    if (c.cluster_id) {
      const { data: peers } = await sb.from('curious_claims').select('id').eq('cluster_id', c.cluster_id).neq('id', c.id)
      const peerIds = ((peers ?? []) as Array<{ id: string }>).map((p) => p.id)
      if (peerIds.length) {
        const peerSources = await listClaimSources(peerIds, sb)
        clusterDois = [...peerSources.values()].flat().map((s) => s.external_ref).filter((r): r is string => !!r && r.startsWith('doi:')).map((r) => r.slice(4))
      }
    }
    const r = await verifyClaim({ claimId: c.id, text: c.text, isQuotation: c.is_quotation, evidenceQuote: c.evidence_quote, entities, dois, clusterDois }, { env, limiters })
    console.log(`  ${c.text.slice(0, 70)} → ${r.sources.length} sources, ${r.entities.length} entities${r.errors.length ? `, ${r.errors.length} errors` : ''}`)
    for (const n of r.notes) console.log(`     · ${n}`)
    for (const e of r.errors) console.warn(`     ✗ ${e}`)
    errors += r.errors.length
    if (args.dryRun) continue
    await upsertClaimSources(r.sources, { sb })
    for (const [name, w] of r.wikidata) {
      const kind = entities.find((e) => e.name === name)?.kind ?? 'other'
      await updateEntityFacts({ name, kind }, { wikidata_qid: w.qid, birth_year: w.birthYear, death_year: w.deathYear, year: w.year, country_code: w.countryCode, is_living_private: w.isLivingPrivate }, sb)
    }
    touched.push(c)
  }
  if (!args.dryRun && touched.length) {
    const graded = await gradeClaims(touched, { sb })
    const changed = graded.filter((g) => g.grade !== touched.find((t) => t.id === g.id)?.grade).length
    console.log(`Re-graded ${graded.length} claims, ${changed} changed grade.`)
  }
  console.log(`Done. ${touched.length} verified${errors ? `, ${errors} source errors` : ''}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
