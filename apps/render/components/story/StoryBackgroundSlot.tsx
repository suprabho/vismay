'use client'

import type { ComponentProps } from 'react'
import { StoryBackgroundSlot as BaseStoryBackgroundSlot } from '@vismay/story-reader'
import { AuraBackground } from '@vismay/ui'

// The overlay carries no app chrome — re-export it straight from the package.
export { StoryBackgroundOverlay } from '@vismay/story-reader'

/** Render-app binding: injects the aura background iframe into the generic slot. */
export default function StoryBackgroundSlot(
  props: ComponentProps<typeof BaseStoryBackgroundSlot>
) {
  return <BaseStoryBackgroundSlot {...props} AuraComponent={AuraBackground} />
}
