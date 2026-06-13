/**
 * Generate a HeyGen video from a template, from the CLI.
 *
 * Thin runner around `@vismay/content-source/heygenTemplate`. It is the same
 * entry point the `render-heygen.yml` GitHub workflow invokes, so a render
 * behaves identically whether you run it locally or it's dispatched from an API
 * route. Prints the final `video_url` on the last line so the workflow (and the
 * dispatch poller) can scrape it from stdout.
 *
 * Requires HEYGEN_API_KEY in the environment (or this app's .env).
 *
 * Usage:
 *   # Discover what's available
 *   npx tsx scripts/heygen-generate.ts --list
 *   npx tsx scripts/heygen-generate.ts --inspect <template_id>
 *
 *   # Render (variables is a JSON map of slot name -> filled variable)
 *   npx tsx scripts/heygen-generate.ts <template_id> \
 *     --variables '{"headline":{"name":"headline","type":"text","properties":{"content":"Hello"}}}' \
 *     --title "My render" --test
 *
 *   # Custom output size
 *   npx tsx scripts/heygen-generate.ts <template_id> --variables '{...}' \
 *     --dimension '{"width":1080,"height":1920}'
 */

import fs from 'fs'
import path from 'path'
import {
  listTemplates,
  getTemplate,
  generateFromTemplate,
  pollVideo,
  type HeygenVariable,
} from '@vismay/content-source/heygenTemplate'

/* ─── Env loading (same simple parser as generate-video.ts) ─────────── */

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

if (!process.env.HEYGEN_API_KEY) {
  console.error('Error: HEYGEN_API_KEY must be set (in env or apps/vizmaya-fyi/.env).')
  process.exit(1)
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const joined = args.find((a) => a.startsWith(`${flag}=`))
  if (joined) return joined.slice(flag.length + 1)
  const idx = args.indexOf(flag)
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1]
  return undefined
}

function parseJsonFlag<T>(raw: string | undefined, label: string): T | undefined {
  if (raw === undefined || raw === '') return undefined
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.error(`Error: --${label} is not valid JSON: ${(err as Error).message}`)
    process.exit(1)
  }
}

async function main() {
  const args = process.argv.slice(2)

  // --list: print template ids + names and exit.
  if (args.includes('--list')) {
    const templates = await listTemplates()
    if (!templates.length) {
      console.log('No templates found for this account.')
      return
    }
    for (const t of templates) {
      console.log(`${t.template_id}\t${t.name ?? '(unnamed)'}`)
    }
    return
  }

  // --inspect <id>: print the template's variables so you know what to fill.
  const inspectId = readFlagValue(args, '--inspect')
  if (inspectId) {
    const detail = await getTemplate(inspectId)
    console.log(JSON.stringify(detail.variables, null, 2))
    return
  }

  // Render mode: first positional arg is the template id.
  const templateId = args.find((a) => !a.startsWith('--'))
  if (!templateId) {
    console.error(
      'Usage: heygen-generate.ts <template_id> --variables <json> [--title <t>] ' +
        '[--dimension <json>] [--test]\n' +
        '       heygen-generate.ts --list\n' +
        '       heygen-generate.ts --inspect <template_id>',
    )
    process.exit(1)
  }

  // Variables may come from a flag (local) or HEYGEN_VARIABLES env (workflow).
  const variables =
    parseJsonFlag<Record<string, HeygenVariable>>(
      readFlagValue(args, '--variables') ?? process.env.HEYGEN_VARIABLES,
      'variables',
    ) ?? {}
  const dimension = parseJsonFlag<{ width: number; height: number }>(
    readFlagValue(args, '--dimension') ?? process.env.HEYGEN_DIMENSION,
    'dimension',
  )
  const title = readFlagValue(args, '--title') ?? process.env.HEYGEN_TITLE
  const test = args.includes('--test') || process.env.HEYGEN_TEST === 'true'

  if (!Object.keys(variables).length) {
    console.warn('Warning: no --variables supplied; rendering template defaults.')
  }

  console.log(`Generating from template ${templateId}${test ? ' (test/watermarked)' : ''}…`)
  const { videoId } = await generateFromTemplate({
    templateId,
    variables,
    title,
    dimension,
    test,
  })
  console.log(`video_id: ${videoId} — polling for completion…`)

  const state = await pollVideo(videoId, {
    timeoutMs: 20 * 60_000,
    onPoll: (s) => console.log(`  status: ${s.status}`),
  })

  // Last line: the public URL, so the workflow/poller can scrape it.
  console.log(`video_url: ${state.videoUrl}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
