import type { KzBubbleConfig } from '../../types'

/**
 * Authoring sample for `kz:bubble` — a gentle one-line bubble pointing at
 * the on-stage Ovi. Drop into a kz-storybook section's `bubbles` region.
 */
export const sample: KzBubbleConfig = {
  type: 'kz:bubble',
  tone: 'gentle',
  speaker: 'ovi',
  textStepwise: ['This is so fun!'],
}
