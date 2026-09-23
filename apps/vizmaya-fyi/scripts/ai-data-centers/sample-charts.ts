/**
 * Plan + render the sample edition's charts from the fixture stories and
 * write them into app/ai-data-centers/daily/sampleCharts.ts, so
 * /ai-data-centers/daily/sample shows what the composer produces — the
 * design reference for the planned charts, and the local check for the
 * whole path (planner → grounding → flint → ECharts SSR → page theming)
 * without touching the DB.
 *
 * Run:  pnpm ai-data-centers:sample-charts            (needs AI_GATEWAY_API_KEY)
 *       pnpm ai-data-centers:sample-charts -- --model opus
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { chartPlannerModel, planEditionCharts } from './editionCharts'
import { SAMPLE_EDITION } from '../../app/ai-data-centers/daily/fixture'
import { getDcStockMarket, listDataCenters } from '@vismay/content-source/epics'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

async function main() {
  const argv = process.argv.slice(2)
  const mi = argv.indexOf('--model')
  const model = mi >= 0 ? argv[mi + 1] : chartPlannerModel()
  const sample = SAMPLE_EDITION
  // The fixture has no close series or facility register of its own; with a
  // Supabase env present the real ones are used so the sample shows every
  // form the record charts can take. Without env the tape's bars stand in.
  const [market, facilities] = await Promise.all([
    getDcStockMarket(30).catch(() => undefined),
    listDataCenters().catch(() => undefined),
  ])
  console.log(`[sample-charts] ${sample.stories.length} stories · ${sample.ieaStories.length} iea · model ${model} · market ${market?.length ?? 'none'} · facilities ${facilities?.length ?? 'none'}`)
  const { charts, skips, modelUsed } = await planEditionCharts({
    stories: sample.stories,
    ieaStories: sample.ieaStories,
    papers: sample.papers,
    tape: sample.tape,
    market,
    perEdition: sample.energy.perEdition,
    facilities: facilities ?? [],
    model,
    log: (l) => console.log(l),
  })
  for (const s of skips) console.log(`  ${s.section}: template — ${s.reason}`)
  const out = resolve(__dirname, '../../app/ai-data-centers/daily/sampleCharts.ts')
  const body =
    `import type { EditionChartSkip, EditionCharts } from '@vismay/content-source/dcEditionTypes'\n\n` +
    `/**\n * The sample edition's planned charts. Generated from the fixture stories by\n * \`pnpm ai-data-centers:sample-charts\` (scripts/ai-data-centers/sample-charts.ts),\n * which runs the real planner + renderer against fixture.ts and writes this\n * file; empty means the sample draws its templates.\n *\n * Model: ${modelUsed ?? 'none'} · ${new Date().toISOString().slice(0, 10)}\n */\n` +
    `export const SAMPLE_CHARTS: EditionCharts = ${JSON.stringify(charts, null, 2)}\n\n` +
    `export const SAMPLE_CHART_SKIPS: EditionChartSkip[] = ${JSON.stringify(skips, null, 2)}\n`
  writeFileSync(out, body, 'utf8')
  console.log(`[sample-charts] wrote ${out} · ${Object.keys(charts).length} charts, ${skips.length} skips`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
