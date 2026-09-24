/**
 * AI Data Centers daily snapshot — arXiv papers ingest.
 *
 * Feeds the edition's "New research" chapter. Queries the arXiv API for
 * papers submitted in the window across six categories (cs.AI, cs.CL, cs.LG,
 * cs.CV, cs.AR, cs.DC), narrows them with a cheap title-and-abstract keyword
 * gate, then has Claude Haiku keep the papers with a data-center-scale or
 * frontier-AI bearing and extract the fields the chapter renders: area,
 * benchmark, baseline → result, compute bucket, scale, what was released and
 * a one-line "why it matters". Target 6–10 kept papers a day.
 *
 * Run locally:  pnpm ai-data-centers:ingest-papers
 *               pnpm ai-data-centers:ingest-papers -- --hours 48
 *               pnpm ai-data-centers:ingest-papers -- --dry-run
 * Run in CI:    .github/workflows/ingest-dc-papers.yml (daily 07:00 UTC,
 *               before the 06:15 edition composer)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — write dc_papers
 *   ANTHROPIC_API_KEY                                   — the paper gate
 *
 * Idempotency: arxiv_id is the primary key; gated-out candidates persist with
 * relevant=false so they are never re-sent to the model. arXiv asks for a
 * 3-second gap between API calls, so paging is sequential and slow by design.
 */

import Anthropic from '@anthropic-ai/sdk'
import { JSDOM } from 'jsdom'
import { config as loadEnv } from 'dotenv'
import {
  listKnownArxivIds,
  upsertDcPapers,
  type DcPaperUpsert,
} from '@vismay/content-source/dcEditions'
import { DC_PAPER_AREA_KEYS, type DcPaperArea, type DcPaperKind } from '@vismay/content-source/dcEditionTypes'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const ARXIV_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'cs.AR', 'cs.DC']
const ARXIV_PAGE = 200
const ARXIV_MAX_PAGES = 5
const ARXIV_GAP_MS = 3_100
const DEFAULT_HOURS = 36
/** Candidates that reach the model after the keyword gate. */
const MAX_CANDIDATES = 60
const GATE_MODEL = 'claude-haiku-4-5'
const GATE_VERSION = 'papers-v1-2026-09'
const CONCURRENCY = 3
const DEADLINE_MS = 22 * 60_000

