/**
 * Build a SAMPLE story end-to-end (research → outline → charts → all sections)
 * and write it into a consumer app's fs content dir, so there's a real,
 * renderable story to develop and verify layouts against — especially the
 * map-overlay work. Runs straight through Anthropic (own quota) so it never
 * touches the AI-gateway budget.
 *
 *   pnpm --filter @vismay/story-pipeline build:sample                        # map, Adani → vizmaya content
 *   SAMPLE_FORMAT=deck SAMPLE_SLUG=_sample-adani-deck pnpm ... build:sample   # deck variant
 *   SAMPLE_SOURCES=/dir SAMPLE_OUT=/path/to/content/stories pnpm ... build:sample
 *
 * Written as `<slug>.md` + `<slug>.config.yaml` + `<slug>/charts/*.json` (the
 * exact fs layout the content-source loader reads). Frontmatter `status` is
 * `draft`, so the sample is reachable by URL for rendering but stays off the
 * public home grid. The slug is `_`-prefixed to mark it as a non-public sample.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, extname } from 'node:path'
import {
  ingestSources,
  research,
  generateStory,
  serializeStory,
  type ResearchBrief,
  type ComposeAnswers,
  type StoryFormat,
} from '../index'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

/** Best-effort dotenv read (no shell setup needed); a real env value wins. */
function loadEnvKey(relPath: string, key: string): void {
  if (process.env[key]) return
  try {
    const env = readFileSync(here(relPath), 'utf8')
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (m) process.env[key] = m[1]!.trim().replace(/^["']|["']$/g, '')
  } catch {
    /* ignore — the SDK throws a clear auth error if the key is truly absent */
  }
}

const EXT_OK = new Set(['.md', '.txt', '.csv', '.pdf', '.html', '.json'])
function sourceFiles(dir: string): Array<{ name: string; buffer: Buffer }> {
  const names = readdirSync(dir).filter((n) => EXT_OK.has(extname(n).toLowerCase()))
  if (names.length === 0) throw new Error(`no ingestable files in ${dir}`)
  return names.map((name) => ({ name, buffer: readFileSync(join(dir, name)) }))
}

async function main(): Promise<void> {
  loadEnvKey('../../../../.env.local', 'ANTHROPIC_API_KEY')
  process.env.STORY_PIPELINE_ANTHROPIC_DIRECT = '1'

  const format = (process.env.SAMPLE_FORMAT as StoryFormat) || 'map'
  if (format !== 'deck' && format !== 'map') throw new Error(`SAMPLE_FORMAT must be deck|map`)
  const slug = process.env.SAMPLE_SLUG || `_sample-adani-${format}`
  const outDir = process.env.SAMPLE_OUT || here('../../../../apps/vizmaya-fyi/content/stories')
  const srcDir = process.env.SAMPLE_SOURCES || here('./adani')

  console.log(`— ingest (${srcDir}) —`)
  const { sources } = await ingestSources({ files: sourceFiles(srcDir) })
  console.log(`  ${sources.length} source(s)`)

  console.log(`— research —`)
  const brief: ResearchBrief = await research(sources)
  // Auto-answer each question with its first option (the verify-harness convention).
  const answers: ComposeAnswers = Object.fromEntries(
    brief.questions.map((q) => [q.id, q.options?.[0] ?? 'Your editorial judgement']),
  )

  console.log(`— generate full story (format=${format}, via anthropic-direct) —`)
  const { story, issues } = await generateStory({ sources, brief, answers }, { format })
  story.slug = slug // stable, recognisable sample slug (overrides the title-derived one)
  console.log(
    `  "${story.frontmatter.title}" — ${story.sections.length} sections, ${story.charts.length} charts`,
  )
  if (issues.length) {
    console.log(`  ⚠ ${issues.length} validation issue(s):\n${issues.map((i) => `    - ${i.message}`).join('\n')}`)
  }

  const art = serializeStory(story)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, `${slug}.md`), art.markdown)
  writeFileSync(join(outDir, `${slug}.config.yaml`), art.configYaml)
  if (art.charts.length) {
    const chartDir = join(outDir, slug, 'charts')
    mkdirSync(chartDir, { recursive: true })
    for (const c of art.charts) writeFileSync(join(chartDir, `${c.id}.json`), c.json)
  }
  console.log(`\n✓ wrote sample '${slug}' → ${outDir}`)
  console.log(`  ${slug}.md · ${slug}.config.yaml · ${slug}/charts/*.json (${art.charts.length})`)
  console.log(`  render at: /story/${slug}/  (draft — off the home grid, reachable by URL)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
