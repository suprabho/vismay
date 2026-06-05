/**
 * Verify harness for the story pipeline.
 *
 *   pnpm --filter @vismay/story-pipeline verify        # offline: ingest + validate + serialize
 *   RUN_LLM=1 pnpm --filter @vismay/story-pipeline verify   # also runs research + generate live
 *
 * The offline path proves the deterministic half (ingest, viz-engine validation,
 * serialization) with zero spend. The live path additionally exercises the two
 * LLM calls — it needs AI_GATEWAY_API_KEY in the environment.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import matter from 'gray-matter'
import {
  ingestSources,
  research,
  generateStory,
  validateStory,
  serializeStory,
  type GeneratedStory,
} from '../index'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

/** A hand-built deck story that exercises bigStat + chart + quote + bodyText. */
function staticStory(): GeneratedStory {
  return {
    slug: 'verify-rooftop-solar',
    format: 'deck',
    frontmatter: {
      title: "India's Rooftop Solar Surge",
      subtitle: 'A record year, concentrated in three states',
      byline: 'By the Vizmaya desk',
      date: '2026-06-05',
      format: 'deck',
      status: 'draft',
    },
    sections: [
      {
        heading: 'Cover',
        paragraphs: ['India added a record 18.7 GW of rooftop solar in FY26.'],
        kind: 'cover',
        body: { foreground: { layout: 'centered', regions: { content: [{ type: 'bodyText' }] } } },
      },
      {
        heading: 'A record year',
        paragraphs: ['Capacity rose 33% as residential installs crossed 10 million homes.'],
        kind: 'bigStat',
        body: {
          foreground: {
            layout: 'stat-left-chart-right',
            regions: {
              stat: [
                { type: 'bigStat', value: '18.7 GW', label: 'Added in FY26', delta: '+33% YoY', color: 'accent2' },
              ],
              chart: [{ type: 'chart', id: 'by-state' }],
            },
          },
        },
      },
      {
        heading: 'Why these states',
        paragraphs: ['Faster discom approvals and higher tariffs shortened payback periods.'],
        kind: 'quote',
        body: {
          foreground: {
            layout: 'text-left-quote-right',
            regions: {
              text: [{ type: 'bodyText' }],
              quote: [{ type: 'quote', text: 'Payback is under five years now.', attribution: 'A state official' }],
            },
          },
        },
      },
      {
        heading: 'The catch',
        paragraphs: ['Grid integration remains the binding constraint.'],
        kind: 'closing',
        body: { foreground: { layout: 'centered', regions: { content: [{ type: 'bodyText' }] } } },
      },
    ],
    charts: [
      {
        id: 'by-state',
        title: 'New capacity by state, FY26',
        chartType: 'bar',
        categories: ['Gujarat', 'Maharashtra', 'Rajasthan', 'Tamil Nadu', 'Karnataka'],
        series: [{ name: 'GW', data: [4.1, 3.6, 2.9, 1.8, 1.5] }],
        yLabel: 'GW',
      },
    ],
    imagePrompts: [
      { section: 'Cover', prompt: 'Aerial view of Indian rooftops covered in solar panels at golden hour', aspectRatio: '16:9' },
    ],
  }
}

async function offline(): Promise<void> {
  console.log('— ingest —')
  const sources = await ingestSources({
    files: [
      { name: 'sample.md', buffer: readFileSync(here('./sample.md')) },
      { name: 'sample.csv', buffer: readFileSync(here('./sample.csv')) },
    ],
  })
  assert(sources.length === 2, `expected 2 sources, got ${sources.length}`)
  assert(sources[0]!.body.includes('rooftop'), 'md body should carry article text')
  assert(sources[1]!.tables?.length === 1, 'csv should yield one table')
  console.log(`  ok — ${sources.length} sources (${sources.map((s) => s.title).join(', ')})`)

  console.log('— validate (against viz-engine schemas) —')
  const story = staticStory()
  const issues = validateStory(story)
  assert(issues.length === 0, `static story should be valid, got: ${JSON.stringify(issues)}`)
  console.log('  ok — static deck story passes viz-engine validation')

  console.log('— serialize —')
  const art = serializeStory(story)
  const fm = matter(art.markdown)
  assert(fm.data.title, 'markdown should have frontmatter title')
  assert(art.markdown.includes('## A record year'), 'markdown should have section anchors')
  const cfg = parseYaml(art.configYaml) as { defaults?: unknown; sections?: unknown[] }
  assert(Array.isArray(cfg.sections) && cfg.sections.length === 4, 'config should have 4 sections')
  assert(cfg.defaults, 'config should have a defaults block')
  assert(art.charts.length === 1, 'one chart json expected')
  const chart = JSON.parse(art.charts[0]!.json) as { steps?: unknown[] }
  assert(Array.isArray(chart.steps) && chart.steps.length === 1, 'chart json should have steps')
  console.log('  ok — md + config.yaml + chart json all well-formed')
}

async function live(): Promise<void> {
  console.log('— research (live LLM) —')
  const sources = await ingestSources({
    files: [{ name: 'sample.md', buffer: readFileSync(here('./sample.md')) }],
  })
  const brief = await research(sources)
  assert(brief.questions.length >= 3, 'research should ask >=3 questions')
  console.log(`  ok — format=${brief.suggestedFormat}, ${brief.questions.length} questions`)
  console.log(brief.questions.map((q) => `    • ${q.question}`).join('\n'))

  console.log('— generate (live LLM) —')
  // Answer each question with its first option (or a stub) to drive generation.
  const answers = Object.fromEntries(
    brief.questions.map((q) => [q.id, q.options?.[0] ?? 'Your editorial judgement']),
  )
  const { story, issues } = await generateStory({ sources, brief, answers })
  console.log(`  generated "${story.frontmatter.title}" — ${story.sections.length} sections, ${story.charts.length} charts`)
  if (issues.length) console.log(`  ⚠ residual issues:\n${issues.map((i) => `    - ${i.message}`).join('\n')}`)
  else console.log('  ok — generated story passes validation')
  const art = serializeStory(story)
  assert(art.markdown.includes('---'), 'serialized markdown should have frontmatter')
  console.log(`  ok — serialized slug "${art.slug}"`)
}

async function main(): Promise<void> {
  await offline()
  if (process.env.RUN_LLM === '1') await live()
  else console.log('\n(skipping live LLM path — set RUN_LLM=1 to run research + generate)')
  console.log('\n✓ verify passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
