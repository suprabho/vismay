/**
 * Render a story as a report or slides PDF from the CLI.
 *
 * Thin wrapper around `lib/storyPdfRender.ts` — handles env loading, CLI
 * args, and a console log adapter. The same `renderStoryPdf` function is
 * used by the API route, so behavior matches whether the render is
 * triggered by an admin run of this script or by an end-user clicking
 * "Download" on the /reports builder.
 *
 * Requires Playwright Chromium (`npx playwright install chromium`).
 *
 * Usage:
 *   npx tsx scripts/generate-pdf.ts <slug> report
 *   npx tsx scripts/generate-pdf.ts <slug> slides
 *   npx tsx scripts/generate-pdf.ts <slug> report --force        # ignore cache
 *   PORT=3001 npx tsx scripts/generate-pdf.ts <slug> slides     # custom dev port
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { renderStoryPdf } from '../lib/storyPdfRender'
import { isPdfFormat } from '@vismay/content-source/storyPdf'

const envPath = path.resolve(__dirname, '..', '.env')
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
  )
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const positional = args.filter((a) => !a.startsWith('--'))

  if (positional.length < 2) {
    console.error('Usage: npx tsx scripts/generate-pdf.ts <slug> <report|slides> [--force]')
    process.exit(1)
  }
  const [slug, formatArg] = positional
  if (!isPdfFormat(formatArg)) {
    console.error(`Bad format "${formatArg}" — must be report or slides`)
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
  const baseUrl =
    process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

  console.log(`\n━━━ ${slug} · ${formatArg} ━━━`)
  console.log(`  baseUrl: ${baseUrl}`)

  const result = await renderStoryPdf({
    supabase,
    slug,
    format: formatArg,
    baseUrl,
    force,
    log: (msg) => console.log(`  ${msg}`),
  })

  console.log(
    result.cached ? '\nServed from cache.' : '\nRendered successfully.'
  )
  console.log(result.public_url)
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
