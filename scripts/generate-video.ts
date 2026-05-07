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
 *   npx tsx scripts/generate-video.ts <slug> 9:16 --force        # ignore cache
 *   PORT=3001 npx tsx scripts/generate-video.ts <slug> 9:16     # custom dev port
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { renderStoryVideo } from '../lib/storyVideoRender'
import type { VideoAspect } from '../lib/storyVideo'

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

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const positional = args.filter((a) => !a.startsWith('--'))

  if (positional.length < 2) {
    console.error('Usage: npx tsx scripts/generate-video.ts <slug> <9:16|16:9> [--force]')
    process.exit(1)
  }
  const [slug, aspectArg] = positional
  if (aspectArg !== '9:16' && aspectArg !== '16:9') {
    console.error(`Bad aspect "${aspectArg}" — must be 9:16 or 16:9`)
    process.exit(1)
  }
  const aspect = aspectArg as VideoAspect

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
  // CI / dispatched-render path passes BASE_URL pointing at the deployed site
  // so the headless browser can hit it without needing a dev server in the
  // workflow runner. Local dev defaults to localhost.
  const baseUrl =
    process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

  console.log(`\n━━━ ${slug} · ${aspect} ━━━`)
  console.log(`  baseUrl: ${baseUrl}`)

  const result = await renderStoryVideo({
    supabase,
    slug,
    aspect,
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
