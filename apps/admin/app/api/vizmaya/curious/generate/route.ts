import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { defaultDeps, describeBrief, LLM_RULES, runLlmDesk, type LlmBrief } from '@vismay/curious-pipeline/llm'
import { knownClaims, writeCheckedClaims } from '@vismay/curious-pipeline/llmStore'
import { ERAS, REGION_IDS, THEME_IDS } from '@vismay/curious-pipeline/taxonomy'

/**
 * POST /api/vizmaya/curious/generate { era?, theme?, region?, hint?, count? }
 * → { written, dropped, queries, results, proposed, errors }.
 *
 * The Curious Desk's on-demand LLM run (packages/curious-pipeline/src/llm.ts):
 * a model researches the brief with the AI Gateway's web search and proposes
 * claims citing the pages it found; each page is read once under robots.txt;
 * a second model checks each claim against those pages, grades it and picks a
 * verbatim evidence quote; survivors land in the review queue as in_review.
 * Admin-auth gated, same-origin only. A run of 5 takes one to three minutes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
}

const pickOne = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null)

export async function POST(req: Request) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  let body: Record<string, unknown>
  try {
    body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
  } catch {
    return fail('Expected a JSON object', 400)
  }
  const hint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 300) : ''
  const count = Math.min(LLM_RULES.maxCount, Math.max(1, Math.round(Number(body.count) || 5)))
  const brief: LlmBrief = {
    era: pickOne(body.era, ERAS.map((e) => e.id)),
    theme: pickOne(body.theme, THEME_IDS),
    region: pickOne(body.region, REGION_IDS),
    hint: hint || null,
    count,
  }
  try {
    const log: string[] = []
    const [deps, known] = await Promise.all([defaultDeps(), knownClaims()])
    const run = await runLlmDesk(brief, { ...deps, ...known, log: (s) => log.push(s) })
    const by = (await adminEmail()) ?? 'admin'
    const write = await writeCheckedClaims(run.kept, { query: describeBrief(run.brief).replace(/\n/g, ' · '), requestedBy: by })
    console.log(`[curious-generate] ${by}: ${write.written.length} written, ${run.dropped.length} dropped\n${log.join('\n')}`)
    return NextResponse.json(
      { written: write.written, dropped: run.dropped, queries: run.queries, results: run.results, proposed: run.proposed, errors: write.errors },
      { headers: PRIVATE_HEADERS },
    )
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The run failed', 500)
  }
}
