import type { Theme } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'
import type {
  CardComposition,
  ElementLayer,
  TextBlock,
  TextPanel,
  TextStyle,
  Transform,
  UmamiTemplateKind,
} from '../layers/types'
import { DEFAULT_TRANSFORM } from '../layers/types'

/**
 * Seed layouts for the umami "Social frames" templates. Like the vizmaya seeds
 * these bake theme colors to concrete hex (capture-safe) and use %-based
 * positions, but every seeded layer carries a STABLE id (`seed-*`) so a
 * re-seed — switching template, picking a dish, flipping paper↔spice — replaces
 * seed layers in place while the user's own additions survive.
 *
 * Forum (the serif) ships weight 400 only: every serif block seeds
 * `fontWeight: 400` so the capture never faux-bolds.
 */

/** Dish fields the seeds consume — the shape `/api/umami/dishes` returns
 *  (TasteAtlas `imageUrl` is stripped server-side; imagery is AI-generated). */
export interface UmamiDishLite {
  slug: string
  name: string
  cuisine: string
  region?: string | null
  category?: string | null
  description?: string | null
  rating?: number | null
}

/** Optional content used to pre-fill a seed (dish picks, edited copy). */
export interface UmamiSeedContent {
  headline?: string
  kicker?: string
  body?: string
  /** Compare template: the two sides. Labels win over dish names. */
  labelA?: string
  labelB?: string
  dishA?: UmamiDishLite
  dishB?: UmamiDishLite
  /** Spotlight template. */
  dish?: UmamiDishLite
  /** Closing template: the social handle on the CTA chip. */
  handle?: string
}

// Stable seed ids (replaced on re-seed, user layers preserved).
export const SEED_IDS = {
  imgA: 'seed-img-a',
  imgB: 'seed-img-b',
  img: 'seed-img',
  kicker: 'seed-kicker',
  labelA: 'seed-label-a',
  labelB: 'seed-label-b',
  vs: 'seed-vs',
  body: 'seed-body',
  desc: 'seed-desc',
  rating: 'seed-rating',
  swipe: 'seed-swipe',
  cta: 'seed-cta',
} as const

/** 1×1 SVG placeholder tinted to a palette color — stands in for an image slot
 *  until the editor uploads / generates a real one. Data URL, so the capture
 *  clone needs no network. */
