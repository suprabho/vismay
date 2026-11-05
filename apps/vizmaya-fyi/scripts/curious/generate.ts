/**
 * Curious Desk, the LLM path: research a brief with web search, propose
 * claims citing the pages found, check each claim against those pages, and
 * queue the survivors for review (packages/curious-pipeline/src/llm.ts). The
 * same run the admin Curious claims tab's "Generate with LLM" button starts.
 *
 * Usage:
 *   pnpm curious:generate -- --count 5
 *   pnpm curious:generate -- --era long-19th --theme food-drink --region europe --hint "railway dining cars"
 *   pnpm curious:generate -- --count 3 --dry-run        # prints the checked claims, writes nothing
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_GATEWAY_API_KEY (or the gateway's OIDC).
 * Optional model overrides: CURIOUS_RESEARCH_MODEL, CURIOUS_PROPOSE_MODEL, CURIOUS_CHECK_MODEL (aliases like text.opus).
 */

import { config as loadEnv } from 'dotenv'
import { defaultDeps, describeBrief, runLlmDesk, type LlmBrief } from '@vismay/curious-pipeline/llm'
import { knownClaims, writeCheckedClaims } from '@vismay/curious-pipeline/llmStore'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

function parseArgs(argv: string[]): LlmBrief & { dryRun: boolean } {
  const a: LlmBrief & { dryRun: boolean } = { count: 5, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = () => argv[++i]
    if (k === '--count') a.count = Number(v())
    else if (k === '--era') a.era = v()
    else if (k === '--theme') a.theme = v()
    else if (k === '--region') a.region = v()
    else if (k === '--hint') a.hint = v()
    else if (k === '--dry-run') a.dryRun = true
    else if (k !== '--') throw new Error(`Unknown argument ${k}`)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const log = (s: string) => console.log(s)
  const [deps, known] = await Promise.all([defaultDeps({ log }), args.dryRun ? Promise.resolve({ avoid: [], knownHashes: new Set<string>() }) : knownClaims()])
  const models = { research: process.env.CURIOUS_RESEARCH_MODEL, propose: process.env.CURIOUS_PROPOSE_MODEL, check: process.env.CURIOUS_CHECK_MODEL }
  const run = await runLlmDesk(args, { ...deps, ...known, models, log })
  console.log(`\n${run.queries.length} searches · ${run.results} results · ${run.proposed} proposed · ${run.kept.length} kept · ${run.dropped.length} dropped`)
  if (args.dryRun) {
    for (const k of run.kept) {
      console.log(`\n[${k.grade}] ${k.text}\n  “${k.sources[k.evidence].quote}”\n  ${k.sources[k.evidence].url}`)
      for (const n of k.notes) console.log(`  - ${n}`)
    }
    return
  }
  const write = await writeCheckedClaims(run.kept, { query: describeBrief(run.brief).replace(/\n/g, ' · '), requestedBy: 'cli' })
  console.log(`${write.written.length} claims queued for review on /vizmaya/curious`)
  for (const e of write.errors) console.log(`::warning::${e}`)
  if (run.kept.length && !write.written.length && write.errors.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
