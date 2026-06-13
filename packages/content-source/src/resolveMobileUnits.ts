/**
 * Resolve a story's mobile units via the same `resolveUnits` the runtime
 * player uses. The flat index into this array is the `unit_index` written to
 * `story_audio_cues` (narrated) and the `[data-unit-index]` the headless walk
 * scrolls to (both narrated and silent), so resolving them here — once — keeps
 * the audio pipeline, the silent-video pacing, and the rendered page all
 * agreeing on which unit is which.
 *
 * Lifted out of storyAudioGenerate so the silent-video timeline can build cues
 * from the identical unit list without depending on the TTS module.
 */

import type { ResolvedUnit } from '@vismay/viz-engine'
import { getStoryContent } from './content'
import { loadStoryConfig } from './storyConfig'
import { resolveUnits } from './resolveUnits'

export async function resolveMobileUnits(slug: string): Promise<ResolvedUnit[]> {
  const { sections } = await getStoryContent(slug, { allowDraft: true })
  const config = await loadStoryConfig(slug)
  return resolveUnits(slug, sections, config).mobileUnits
}
