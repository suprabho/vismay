import type { CSSProperties } from 'react'
import { registerForegroundLayout } from '@vismay/viz-engine'

/**
 * Scrapbook spread layouts for map-format travel stories. The live map stays
 * the full-bleed background; these regions place paper artifacts on top of it:
 *
 *   - `note`   — the prose card (cream paper panel; bodyText lands here)
 *   - `photos` — the photo area (polaroids / stacks / grids / video)
 *   - `meta`   — the postmark corner
 *   - `footer` — tips & attribution tapeNotes
 *
 * `spread-left` puts the note on the left, photos right; `spread-right`
 * mirrors it — alternate per spread so the paper dodges the flown-to pin.
 * Portrait stacks regions full-width (declaration order), so every injected
 * visual layer must carry `style.portrait.size.height` (travel types are not
 * in the engine's STACK_VISUAL_TYPES defaults).
 */

const PAPER_CARD: CSSProperties = {
  background: 'rgba(253, 252, 248, 0.94)',
  border: '1px solid var(--color-line)',
  borderRadius: 3,
  boxShadow: '0 10px 30px rgba(20, 16, 8, 0.18)',
  padding: '2rem',
  overflow: 'hidden',
}

function spread(side: 'left' | 'right') {
  // Postmark, prose card and footer note share the text column; photos own the
  // other side entirely. Regions carry explicit heights — foreground layers
  // are absolutely positioned, so auto-height boxes would collapse.
  const noteEdge: CSSProperties = side === 'left' ? { left: '4vw' } : { right: '4vw' }
  const photosEdge: CSSProperties =
    side === 'left' ? { left: '34vw', right: '4vw' } : { left: '4vw', right: '34vw' }
  return {
    name: `travel:spread-${side}`,
    stackOnPortrait: true,
    regions: {
      meta: {
        style: { position: 'absolute' as const, top: '4vh', ...noteEdge, width: 160, height: 160 },
      },
      photos: {
        style: { position: 'absolute' as const, top: '6vh', bottom: '6vh', ...photosEdge },
      },
      note: {
        style: {
          position: 'absolute' as const,
          top: '28vh',
          ...noteEdge,
          width: '26vw',
          height: '36vh',
          ...PAPER_CARD,
        },
      },
      footer: {
        style: {
          position: 'absolute' as const,
          bottom: '4vh',
          ...noteEdge,
          width: '26vw',
          height: '16vh',
        },
      },
    },
    portrait: {
      name: `travel:spread-${side}.portrait`,
      regions: {
        meta: { style: { position: 'absolute' as const, top: '2vh', right: '4vw', width: 110, height: 110 } },
        photos: { style: { position: 'absolute' as const, top: '6vh', left: '4vw', right: '4vw' } },
        note: {
          style: {
            position: 'absolute' as const,
            top: '56vh',
            left: '4vw',
            right: '4vw',
            height: '26vh',
            ...PAPER_CARD,
            padding: '1.25rem',
          },
        },
        footer: {
          style: {
            position: 'absolute' as const,
            bottom: '2vh',
            left: '4vw',
            right: '30vw',
            height: '12vh',
          },
        },
      },
    },
  }
}

/** Full-bleed hero photo with a note card over it and the postmark corner. */
const spreadHero = {
  name: 'travel:spread-hero',
  stackOnPortrait: false,
  regions: {
    photo: { style: { position: 'absolute' as const, inset: 0 } },
    note: {
      style: {
        position: 'absolute' as const,
        left: '5vw',
        bottom: '9vh',
        width: '30vw',
        height: '26vh',
        ...PAPER_CARD,
      },
    },
    meta: {
      style: { position: 'absolute' as const, top: '5vh', right: '5vw', width: 160, height: 160 },
    },
  },
  portrait: {
    name: 'travel:spread-hero.portrait',
    regions: {
      photo: { style: { position: 'absolute' as const, inset: 0 } },
      note: {
        style: {
          position: 'absolute' as const,
          left: '4vw',
          right: '4vw',
          bottom: '5vh',
          height: '28vh',
          ...PAPER_CARD,
          padding: '1.25rem',
        },
      },
      meta: {
        style: { position: 'absolute' as const, top: '3vh', right: '4vw', width: 110, height: 110 },
      },
    },
  },
}

/** Single centered column for ticket/note-only spreads (no photos). */
const spreadCenter = {
  name: 'travel:spread-center',
  stackOnPortrait: true,
  regions: {
    meta: {
      style: { position: 'absolute' as const, top: '6vh', right: '8vw', width: 150, height: 150 },
    },
    content: {
      style: {
        position: 'absolute' as const,
        top: '18vh',
        bottom: '16vh',
        left: '31vw',
        width: '38vw',
        display: 'flex' as const,
        flexDirection: 'column' as const,
        justifyContent: 'center' as const,
        gap: '3vh',
      },
    },
  },
  portrait: {
    name: 'travel:spread-center.portrait',
    regions: {
      meta: { style: { position: 'absolute' as const, top: '2vh', right: '4vw', width: 110, height: 110 } },
      content: {
        style: {
          position: 'absolute' as const,
          top: '14vh',
          bottom: '8vh',
          left: '6vw',
          right: '6vw',
        },
      },
    },
  },
}

export function registerScrapbookLayouts(): void {
  registerForegroundLayout(spread('left'))
  registerForegroundLayout(spread('right'))
  registerForegroundLayout(spreadHero)
  registerForegroundLayout(spreadCenter)
}
