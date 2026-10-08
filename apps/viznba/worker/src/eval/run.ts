/**
 * viznba eval CLI.
 *
 * Run via: pnpm --filter @viznba/worker eval
 * Env (all optional): EVAL_SINCE EVAL_MAX EVAL_CONCURRENCY EVAL_JUDGE_MODEL EVAL_OUTPUT_DIR
 *                     EVAL_RERUN_EXTRACTION=1 (re-run HEAD's pipeline on the sample)
 */

import { runEval, DEFAULT_JUDGE_MODEL } from '@vismay/eval-entities'
import { viznbaAdapter } from './adapter'

const since = process.env.EVAL_SINCE ?? '2026-10-01T00:00:00Z'
const max = Number(process.env.EVAL_MAX ?? 100)
const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 10)
const judgeModel = process.env.EVAL_JUDGE_MODEL || DEFAULT_JUDGE_MODEL
const outputDir = process.env.EVAL_OUTPUT_DIR
const rerunExtraction = process.env.EVAL_RERUN_EXTRACTION === '1'

runEval(viznbaAdapter, { since, max, concurrency, judgeModel, outputDir, rerunExtraction }).catch((e) => {
  console.error('[eval-entities] fatal:', e)
  process.exit(1)
})
