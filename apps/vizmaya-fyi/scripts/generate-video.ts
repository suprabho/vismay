/**
 * Render an autoplay session as MP4 from the CLI.
 *
 * Thin wrapper around `lib/storyVideoRender.ts` — handles env loading, CLI
 * args, and a console log adapter. The same `renderStoryVideo` function is
 * used by the API route, so behavior matches whether the render is triggered
 * by an admin run of this script or by an end-user clicking "Download".
 *
 * Requires: system `ffmpeg` on PATH and Playwright Chromium
 * (`npx playwright install chromium`).
 *
 * Usage:
 *   npx tsx scripts/generate-video.ts <slug> 9:16
 *   npx tsx scripts/generate-video.ts <slug> 16:9
 *   npx tsx scripts/generate-video.ts <slug> 9:16 --force                       # ignore cache
 *   npx tsx scripts/generate-video.ts <slug> 9:16 --start-ms 5000 --end-ms 18000 # sub-range render
 *   PORT=3001 npx tsx scripts/generate-video.ts <slug> 9:16                     # custom dev port
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { renderStoryVideo } from '../lib/storyVideoRender'
import type { VideoAspect, VideoRange } from '@vismay/content-source/storyVideo'

/* ─── Env loading (same simple parser as generate-audio.ts) ─────────── */

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

function readFlagValue(args: string[], flag: string): string | undefined {
  // Accept both `--flag value` and `--flag=value`.
  const joined = args.find((a) => a.startsWith(`${flag}=`))
  if (joined) return joined.slice(flag.length + 1)
  const idx = args.indexOf(flag)
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1]
  return undefined
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  // Legacy: `--preview` is a shorthand for `--end-ms 20000`.
  const preview = args.includes('--preview')
  const startMsArg = readFlagValue(args, '--start-ms')
  const endMsArg = readFlagValue(args, '--end-ms')

  // Positional = anything that isn't a flag or a value consumed by a flag.
  const flagsWithValues = new Set(['--start-ms', '--end-ms'])
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = eq === -1 ? a : a.slice(0, eq)
      if (flagsWithValues.has(name) && eq === -1) i++ // skip the value
      continue
    }
    positional.push(a)
  }

  if (positional.length < 2) {
    console.error('Usage: npx tsx scripts/generate-video.ts <slug> <9:16|16:9> [--force] [--preview] [--start-ms N] [--end-ms N]')
    process.exit(1)
  }
  const [slug, aspectArg] = positional
  if (aspectArg !== '9:16' && aspectArg !== '16:9') {
    console.error(`Bad aspect "${aspectArg}" — must be 9:16 or 16:9`)
    process.exit(1)
  }
  const aspect = aspectArg as VideoAspect

  let range: VideoRange | undefined
  if (preview) {
    range = { startMs: 0, endMs: 20_000 }
  } else if (startMsArg !== undefined || endMsArg !== undefined) {
    const startMs = startMsArg !== undefined ? Number(startMsArg) : 0
    const endMs = endMsArg !== undefined ? Number(endMsArg) : NaN
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      console.error('--start-ms and --end-ms must be integers in milliseconds')
      process.exit(1)
    }
    if (endMs <= startMs) {
      console.error('--end-ms must be greater than --start-ms')
      process.exit(1)
    }
    range = { startMs: Math.max(0, Math.floor(startMs)), endMs: Math.floor(endMs) }
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
  const baseUrl =
    process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

  const label = range ? ` · range ${range.startMs}–${range.endMs}ms` : ''
  console.log(`\n━━━ ${slug} · ${aspect}${label} ━━━`)
  console.log(`  baseUrl: ${baseUrl}`)

  const result = await renderStoryVideo({
    supabase,
    slug,
    aspect,
    baseUrl,
    force,
    range,
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
