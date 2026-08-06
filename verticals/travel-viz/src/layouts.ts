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
 *
 * Responsiveness: regions keep absolute geometry in BOTH orientations
 * (`stackOnPortrait: false` everywhere except spread-center) — the story's
 * snap scroller sits behind the fixed overlay, so overlay content must FIT
 * the viewport, never scroll. Sizes use clamp() so iPad landscape doesn't get
 * desktop-huge paper, and the `--sb-inset` / `--sb-stamp` vars (defined in
 * the travel app's globals.css) widen gutters on tablet portrait. Only
 * spread-center's stack branch still needs `style.portrait.size.height` on
 * visual layers (travel types are not in the engine's STACK_VISUAL_TYPES
 * defaults); text layers there use intrinsic height.
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
    // Keep absolute geometry on portrait too: the scatter collage lays out
    // by % inside a bounded photos region instead of stacking 40vh+ children
    // past the (unscrollable) viewport.
    stackOnPortrait: false,
    regions: {
      // zIndex: the postmark stamps OVER everything (regions otherwise paint
      // in declaration order, and meta is declared first).
      meta: {
        style: {
          position: 'absolute' as const,
          top: '4vh',
          ...noteEdge,
          width: 'clamp(110px, 12vmin, 160px)',
          height: 'clamp(110px, 12vmin, 160px)',
          zIndex: 20,
        },
      },
      photos: {
        style: { position: 'absolute' as const, top: '6vh', bottom: '6vh', ...photosEdge },
      },
      note: {
        style: {
          position: 'absolute' as const,
          top: '26vh',
          ...noteEdge,
          width: 'clamp(280px, 26vw, 380px)',
          height: 'clamp(220px, 40vh, 430px)',
          ...PAPER_CARD,
          padding: 'clamp(1rem, 1.6vw, 2rem)',
        },
      },
      footer: {
        style: {
          position: 'absolute' as const,
          bottom: '3vh',
          ...noteEdge,
          width: 'clamp(280px, 26vw, 380px)',
          height: 'clamp(90px, 16vh, 150px)',
        },
      },
    },
    portrait: {
      name: `travel:spread-${side}.portrait`,
      regions: {
        meta: {
          style: {
            position: 'absolute' as const,
            top: '2vh',
            right: 'var(--sb-inset)',
            width: 'var(--sb-stamp)',
            height: 'var(--sb-stamp)',
            zIndex: 20,
          },
        },
        // Bounded box: photos own the top half, note + footer the bottom.
        photos: {
          style: {
            position: 'absolute' as const,
            top: '3vh',
            bottom: '48vh',
            left: 'var(--sb-inset)',
            right: 'var(--sb-inset)',
          },
        },
        note: {
          style: {
            position: 'absolute' as const,
            bottom: '15vh',
            left: 'var(--sb-inset)',
            right: 'var(--sb-inset)',
            height: 'clamp(170px, 30vh, 340px)',
            ...PAPER_CARD,
            padding: '1rem',
          },
        },
        footer: {
          style: {
            position: 'absolute' as const,
            bottom: '2vh',
            left: 'var(--sb-inset)',
            right: '18vw',
            height: 'clamp(80px, 12vh, 130px)',
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
        width: 'clamp(280px, 30vw, 420px)',
        height: 'clamp(260px, 30vh, 380px)',
        ...PAPER_CARD,
        padding: 'clamp(1rem, 1.6vw, 2rem)',
      },
    },
    meta: {
      style: {
        position: 'absolute' as const,
        top: '5vh',
        right: '5vw',
        width: 'clamp(110px, 12vmin, 160px)',
        height: 'clamp(110px, 12vmin, 160px)',
        zIndex: 20,
      },
    },
  },
  portrait: {
    name: 'travel:spread-hero.portrait',
    regions: {
      photo: { style: { position: 'absolute' as const, inset: 0 } },
      note: {
        style: {
          position: 'absolute' as const,
          left: 'var(--sb-inset)',
          right: 'var(--sb-inset)',
          bottom: '4vh',
          height: 'clamp(170px, 30vh, 340px)',
          ...PAPER_CARD,
          padding: '1rem',
        },
      },
      meta: {
        style: {
          position: 'absolute' as const,
          top: '3vh',
          right: 'var(--sb-inset)',
          width: 'var(--sb-stamp)',
          height: 'var(--sb-stamp)',
          zIndex: 20,
        },
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
      style: {
        position: 'absolute' as const,
        top: '6vh',
        right: '8vw',
        width: 'clamp(110px, 12vmin, 150px)',
        height: 'clamp(110px, 12vmin, 150px)',
        zIndex: 20,
      },
    },
    content: {
      style: {
        position: 'absolute' as const,
        top: '18vh',
        bottom: '16vh',
        left: '31vw',
        width: 'clamp(400px, 38vw, 620px)',
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
      meta: {
        style: {
          position: 'absolute' as const,
          top: '2vh',
          right: 'var(--sb-inset)',
          width: 'var(--sb-stamp)',
          height: 'var(--sb-stamp)',
          zIndex: 20,
        },
      },
      content: {
        style: {
          position: 'absolute' as const,
          top: '12vh',
          bottom: '6vh',
          left: 'var(--sb-inset)',
          right: 'var(--sb-inset)',
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
