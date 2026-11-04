/**
 * The pilot's editorial evaluation (the design's step 8): draw a stratified
 * sample of graded claims for a reviewer, then measure the two numbers that
 * matter: verified claims per reviewer-hour and the grade's agreement with
 * the human verdict.
 *
 * Usage:
 *   pnpm curious:evaluate -- --sample 100            # tag a batch across grades, queue it, print the review table
 *   pnpm curious:evaluate -- --report <batch>        # after the review: approval rate per grade, grade vs verdict, claims per reviewer-hour
 *   pnpm curious:evaluate -- --report latest
 *
 * A batch is recorded in score_features.eval_batch so a later re-grade keeps it.
 */

import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import type { ClaimRow } from '@vismay/curious-pipeline/types'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const GRADES = ['A', 'B', 'C', 'D', 'E'] as const

function parseArgs(argv: string[]) {
  const a: { sample: number | null; report: string | null } = { sample: null, report: null }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--') continue
    if (k === '--sample') a.sample = Number(argv[++i])
    else if (k === '--report') a.report = argv[++i]
    else throw new Error(`Unknown flag ${k}`)
  }
  if (a.sample == null && !a.report) a.sample = 100
  return a
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

async function sample(n: number) {
  const sb = createServiceClient()
  const batch = `eval-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await sb.from('curious_claims').select('*').in('status', ['graded', 'in_review']).not('grade', 'is', null).order('created_at', { ascending: false }).limit(5000)
  if (error) throw new Error(error.message)
  const claims = (data ?? []) as ClaimRow[]
  if (!claims.length) {
    console.log('No graded claims to sample. Run pnpm curious:grade first.')
    return
  }
  const per = Math.ceil(n / GRADES.length)
  const picked: ClaimRow[] = []
  for (const g of GRADES) picked.push(...shuffle(claims.filter((c) => c.grade === g), 42).slice(0, per))
  if (picked.length < n) picked.push(...shuffle(claims.filter((c) => !picked.includes(c)), 7).slice(0, n - picked.length))
  const docIds = [...new Set(picked.map((c) => c.document_id))]
  const { data: docs } = await sb.from('curious_documents').select('id, title, publisher, canonical_url').in('id', docIds)
  const doc = new Map(((docs ?? []) as Array<{ id: string; title: string | null; publisher: string | null; canonical_url: string }>).map((d) => [d.id, d]))
  for (const c of picked) {
    const { error: upErr } = await sb
      .from('curious_claims')
      .update({ status: 'in_review', score_features: { ...(c.score_features ?? {}), eval_batch: batch, eval_queued_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
      .eq('id', c.id)
    if (upErr) throw new Error(upErr.message)
  }
  console.log(`# Evaluation batch ${batch}: ${picked.length} claims queued for review\n`)
  console.log('Open /vizmaya/curious (In review), work through them with a/s/r, then run: pnpm curious:evaluate -- --report ' + batch + '\n')
  console.log('| Grade | Claim | Evidence | Source |')
  console.log('|---|---|---|---|')
  for (const c of picked.sort((a, b) => (a.grade ?? '').localeCompare(b.grade ?? ''))) {
    const d = doc.get(c.document_id)
    console.log(`| ${c.grade} | ${c.text.replace(/\|/g, '/')} | "${c.evidence_quote.replace(/\|/g, '/').slice(0, 120)}" | ${d?.publisher ?? d?.title ?? ''} ${d?.canonical_url ?? ''} |`)
  }
}

async function report(batchArg: string) {
  const sb = createServiceClient()
  const { data, error } = await sb.from('curious_claims').select('*').not('score_features->eval_batch', 'is', null).order('reviewed_at', { ascending: true }).limit(5000)
  if (error) throw new Error(error.message)
  const all = (data ?? []) as ClaimRow[]
  const batches = [...new Set(all.map((c) => (c.score_features as { eval_batch?: string })?.eval_batch).filter((b): b is string => !!b))].sort()
  const batch = batchArg === 'latest' ? batches[batches.length - 1] : batchArg
  if (!batch) {
    console.log('No evaluation batch found. Run pnpm curious:evaluate -- --sample 100 first.')
    return
  }
  const rows = all.filter((c) => (c.score_features as { eval_batch?: string })?.eval_batch === batch)
  const reviewed = rows.filter((c) => c.reviewed_at && c.status !== 'in_review')
  console.log(`# Evaluation report for ${batch}\n`)
  console.log(`${rows.length} claims in the batch, ${reviewed.length} reviewed, ${rows.length - reviewed.length} still queued.\n`)
  console.log('| Grade | Queued | Reviewed | Approved | Sent back | Rejected | Approval rate |')
  console.log('|---|---|---|---|---|---|---|')
  for (const g of GRADES) {
    const q = rows.filter((c) => c.grade === g)
    const r = q.filter((c) => c.reviewed_at && c.status !== 'in_review')
    const ap = r.filter((c) => c.status === 'approved').length
    const sb_ = r.filter((c) => c.status === 'sent_back').length
    const rj = r.filter((c) => c.status === 'rejected').length
    console.log(`| ${g} | ${q.length} | ${r.length} | ${ap} | ${sb_} | ${rj} | ${r.length ? `${Math.round((100 * ap) / r.length)}%` : ''} |`)
  }
  // Agreement: an A/B claim should be approved, a D/E one sent back or rejected; C can go either way.
  const expectApprove = reviewed.filter((c) => c.grade === 'A' || c.grade === 'B')
  const expectDoubt = reviewed.filter((c) => c.grade === 'D' || c.grade === 'E')
  const agreeHigh = expectApprove.filter((c) => c.status === 'approved').length
  const agreeLow = expectDoubt.filter((c) => c.status !== 'approved').length
  console.log(`\nGrade agreement: A/B approved ${agreeHigh}/${expectApprove.length}; D/E not approved ${agreeLow}/${expectDoubt.length}.`)
  // Reviewer-hours: the gaps between consecutive reviews under 20 minutes count as review time; longer gaps are breaks.
  const times = reviewed.map((c) => Date.parse(c.reviewed_at!)).sort((a, b) => a - b)
  let activeMs = 0
  for (let i = 1; i < times.length; i++) {
    const gap = times[i]! - times[i - 1]!
    activeMs += gap < 20 * 60_000 ? gap : 3 * 60_000
  }
  const hours = activeMs / 3_600_000
  const approved = reviewed.filter((c) => c.status === 'approved').length
  if (reviewed.length >= 2 && hours > 0) {
    console.log(`Reviewer time (gaps under 20 min, 3 min per break): ${hours.toFixed(2)} h for ${reviewed.length} claims = ${(reviewed.length / hours).toFixed(1)} claims per reviewer-hour, ${(approved / hours).toFixed(1)} verified claims per reviewer-hour.`)
  } else console.log('Not enough reviewed claims yet to estimate claims per reviewer-hour.')
  const byReviewer = new Map<string, number>()
  for (const c of reviewed) byReviewer.set(c.reviewed_by ?? 'unknown', (byReviewer.get(c.reviewed_by ?? 'unknown') ?? 0) + 1)
  console.log(`Reviewers: ${[...byReviewer.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log('\nThe second number the design asks for, corrections after publish, is read from the html_stories versions of stories tied to Curious spins once there are any.')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.report) await report(args.report)
  else await sample(args.sample ?? 100)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
