/**
 * vizf1 eval CLI.
 *
 * Run via: pnpm --filter @vizf1/worker eval
 * Env (all optional): EVAL_SINCE EVAL_MAX EVAL_CONCURRENCY EVAL_JUDGE_MODEL EVAL_OUTPUT_DIR
 */

import { runEval } from '@vismay/eval-entities'
import { vizf1Adapter } from './adapter'

const since = process.env.EVAL_SINCE ?? '2026-05-01T00:00:00Z'
const max = Number(process.env.EVAL_MAX ?? 100)
const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 10)
const judgeModel = process.env.EVAL_JUDGE_MODEL ?? 'gemini-3.1-pro-preview'
const outputDir = process.env.EVAL_OUTPUT_DIR
const rerunExtraction = process.env.EVAL_RERUN_EXTRACTION === '1'

runEval(vizf1Adapter, { since, max, concurrency, judgeModel, outputDir, rerunExtraction }).catch((e) => {
  console.error('[eval-entities] fatal:', e)
  process.exit(1)
})