function placeholderImage(hex: string): string {
  const fill = encodeURIComponent(hex)
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='${fill}'/></svg>`
}

function block(
  id: string,
  text: string,
  transform: Partial<Transform>,
  style: Partial<TextStyle> & { color: string },
  panel?: TextPanel,
): TextBlock {
  return {
    id,
    text,
    visible: true,
    transform: { ...DEFAULT_TRANSFORM, ...transform },
    style: {
      color: style.color,
      fontFamily: style.fontFamily ?? 'sans',
      fontWeight: style.fontWeight ?? 400,
      fontSizePx: style.fontSizePx ?? 16,
      align: style.align ?? 'center',
      lineHeight: style.lineHeight ?? 1.25,
    },
    ...(panel ? { panel } : {}),
  }
}

function chipPanel(bg: string, opts: Partial<TextPanel> = {}): TextPanel {
  return {
    enabled: true,
    paddingPx: 10,
    radiusPx: 999,
    bg,
    bgOpacity: 1,
    blurPx: 0,
    borderWidthPx: 0,
    borderColor: bg,
    ...opts,
  }
}

function imageSlot(id: string, name: string, transform: Transform, surface: string): ElementLayer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    transform,
    kind: 'image',
    src: placeholderImage(surface),
    source: 'generated',
    objectFit: 'cover',
  }
}

function dishLabel(dish?: UmamiDishLite, label?: string, fallback = 'Dish'): string {
  return label?.trim() || dish?.name || fallback
}

function dishKicker(dish?: UmamiDishLite): string | null {
  if (!dish) return null
  return [dish.cuisine, dish.region].filter(Boolean).join(' · ')
}

export function seedUmamiTemplate(
  kind: UmamiTemplateKind,
  theme: Theme,
  _ratio: AspectRatio,
  content: UmamiSeedContent = {},
): CardComposition {
  const c = theme.colors
  const branding = { visible: true }

  if (kind === 'umami-compare') {
    const labelA = dishLabel(content.dishA, content.labelA, 'pulao')
    const labelB = dishLabel(content.dishB, content.labelB, 'biryani')
    return {
      theme,
      background: { kind: 'solid', color: c.background },
      elements: [
        imageSlot(SEED_IDS.imgA, `Image · ${labelA}`, { xPct: 26, yPct: 66, widthPct: 42, heightPct: 36, scale: 1, rotation: 0, opacity: 1 }, c.surface),
        imageSlot(SEED_IDS.imgB, `Image · ${labelB}`, { xPct: 74, yPct: 66, widthPct: 42, heightPct: 36, scale: 1, rotation: 0, opacity: 1 }, c.surface),
      ],
      text: {
        heading: block('seed-headline', content.headline ?? 'veg biryani exists', { xPct: 50, yPct: 20, widthPct: 88 }, { color: c.text, fontFamily: 'serif', fontWeight: 400, fontSizePx: 38, lineHeight: 1.05 }),
        subheading: content.kicker
          ? block(SEED_IDS.kicker, content.kicker, { xPct: 50, yPct: 36, widthPct: 70 }, { color: c.muted, fontSizePx: 14, lineHeight: 1.35 })
          : block(SEED_IDS.kicker, "and I'm a non vegetarian saying this", { xPct: 50, yPct: 36, widthPct: 70 }, { color: c.text, fontSizePx: 14, lineHeight: 1.35 }, chipPanel(c.surface, { radiusPx: 16, paddingPx: 12 })),
        annotations: [
          block(SEED_IDS.labelA, labelA, { xPct: 26, yPct: 45, widthPct: 26 }, { color: c.text, fontWeight: 600, fontSizePx: 14 }, chipPanel(c.surface)),
          block(SEED_IDS.labelB, labelB, { xPct: 74, yPct: 45, widthPct: 26 }, { color: c.background, fontWeight: 600, fontSizePx: 14 }, chipPanel(c.accent)),
          block(SEED_IDS.vs, 'VS', { xPct: 50, yPct: 66, widthPct: 12 }, { color: c.background, fontWeight: 800, fontSizePx: 16 }, chipPanel(c.accent)),
        ],
      },
      branding,
    }
  }

  if (kind === 'umami-dish') {
    const dish = content.dish
    const kicker = content.kicker ?? dishKicker(dish) ?? 'cuisine · region'
    const rating = dish?.rating != null ? `★ ${dish.rating.toFixed(1)}` : '★ 4.5'
    return {
      theme,
      background: { kind: 'solid', color: c.background },
      elements: [
        imageSlot(SEED_IDS.img, `Image · ${dish?.name ?? 'dish'}`, { xPct: 50, yPct: 52, widthPct: 84, heightPct: 42, scale: 1, rotation: 0, opacity: 1 }, c.surface),
      ],
      text: {
        heading: block('seed-headline', content.headline ?? dish?.name ?? 'Dish name', { xPct: 50, yPct: 18, widthPct: 88 }, { color: c.text, fontFamily: 'serif', fontWeight: 400, fontSizePx: 34, lineHeight: 1.1 }),
        subheading: block(SEED_IDS.kicker, kicker, { xPct: 50, yPct: 9, widthPct: 80 }, { color: c.accent, fontWeight: 700, fontSizePx: 12, lineHeight: 1.2 }),
        annotations: [
          block(SEED_IDS.desc, content.body ?? dish?.description ?? 'A short, appetizing line about the dish goes here.', { xPct: 50, yPct: 82, widthPct: 84 }, { color: c.muted, fontSizePx: 14, lineHeight: 1.45 }),
          block(SEED_IDS.rating, rating, { xPct: 82, yPct: 32, widthPct: 16 }, { color: c.text, fontWeight: 700, fontSizePx: 13 }, chipPanel(c.amber ?? c.accent)),
        ],
      },
      branding,
    }
  }

  if (kind === 'umami-hook') {
    return {
      theme,
      background: { kind: 'gradient', gtype: 'radial', from: c.surface, to: c.background },
      elements: [],
      text: {
        heading: block('seed-headline', content.headline ?? 'Same same, but different', { xPct: 50, yPct: 44, widthPct: 84 }, { color: c.text, fontFamily: 'serif', fontWeight: 400, fontSizePx: 40, lineHeight: 1.08 }),
        subheading: block(SEED_IDS.kicker, content.kicker ?? 'A FOOD STORY', { xPct: 50, yPct: 28, widthPct: 70 }, { color: c.accent, fontWeight: 700, fontSizePx: 13, lineHeight: 1.2 }),
        annotations: [
          block(SEED_IDS.swipe, 'swipe →', { xPct: 50, yPct: 88, widthPct: 22 }, { color: c.text, fontWeight: 600, fontSizePx: 13 }, chipPanel(c.surface)),
        ],
      },
      branding,
    }
  }

  if (kind === 'umami-story') {
    return {
      theme,
      background: { kind: 'solid', color: c.background },
      elements: [],
      text: {
        heading: block('seed-headline', content.headline ?? 'Both trace back to Persia', { xPct: 50, yPct: 24, widthPct: 86 }, { color: c.text, fontFamily: 'serif', fontWeight: 400, fontSizePx: 30, lineHeight: 1.15 }),
        subheading: block(SEED_IDS.kicker, content.kicker ?? 'PART 1', { xPct: 50, yPct: 12, widthPct: 60 }, { color: c.accent, fontWeight: 700, fontSizePx: 12, lineHeight: 1.2 }),
        annotations: [
          block(SEED_IDS.body, content.body ?? 'Ancient rice cooked with meat, spices and love — and then it travelled.', { xPct: 50, yPct: 62, widthPct: 80 }, { color: c.muted, fontSizePx: 16, lineHeight: 1.5 }),
        ],
      },
      branding,
    }
  }

  // umami-closing
  return {
    theme,
    background: { kind: 'solid', color: c.surface },
    elements: [],
    text: {
      heading: block('seed-headline', content.headline ?? 'Same roots. Different journeys.', { xPct: 50, yPct: 42, widthPct: 84 }, { color: c.text, fontFamily: 'serif', fontWeight: 400, fontSizePx: 34, lineHeight: 1.12 }),
      subheading: undefined,
      annotations: [
        block(SEED_IDS.cta, content.handle ?? 'follow @umami.fyi', { xPct: 50, yPct: 64, widthPct: 44 }, { color: c.background, fontWeight: 700, fontSizePx: 14 }, chipPanel(c.accent)),
      ],
    },
    branding,
  }
}
