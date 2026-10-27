/**
 * Voice a published HTML story section by section (src/audioGenerate.ts).
 * Run by .github/workflows/render-html-story-audio.yml, which publishing
 * dispatches; by hand:
 *
 *   pnpm --filter @vismay/html-stories generate-audio <slug> [--force]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * ELEVENLABS_API_KEY (ElevenLabs) or AI_GATEWAY_API_KEY (Gemini); the voice
 * env is in src/narrationVoice.ts. --force re-voices every section, even
 * unchanged ones.
 */

import { writeAudio } from '../src/audio'
import { generateHtmlStoryAudio } from '../src/audioGenerate'
import { isSafeSlug } from '../src/meta'

async function main() {
  const args = process.argv.slice(2)
  const slug = args.find((a) => !a.startsWith('--'))
  const force = args.includes('--force')
  if (!slug || !isSafeSlug(slug)) {
    console.error('usage: generate-audio <slug> [--force]')
    process.exit(2)
  }
  try {
    const r = await generateHtmlStoryAudio({ slug, force })
    if (r.failed) process.exitCode = 1
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`✗ ${slug}: ${message}`)
    // Leave the reason on the manifest so admin shows why there is no audio.
    await writeAudio(slug, { status: 'failed', error: message }).catch(() => {})
    process.exit(1)
  }
}

main()
