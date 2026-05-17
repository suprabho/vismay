/**
 * Format-agnostic source → Vizmaya story scaffold.
 *
 * Usage:
 *   npx tsx scripts/ingest-source.ts --input <file> --slug <slug> [--overwrite]
 *
 * Example:
 *   npx tsx scripts/ingest-source.ts \
 *     --input "../vizmaya-data/Gmail - How delimitation ... _ Data.pdf" \
 *     --slug delimitation-2011-census
 *
 * What it does:
 *   1. Extracts clean text from the input (pdf/eml/html/md/txt).
 *   2. Calls Gemini with the south-korea-gpu-hour story as a few-shot
 *      example, asking it to emit .md + .config.yaml + .share.yaml +
 *      one or more chart JSONs.
 *   3. Writes everything into content/stories/<slug>/ (refuses to
 *      overwrite unless --overwrite is passed).
 *
 * This produces a DRAFT. Map coordinates, chart selections, and pacing
 * still need human review before publishing — see the printed notes.
 */

import fs from 'fs'
import path from 'path'
import { extract } from './ingest/extract'
import { structure } from './ingest/structure'

const ROOT = path.resolve(__dirname, '..')
const STORIES_DIR = path.join(ROOT, 'content/stories')

// Load .env so GEMINI_API_KEY is picked up (same pattern as generate-audio).
const envPath = path.resolve(ROOT, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

interface Args {
  input: string
  slug: string
  overwrite: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let input: string | undefined
  let slug: string | undefined
  let overwrite = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--input') input = argv[++i]
    else if (a === '--slug') slug = argv[++i]
    else if (a === '--overwrite') overwrite = true
    else if (a === '-h' || a === '--help') {
      printUsageAndExit(0)
    } else {
      console.error(`unknown argument: ${a}`)
      printUsageAndExit(1)
    }
  }
  if (!input || !slug) {
    console.error('missing --input or --slug')
    printUsageAndExit(1)
  }
  return { input: input!, slug: slug!, overwrite }
}

function printUsageAndExit(code: number): never {
  console.error(
    'usage: npx tsx scripts/ingest-source.ts --input <file> --slug <slug> [--overwrite]'
  )
  process.exit(code)
}

async function main() {
  const args = parseArgs()

  const absInput = path.resolve(process.cwd(), args.input)
  if (!fs.existsSync(absInput)) {
    console.error(`input not found: ${absInput}`)
    process.exit(1)
  }

  const mdPath = path.join(STORIES_DIR, `${args.slug}.md`)
  const configPath = path.join(STORIES_DIR, `${args.slug}.config.yaml`)
  const sharePath = path.join(STORIES_DIR, `${args.slug}.share.yaml`)
  const chartsDir = path.join(STORIES_DIR, args.slug, 'charts')

  if (!args.overwrite) {
    for (const p of [mdPath, configPath, sharePath]) {
      if (fs.existsSync(p)) {
        console.error(`refusing to overwrite ${path.relative(ROOT, p)} — pass --overwrite to force`)
        process.exit(1)
      }
    }
  }

  console.log(`[ingest] extracting ${path.relative(ROOT, absInput)}`)
  const source = await extract(absInput)
  console.log(`[ingest] title:  ${source.title}`)
  console.log(`[ingest] byline: ${source.byline ?? '(none)'}`)
  console.log(`[ingest] body:   ${source.body.length} chars`)

  console.log(`[ingest] calling Gemini (this takes ~30-60s)`)
  const story = await structure(source, args.slug)
  if (story.suggestedSlug && story.suggestedSlug !== args.slug) {
    console.log(`[ingest] model suggested slug: ${story.suggestedSlug} (you used: ${args.slug})`)
  }

  fs.writeFileSync(mdPath, story.markdown, 'utf8')
  fs.writeFileSync(configPath, story.configYaml, 'utf8')
  fs.writeFileSync(sharePath, story.shareYaml, 'utf8')
  fs.mkdirSync(chartsDir, { recursive: true })
  for (const chart of story.charts) {
    const chartPath = path.join(chartsDir, `${chart.id}.json`)
    fs.writeFileSync(chartPath, JSON.stringify(chart.json, null, 2), 'utf8')
  }

  console.log(`\n[ingest] wrote:`)
  console.log(`  ${path.relative(ROOT, mdPath)}`)
  console.log(`  ${path.relative(ROOT, configPath)}`)
  console.log(`  ${path.relative(ROOT, sharePath)}`)
  for (const chart of story.charts) {
    console.log(`  ${path.relative(ROOT, path.join(chartsDir, `${chart.id}.json`))}`)
  }

  if (story.notes) {
    console.log(`\n[ingest] review notes from the model:\n`)
    console.log(story.notes)
  }

  console.log(`\n[ingest] preview at: /story/${args.slug}`)
}

main().catch((err) => {
  console.error('[ingest] failed:', err)
  process.exit(1)
})
