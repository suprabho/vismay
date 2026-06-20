'use client'

import type { ReactNode, Ref } from 'react'
import { composerUid, DEFAULT_TRANSFORM, type ComposerHost, type ComposerLayer, type TransformLike } from '@vismay/viz-admin'
import { OUTPUT_SIZE, RENDER_SCALE, type AspectRatio } from '../types'
import { CardFrame } from './CardFrame'
import { compKeyOf, type FootshortsComposerCtx } from './ctx'

/** Renders the card at its natural (unscaled) size; the shell's PreviewPane
 *  measures the available space and scales this to fit. The capture ref is on the
 *  un-transformed CardFrame so html-to-image captures at the intrinsic size. */
function FootshortsPreviewFrame({
  ctx,
  body,
  captureRef,
}: {
  ctx: FootshortsComposerCtx
  body: ReactNode
  captureRef?: Ref<HTMLDivElement>
}) {
  return (
    <CardFrame ref={captureRef} frame={ctx.frame} data={ctx.data}>
      {body}
    </CardFrame>
  )
}

function cardSizeFor(ratio: AspectRatio): { w: number; h: number } {
  const out = OUTPUT_SIZE[ratio]
  return { w: Math.round(out.w * RENDER_SCALE), h: Math.round(out.h * RENDER_SCALE) }
}

/** Default placement for a freshly added layer: data cards get a large centered
 *  box, image cards fill the card, badges are a small square. */
function defaultTransform(type: string, ratio: AspectRatio): TransformLike {
  const out = OUTPUT_SIZE[ratio]
  const ar = out.w / out.h
  if (type === 'fscard:badge' || type === 'fscard:emoji' || type === 'fscard:icon') {
    return { ...DEFAULT_TRANSFORM, widthPct: 16, heightPct: 16 * ar }
  }
  if (type === 'fscard:image') {
    return { ...DEFAULT_TRANSFORM, widthPct: 45, heightPct: 45 * ar }
  }
  if (type === 'fscard:news-image' || type === 'fscard:ai-image') {
    return { xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, scale: 1, rotation: 0, opacity: 1 }
  }
  return { ...DEFAULT_TRANSFORM, widthPct: 82, heightPct: 55 }
}

/** The `fscard:*` foreground types offered in the add-layer menu, with short
 *  layer-name labels (the module `label`s are verbose for a list row). */
const FOOTSHORTS_LAYER_TYPES: Array<{ type: string; name: string }> = [
  { type: 'fscard:match', name: 'Match' },
  { type: 'fscard:match-timeline', name: 'Match timeline' },
  { type: 'fscard:fixtures', name: 'Fixtures' },
  { type: 'fscard:standings', name: 'Standings' },
  { type: 'fscard:form', name: 'Form grid' },
  { type: 'fscard:news-image', name: 'News image' },
  { type: 'fscard:news-article', name: 'News article' },
  { type: 'fscard:ai-image', name: 'AI image' },
  { type: 'fscard:badge', name: 'Badge / flag' },
  { type: 'fscard:image', name: 'Image' },
  { type: 'fscard:emoji', name: 'Emoji' },
  { type: 'fscard:icon', name: 'Icon' },
]

const NAME_BY_TYPE = new Map(FOOTSHORTS_LAYER_TYPES.map((t) => [t.type, t.name]))

/** Default picks for a freshly added layer. New layers inherit the first
 *  competition so they resolve to something immediately; the user re-picks. */
function defaultConfig(type: string, ctx: FootshortsComposerCtx): Record<string, unknown> {
  const compKey = ctx.competitions[0] ? compKeyOf(ctx.competitions[0]) : ''
  switch (type) {
    case 'fscard:match':
      return { type, compKey, fixtureId: '', matchStyle: 'tile' }
    case 'fscard:match-timeline':
      return { type, compKey, fixtureId: '', matchStyle: 'tile', eventFilter: 'all' }
    case 'fscard:fixtures':
      return { type, compKey, fixtureIds: [], variant: 'compact' }
    case 'fscard:standings':
      return { type, compKey, group: null }
    case 'fscard:form':
      return { type, compKey, teamSlug: '' }
    case 'fscard:news-image':
    case 'fscard:news-article':
      return { type, newsId: '' }
    case 'fscard:ai-image':
      return { type, dataUrl: '', caption: '' }
    case 'fscard:badge':
      return { type, url: '', kind: 'crest', xPct: 50, yPct: 50, widthPct: 18 }
    case 'fscard:emoji':
      return { type, glyph: '⚽' }
    case 'fscard:icon':
      return { type, iconName: 'SoccerBall', iconWeight: 'bold', iconColor: 'accent' }
    case 'fscard:image':
      return { type, src: '', objectFit: 'contain' }
    default:
      return { type }
  }
}

/** The footshorts share-card host: a vertical stack of `fscard:*` layers, drawn
 *  inside the on-brand card frame. Background (news/ai/aura) stays a frame
 *  control, so the shell offers no background row. */
export const footshortsHost: ComposerHost<FootshortsComposerCtx> = {
  id: 'footshorts-sharecard',
  arrangement: 'free',
  allowedModuleTypes: () => FOOTSHORTS_LAYER_TYPES.map((t) => t.type),
  makeLayer: (type, ctx): ComposerLayer => ({
    id: composerUid('layer'),
    layer: defaultConfig(type, ctx) as unknown as ComposerLayer['layer'],
    name: NAME_BY_TYPE.get(type) ?? type,
    visible: true,
    transform: defaultTransform(type, ctx.frame.ratio),
  }),
  backgroundOptions: () => [],
  cardSize: (ctx) => cardSizeFor(ctx.frame.ratio),
  renderFrame: ({ ctx, body, captureRef }) => (
    <FootshortsPreviewFrame ctx={ctx} body={body} captureRef={captureRef} />
  ),
}
