import type { Theme } from '@vismay/viz-engine'
import type { CardComposition, TextBlock } from './types'

/**
 * Token-preserving palette swap. Seeds (and most edits) bake theme colors to
 * concrete hex — html-to-image can't resolve `var()` in the capture clone — so
 * flipping a card between two palettes means rewriting those baked hexes. We
 * invert the SOURCE palette into a hex→token map, then rewrite every color that
 * matches a token to the TARGET palette's value for the same token. Colors the
 * user picked by hand (no token match) pass through untouched, and the
 * composition's `theme` override is set to the target so theme-var consumers
 * (chart palettes, `var(--color-*)` text) follow along.
 *
 * When two tokens share a hex in the source palette the LAST one in key order
 * wins the map slot — harmless as long as paired tokens stay identical across
 * both palettes (the umami palettes are built that way).
 */

function buildHexToToken(theme: Theme): Map<string, keyof Theme['colors']> {
  const map = new Map<string, keyof Theme['colors']>()
  for (const [token, hex] of Object.entries(theme.colors)) {
    if (typeof hex === 'string') map.set(hex.trim().toLowerCase(), token as keyof Theme['colors'])
  }
  return map
}

function makeRemap(from: Theme, to: Theme): (color: string) => string {
  const hexToToken = buildHexToToken(from)
  return (color: string) => {
    if (typeof color !== 'string') return color
    const token = hexToToken.get(color.trim().toLowerCase())
    if (!token) return color
    return to.colors[token] ?? color
  }
}

function remapTextBlock(block: TextBlock, remap: (c: string) => string): TextBlock {
  const next: TextBlock = { ...block, style: { ...block.style, color: remap(block.style.color) } }
  if (block.panel) {
    next.panel = {
      ...block.panel,
      bg: remap(block.panel.bg),
      borderColor: remap(block.panel.borderColor),
    }
  }
  return next
}

/** Rewrite every token-matching baked color from `from`'s palette to `to`'s and
 *  set the card theme to `to`. Pure — returns a new composition. */
export function remapCompositionTheme(
  composition: CardComposition,
  from: Theme,
  to: Theme,
): CardComposition {
  const remap = makeRemap(from, to)

  let background = composition.background
  if (background.kind === 'solid') {
    background = { ...background, color: remap(background.color) }
  } else if (background.kind === 'gradient') {
    background = { ...background, from: remap(background.from), to: remap(background.to) }
  } else if (background.kind === 'map' && background.appearance.pinColor) {
    background = {
      ...background,
      appearance: { ...background.appearance, pinColor: remap(background.appearance.pinColor) },
    }
  }

  const elements = composition.elements.map((el) => {
    if (el.kind === 'icon') return { ...el, color: remap(el.color) }
    if (el.kind === 'map' && el.appearance.pinColor) {
      return { ...el, appearance: { ...el.appearance, pinColor: remap(el.appearance.pinColor) } }
    }
    return el
  })

  const text = {
    ...composition.text,
    heading: composition.text.heading ? remapTextBlock(composition.text.heading, remap) : undefined,
    subheading: composition.text.subheading
      ? remapTextBlock(composition.text.subheading, remap)
      : undefined,
    annotations: composition.text.annotations.map((a) => remapTextBlock(a, remap)),
  }

  return { ...composition, theme: to, background, elements, text }
}
