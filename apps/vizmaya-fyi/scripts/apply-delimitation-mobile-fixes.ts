/**
 * One-off: apply the three delimitation-2011-census mobile fixes from this
 * thread on top of whatever is currently in the DB. SURGICAL — reads the
 * current row, merges in only the specific fields, writes back. Other
 * sections / chart fields are untouched.
 *
 * Fixes applied:
 *   1. stories.config_yaml: add `mobileParagraphs: [[1, 2]]` to the
 *      `stat-850` section if absent.
 *   2. stories.config_yaml: add `mobileParagraphs: [[0, 2]]` to the
 *      `methodology` section if absent.
 *   3. chart_data (slug=delimitation-2011-census, chart_id=regional-share-change):
 *      merge { interval: 0, fontSize: 10, rotate: 30 } into option.xAxis.axisLabel,
 *      preserving any other axisLabel fields (e.g. color).
 *
 * Idempotent — re-running is a no-op once all three patches have landed.
 *
 * Usage:
 *   npx tsx scripts/apply-delimitation-mobile-fixes.ts            # apply
 *   npx tsx scripts/apply-delimitation-mobile-fixes.ts --dry-run  # log only
 */

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { parse, stringify } from 'yaml'
import { createServiceClient } from '../lib/supabase'

const SLUG = 'delimitation-2011-census'
const CHART_ID = 'regional-share-change'

const dryRun = process.argv.includes('--dry-run')

interface Section {
  id?: string
  mobileParagraphs?: unknown
  [k: string]: unknown
}

async function main() {
  const sb = createServiceClient()

  // --- 1) config_yaml patch ---------------------------------------------
  const { data: storyRow, error: storyErr } = await sb
    .from('stories')
    .select('config_yaml')
    .eq('slug', SLUG)
    .maybeSingle()
  if (storyErr) throw new Error(`stories select: ${storyErr.message}`)
  if (!storyRow?.config_yaml) throw new Error(`no config_yaml for ${SLUG} — restore first?`)

  const config = parse(storyRow.config_yaml as string) as { sections?: Section[] }
  let patches = 0
  for (const section of config.sections ?? []) {
    if (section.id === 'stat-850' && section.mobileParagraphs == null) {
      section.mobileParagraphs = [[1, 2]]
      patches++
      console.log('  + stat-850: mobileParagraphs = [[1, 2]]')
    }
    if (section.id === 'methodology' && section.mobileParagraphs == null) {
      section.mobileParagraphs = [[0, 2]]
      patches++
      console.log('  + methodology: mobileParagraphs = [[0, 2]]')
    }
  }
  if (patches === 0) console.log('  · config_yaml: already up to date')
  else if (!dryRun) {
    const newYaml = stringify(config)
    const { error } = await sb
      .from('stories')
      .update({ config_yaml: newYaml, updated_at: new Date().toISOString() })
      .eq('slug', SLUG)
    if (error) throw new Error(`stories update: ${error.message}`)
    console.log(`  ✓ stories.config_yaml: ${patches} patch(es) written`)
  } else {
    console.log(`  (dry run — would write ${patches} patch(es))`)
  }

  // --- 2) chart_data patch ---------------------------------------------
  const { data: chartRow, error: chartErr } = await sb
    .from('chart_data')
    .select('data')
    .eq('slug', SLUG)
    .eq('chart_id', CHART_ID)
    .maybeSingle()
  if (chartErr) throw new Error(`chart_data select: ${chartErr.message}`)
  if (!chartRow?.data) throw new Error(`no chart_data for ${SLUG}/${CHART_ID} — restore first?`)

  const chart = chartRow.data as {
    steps?: { option?: { xAxis?: { axisLabel?: Record<string, unknown> } } }[]
  }
  const xAxis = chart.steps?.[0]?.option?.xAxis
  if (!xAxis) throw new Error('chart shape unexpected: no steps[0].option.xAxis')

  const before = JSON.stringify(xAxis.axisLabel ?? {})
  xAxis.axisLabel = { ...(xAxis.axisLabel ?? {}), interval: 0, fontSize: 10, rotate: 30 }
  const after = JSON.stringify(xAxis.axisLabel)
  if (before === after) {
    console.log('  · chart_data: axisLabel already up to date')
  } else if (!dryRun) {
    const { error } = await sb
      .from('chart_data')
      .update({ data: chart, updated_at: new Date().toISOString() })
      .eq('slug', SLUG)
      .eq('chart_id', CHART_ID)
    if (error) throw new Error(`chart_data update: ${error.message}`)
    console.log(`  ✓ chart_data: axisLabel merged (interval=0, fontSize=10, rotate=30)`)
  } else {
    console.log(`  (dry run — would merge axisLabel)`)
  }

  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
