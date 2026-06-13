/**
 * Build-time audio generation — thin CLI wrapper.
 *
 * The whole pipeline now lives in `@vismay/content-source/storyAudioGenerate`
 * (`generateStoryAudio`), so any vertical's story — vizmaya markdown or a
 * footshorts/vizf1 DB row (`CONTENT_SOURCE=db`) — flows through one shared
 * code path. This file only loads `.env`, parses argv, and loops slugs.
 *
 * Usage:
 *   npx tsx scripts/generate-audio.ts                       # all stories
 *   npx tsx scripts/generate-audio.ts south-korea-gpu-hour  # one story
 *   npx tsx scripts/generate-audio.ts --force               # regenerate all
 *   CHUNK_WORD_TARGET=500 npx tsx scripts/generate-audio.ts # tune chunk size
 *   CONTENT_SOURCE=db npx tsx scripts/generate-audio.ts <slug>  # DB-only story
 *
 * Whisper alignment (optional, requires `brew install whisper-cpp` + a model):
 *   USE_WHISPER_ALIGNMENT=1 \
 *   WHISPER_MODEL=/path/to/ggml-base.en.bin \
 *     npx tsx scripts/generate-audio.ts <slug> --force
 */

import fs from 'fs'
import path from 'path'
import {
  generateStoryAudio,
  listAudioStorySlugs,
  DailyQuotaExhaustedError,
  type WhisperOptions,
} from '@vismay/content-source/storyAudioGenerate'

// Load .env from the app root (simple parser, no dependency needed).
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

const whisper: WhisperOptions = {
  enabled: process.env.USE_WHISPER_ALIGNMENT === '1',
  bin: process.env.WHISPER_BIN,
  model: process.env.WHISPER_MODEL,
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const slugs = args.filter((a) => !a.startsWith('--'))

  const storySlugs = slugs.length > 0 ? slugs : await listAudioStorySlugs()

  console.log(`Audio generation for: ${storySlugs.join(', ')}`)
  if (force) console.log('(--force: regenerating all)')
  if (whisper.enabled) {
    if (!whisper.model) {
      console.error('USE_WHISPER_ALIGNMENT=1 but WHISPER_MODEL is not set. Aborting.')
      process.exit(1)
    }
    console.log(
      `(whisper alignment ON: ${whisper.bin ?? 'whisper-cli'}, model=${path.basename(whisper.model)})`
    )
  }

  try {
    for (const slug of storySlugs) {
      await generateStoryAudio({ slug, force, whisper })
    }
  } catch (err) {
    if (err instanceof DailyQuotaExhaustedError) {
      console.error('Re-run tomorrow once the quota resets — already-generated rows will be skipped.')
      process.exit(2)
    }
    throw err
  }

  console.log('\nAll done.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