interface Args {
  hours: number
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { hours: DEFAULT_HOURS, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    if (a === '--hours') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --hours value: ${argv[i]}`)
      args.hours = n
    } else if (a === '--dry-run') args.dryRun = true
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

// ---------------------------------------------------------------------------
// arXiv Atom feed

interface ArxivEntry {
  id: string
  title: string
  abstract: string
  authors: string[]
  affiliations: string[]
  primaryCategory: string | null
  categories: string[]
  publishedAt: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function arxivQueryUrl(start: number): string {
  const q = ARXIV_CATEGORIES.map((c) => `cat:${c}`).join('+OR+')
  return `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&start=${start}&max_results=${ARXIV_PAGE}`
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function fetchArxivPage(start: number): Promise<ArxivEntry[]> {
  const res = await fetch(arxivQueryUrl(start), {
    headers: { 'user-agent': 'vizmaya-ai-data-centers-papers/1.0 (+https://vizmaya.fyi)' },
  })
  if (!res.ok) throw new Error(`arXiv query failed: ${res.status} ${res.statusText}`)
  const xml = await res.text()
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  const doc = dom.window.document
  const out: ArxivEntry[] = []
  for (const entry of doc.getElementsByTagName('entry')) {
    const rawId = text(entry.getElementsByTagName('id')[0])
    const m = rawId.match(/abs\/([^v]+)(v\d+)?$/)
    if (!m) continue
    const authors: string[] = []
    const affiliations = new Set<string>()
    for (const a of entry.getElementsByTagName('author')) {
      const name = text(a.getElementsByTagName('name')[0])
      if (name) authors.push(name)
      for (const aff of a.getElementsByTagName('arxiv:affiliation')) {
        const t = text(aff)
        if (t) affiliations.add(t)
      }
    }
    const primary = entry.getElementsByTagName('arxiv:primary_category')[0]?.getAttribute('term') ?? null
    const categories: string[] = []
    for (const c of entry.getElementsByTagName('category')) {
      const term = c.getAttribute('term')
      if (term) categories.push(term)
    }
    out.push({
      id: m[1],
      title: text(entry.getElementsByTagName('title')[0]),
      abstract: text(entry.getElementsByTagName('summary')[0]),
      authors,
      affiliations: [...affiliations],
      primaryCategory: primary ?? categories[0] ?? null,
      categories,
      publishedAt: new Date(text(entry.getElementsByTagName('published')[0])).toISOString(),
    })
  }
  return out
}

async function fetchWindow(since: Date): Promise<ArxivEntry[]> {
  const all: ArxivEntry[] = []
  for (let page = 0; page < ARXIV_MAX_PAGES; page++) {
    let entries: ArxivEntry[]
    try {
      entries = await fetchArxivPage(page * ARXIV_PAGE)
    } catch (err) {
      console.warn(`  arXiv page ${page} failed (${err instanceof Error ? err.message : err}) — retrying once`)
      await sleep(8_000)
      entries = await fetchArxivPage(page * ARXIV_PAGE)
    }
    console.log(`  page ${page}: ${entries.length} entries`)
    if (entries.length === 0) break
    let reachedWindowStart = false
    for (const e of entries) {
      if (Date.parse(e.publishedAt) < since.getTime()) {
        reachedWindowStart = true
        continue
      }
      all.push(e)
    }
    if (reachedWindowStart || entries.length < ARXIV_PAGE) break
    await sleep(ARXIV_GAP_MS)
  }
  return all
}

// ---------------------------------------------------------------------------
// Keyword gate — category filter first, then a cheap title-and-abstract score
// before the model sees anything.

const KEYWORDS: [RegExp, number][] = [
  [/\blarge language model|\bLLMs?\b|foundation model|frontier model/i, 3],
  [/\bscaling law|\bscal(e|ing) (up|to)\b|trillion|billion.param|\b\d+B\b/i, 3],
  [/\binference\b|\bserving\b|\bthroughput\b|\blatency\b|\bkv.?cache|speculative decod/i, 2],
  [/\bpre-?training\b|\btraining (run|efficiency|cost)|\bdistill|\bmixture.of.experts|\bMoE\b/i, 2],
  [/\bGPU|\bTPU|\baccelerator|\bHBM\b|\bmemory bandwidth|\bFLOPs?\b/i, 3],
  [/\bdata ?cent(er|re)|\bcluster|\bdatacenter|\benergy|\bpower (cap|consumption|efficiency)|\bcarbon/i, 3],
  [/\bbenchmark|\bevaluation|\bcontamination|\bleaderboard/i, 1],
  [/\balignment|\bsafety|\bjailbreak|\bdeception|\binterpretab|\bred.team/i, 2],
  [/\breasoning|\bchain.of.thought|\bagent(s|ic)?\b|\btool.use|\bself.play/i, 2],
  [/\bmultimodal|\bvision.language|\bvideo|\bdiffusion\b|\bgeneration\b/i, 1],
  [/\bopen.?(weights|source)|\bwe release|\bcode is available|\bcheckpoints?\b/i, 1],
  [/\bstate.of.the.art|\bSOTA\b|\boutperform|\bnew record/i, 1],
]

function keywordScore(e: ArxivEntry): number {
  const hay = `${e.title} ${e.abstract}`
  let s = 0
  for (const [re, w] of KEYWORDS) if (re.test(hay)) s += w
  // Small-scope signals that rarely bear on the frontier.
  if (/\bmedical|\bclinical|\bradiolog|\bagricultur|\bsurvey\b|\btutorial\b|\bworkshop\b/i.test(hay)) s -= 3
  return s
}

// ---------------------------------------------------------------------------
// Model gate + extraction

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

const GATE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    area: nullable({ type: 'string', enum: DC_PAPER_AREA_KEYS }),
    kind: nullable({ type: 'string', enum: ['lab', 'academic', 'mixed'] }),
    affiliations: { type: 'string' },
    bench: { type: 'string' },
    baseline: nullable({ type: 'number' }),
    result: nullable({ type: 'number' }),
    unit: { type: 'string', enum: ['pts', '×', '%', ''] },
    compute_bucket: { type: 'integer', enum: [0, 1, 2, 3] },
    scale: { type: 'string' },
    weights_released: { type: 'boolean' },
    code_released: { type: 'boolean' },
    why: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'relevant', 'importance', 'area', 'kind', 'affiliations', 'bench', 'baseline', 'result', 'unit',
    'compute_bucket', 'scale', 'weights_released', 'code_released', 'why', 'tags',
  ],
  additionalProperties: false,
}

const GATE_SYSTEM = `You screen new arXiv papers for a daily briefing read by people who run, fund and regulate AI data centers. Keep a paper only when it bears on frontier AI or data-center-scale compute: how large models are trained, served, evaluated, aligned or made cheaper; what it costs in compute, memory, power or carbon; what is released. Narrow applications, surveys, tutorials, workshop notes and small-scale domain studies are out.

For a kept paper extract, from the title and abstract ONLY (never estimate beyond what is stated, use null / empty when not stated):
- importance 1–5: 5 = a result the whole field will cite this month; 1 = marginal.
- area: "reason" (reasoning & agents) · "arch" (architectures & training) · "infer" (inference efficiency) · "multi" (multimodal) · "align" (alignment & safety) · "evalb" (evaluation & benchmarks).
- kind: "lab" (industry lab), "academic", "mixed" — from the affiliations if they are stated; null otherwise.
- affiliations: as stated in the author list or abstract (e.g. "Google DeepMind", "Tsinghua · Zhipu AI"); empty string when not stated. Do not guess.
- bench: the benchmark or metric the headline result is on ("GPQA Diamond", "tokens / joule", "held-out AUROC"); empty when none.
- baseline and result: the headline numbers as stated. unit: "pts" for benchmark points/accuracy, "×" for a multiplier (result = the multiple, baseline 1), "%" for a relative change (result = the signed percentage, baseline 0), "" otherwise.
- compute_bucket: estimated compute of the headline experiment from the stated scale — 0: <10^22 FLOP (probes, small models, audits) · 1: 10^22–10^23 (≤ ~10B models, fine-tunes) · 2: ~10^24 (10–70B training or large-scale RL) · 3: >10^25 (frontier-scale).
- scale: the model size or setting in 2–5 words ("70B-class", "8B dense", "probe on 4 families", "audit").
- weights_released / code_released: true only if the abstract says so.
- why: one sentence, ≤ 32 words, on why it matters to this audience — concrete, no hype.
- tags: 2–3 short tags ("Reasoning", "Efficiency", "Open weights").

For a rejected paper set relevant=false, importance 1, area null, kind null, empty strings, nulls, compute_bucket 0, false, empty tags.

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{"relevant": true, "importance": 4, "area": "infer", "kind": "lab", "affiliations": "Microsoft Research", "bench": "tokens / joule", "baseline": 1, "result": 2.3, "unit": "×", "compute_bucket": 1, "scale": "7B–70B", "weights_released": false, "code_released": true, "why": "Quantifies tokens per joule across four accelerator generations — the efficiency metric operators actually pay for.", "tags": ["Inference", "Energy"]}`

interface Gate {
  relevant: boolean
  importance: number
  area: DcPaperArea | null
  kind: DcPaperKind | null
  affiliations: string
  bench: string
  baseline: number | null
  result: number | null
  unit: string
  computeBucket: number
  scale: string
  weightsReleased: boolean
  codeReleased: boolean
  why: string
  tags: string[]
}

const REJECTED: Gate = {
  relevant: false, importance: 1, area: null, kind: null, affiliations: '', bench: '', baseline: null, result: null,
  unit: '', computeBucket: 0, scale: '', weightsReleased: false, codeReleased: false, why: '', tags: [],
}

const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().slice(0, max) : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function normalise(p: Record<string, unknown>): Gate {
  if (p.relevant !== true) return REJECTED
  const importance = Math.min(5, Math.max(1, Math.round(Number(p.importance) || 1)))
  return {
    relevant: true,
    importance,
    area: typeof p.area === 'string' && (DC_PAPER_AREA_KEYS as string[]).includes(p.area) ? (p.area as DcPaperArea) : null,
    kind: p.kind === 'lab' || p.kind === 'academic' || p.kind === 'mixed' ? p.kind : null,
    affiliations: clip(p.affiliations, 120),
    bench: clip(p.bench, 60),
    baseline: num(p.baseline),
    result: num(p.result),
    unit: ['pts', '×', '%', ''].includes(String(p.unit)) ? String(p.unit) : '',
    computeBucket: Math.min(3, Math.max(0, Math.round(Number(p.compute_bucket) || 0))),
    scale: clip(p.scale, 40),
    weightsReleased: p.weights_released === true,
    codeReleased: p.code_released === true,
    why: clip(p.why, 300),
    tags: (Array.isArray(p.tags) ? p.tags : []).filter((t): t is string => typeof t === 'string').map((t) => clip(t, 24)).filter(Boolean).slice(0, 4),
  }
}

let useSchema = true

async function gate(anthropic: Anthropic, e: ArxivEntry): Promise<Gate> {
  const user = `arXiv:${e.id} · ${e.primaryCategory ?? ''} · ${e.publishedAt.slice(0, 10)}
Title: ${e.title}
Authors: ${e.authors.slice(0, 12).join(', ')}${e.authors.length > 12 ? ' et al.' : ''}
${e.affiliations.length ? `Affiliations (stated): ${e.affiliations.join(' · ')}\n` : ''}Abstract: ${e.abstract.slice(0, 2400)}`
  let text = ''
  try {
    const response = await anthropic.messages.create({
      model: GATE_MODEL,
      max_tokens: 600,
      system: GATE_SYSTEM,
      messages: [{ role: 'user', content: user }],
      ...(useSchema ? { output_config: { format: { type: 'json_schema', schema: GATE_SCHEMA } } } : {}),
    })
    for (const block of response.content) {
      if (block.type === 'text') {
        text = block.text
        break
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (useSchema && /schema|output_config|output_format/i.test(msg) && /400|invalid/i.test(msg)) {
      console.warn('  ! structured output schema rejected — falling back to plain JSON for this run')
      useSchema = false
      return gate(anthropic, e)
    }
    throw err
  }
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  try {
    const parsed = JSON.parse(t)
    return parsed && typeof parsed === 'object' ? normalise(parsed as Record<string, unknown>) : REJECTED
  } catch {
    return REJECTED
  }
}

/** "Novak, Adeyemi, Sørensen" (+ " et al." beyond three). */
function authorLine(authors: string[]): string | null {
  if (authors.length === 0) return null
  const surnames = authors.slice(0, 3).map((a) => a.trim().split(/\s+/).pop() ?? a)
  return surnames.join(', ') + (authors.length > 3 ? ' et al.' : '')
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await worker(items[cursor++])
    }),
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 })
  const startedAt = Date.now()
  const since = new Date(startedAt - args.hours * 3_600_000)

  console.log(`[papers] arXiv ${ARXIV_CATEGORIES.join(', ')} since ${since.toISOString()}${args.dryRun ? ' (dry)' : ''}`)
  const entries = await fetchWindow(since)
  console.log(`[papers] ${entries.length} submissions in the window`)
  if (entries.length === 0) return

  const known = args.dryRun ? new Set<string>() : await listKnownArxivIds(entries.map((e) => e.id))
  const fresh = entries.filter((e) => !known.has(e.id))
  console.log(`[papers] ${fresh.length} not yet in dc_papers`)

  const scored = fresh
    .map((e) => ({ e, score: keywordScore(e) }))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, MAX_CANDIDATES).map((x) => x.e)
  console.log(`[papers] ${scored.length} pass the keyword gate → ${candidates.length} candidates to the model`)

  const rows: DcPaperUpsert[] = []
  let kept = 0
  let failed = 0
  let skipped = 0
  await pool(candidates, CONCURRENCY, async (e) => {
    if (Date.now() - startedAt > DEADLINE_MS) {
      skipped++
      return
    }
    try {
      let g: Gate
      try {
        g = await gate(anthropic, e)
      } catch {
        await sleep(5000)
        g = await gate(anthropic, e)
      }
      rows.push({
        arxiv_id: e.id,
        title: e.title,
        abstract: e.abstract.slice(0, 4000),
        authors: authorLine(e.authors),
        affiliations: g.affiliations || (e.affiliations.length ? e.affiliations.slice(0, 3).join(' · ') : null),
        kind: g.kind,
        category: e.primaryCategory,
        area: g.area,
        bench: g.bench || null,
        baseline: g.baseline,
        result: g.result,
        unit: g.unit,
        compute_bucket: g.relevant ? g.computeBucket : null,
        scale: g.scale || null,
        weights_released: g.weightsReleased,
        code_released: g.codeReleased,
        why: g.why || null,
        tags: g.tags,
        importance: g.relevant ? g.importance : null,
        relevant: g.relevant,
        published_at: e.publishedAt,
        classifier_version: GATE_VERSION,
      })
      if (g.relevant) {
        kept++
        console.log(`  ✓ [${g.importance}] arXiv:${e.id} ${e.title.slice(0, 80)}  →  ${g.area ?? '?'} · ${g.bench || 'no bench'}`)
      } else {
        console.log(`  · arXiv:${e.id} ${e.title.slice(0, 80)}  →  out`)
      }
      await sleep(300)
    } catch (err) {
      failed++
      console.error(`  ✗ arXiv:${e.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  if (failed > 0 && rows.length === 0) {
    throw new Error(`All ${failed} paper-gate calls failed — check ANTHROPIC_API_KEY / account credits`)
  }

  if (args.dryRun) {
    console.log('\n----- kept papers (dry run, not written) -----')
    for (const r of rows.filter((r) => r.relevant)) console.log(JSON.stringify(r, null, 1))
    return
  }

  const written = await upsertDcPapers(rows)
  if (skipped > 0) console.log(`\n[papers] deadline reached — ${skipped} candidates left for the next run`)
  console.log(`\n[papers] done: ${kept} kept, ${written - kept} rejected, ${failed} failed (${written} rows written)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
