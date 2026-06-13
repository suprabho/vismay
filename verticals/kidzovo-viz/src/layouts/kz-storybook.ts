import type { CSSProperties } from 'react'
import type { ForegroundLayoutDef } from '@vismay/viz-engine'

/**
 * `kz-storybook` — the canonical Kidzovo panel layout.
 *
 * Four overlapping full-bleed regions stacked back-to-front:
 *   1. `background` — the room/kitchen/park backdrop. Takes `image` or `video`.
 *   2. `stage` — character lane, padded off the bottom edge so characters
 *      stand on a "floor" instead of being clipped under mobile chrome.
 *      Takes `kz:character` (lands in phase 2 of the Kidzovo plan).
 *   3. `bubbles` — speech-bubble overlay above the stage. Takes `kz:bubble`
 *      (phase 3). Split from `stage` so bubbles always win z-stacking and can
 *      claim pointer-events without the character lane intercepting.
 *   4. `caption` — third-person scene narration anchored to the top, capped
 *      to a readable line length. Takes `text`.
 *
 * Object insertion order is preserved when the engine renders regions, so
 * declaration order = DOM order = z-stacking order. Caption is declared
 * last so it sits topmost — narration must never be hidden by a bubble or
 * character that drifted upward.
 *
 * Portrait variant tightens the caption gutter and pushes the stage floor
 * further up so bubbles don't get clipped under mobile UI chrome.
 *
 * See docs/kidzovo-vertical-plan.md §6 for the full layout spec.
 */

const FILL: CSSProperties = { position: 'absolute', inset: 0 }

export const kzStorybook: ForegroundLayoutDef = {
  name: 'kz-storybook',
  regions: {
    background: {
      style: FILL,
      accepts: ['image', 'video'],
      hints: { aspect: 'wide' },
    },
    stage: {
      style: { ...FILL, paddingBottom: '12vh' },
      accepts: ['kz:character'],
    },
    bubbles: {
      style: FILL,
      accepts: ['kz:bubble'],
    },
    caption: {
      style: {
        position: 'absolute',
        top: '4vh',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '720px',
        // Cap width so the centered band doesn't bleed past the viewport on
        // narrow desktops; 10vw matches the 5vw left+right gutter portrait uses.
        width: 'calc(100vw - 10vw)',
        textAlign: 'center',
      },
      accepts: ['text'],
    },
  },
  portrait: {
    name: 'kz-storybook.portrait',
    regions: {
      background: { style: FILL, accepts: ['image', 'video'] },
      stage: {
        style: { ...FILL, paddingBottom: '22vh' },
        accepts: ['kz:character'],
      },
      bubbles: { style: FILL, accepts: ['kz:bubble'] },
      caption: {
        style: {
          position: 'absolute',
          top: '3vh',
          left: '5vw',
          right: '5vw',
          textAlign: 'center',
        },
        accepts: ['text'],
      },
    },
  },
}
