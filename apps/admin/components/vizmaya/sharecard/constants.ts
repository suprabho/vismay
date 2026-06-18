import type { StoryFocusArea } from '@vismay/viz-engine'
import type { AspectRatio, CardVariant, GraphScope } from './types'

/**
 * Per-aspect-ratio focus area for the share-card map. Shared between the live
 * card map (`ShareMapBg`) and the composer's map-edit overlay so the picker
 * frames the camera against the exact rectangle the card renders into.
 * Mapbox `padding` shifts the geographic center into this fractional rectangle.
 */
export const SHARE_FOCUS_AREA: Record<AspectRatio, StoryFocusArea> = {
  '1:1': { top: 0.2, left: 0, width: 1.0, height: 0.4 },
  '4:5': { top: 0.22, left: 0, width: 1.0, height: 0.4 },
  '3:4': { top: 0.25, left: 0, width: 1.0, height: 0.4 },
  '4:3': { top: 0.1, left: 0.28, width: 0.7, height: 0.4 },
}

/** Output aspect ratios the composer supports (matches ShareCard RENDER/OUTPUT). */
export const ASPECT_RATIOS: Array<{ id: AspectRatio; label: string }> = [
  { id: '1:1', label: 'Square 1:1' },
  { id: '4:5', label: 'Portrait 4:5' },
  { id: '3:4', label: 'Tall 3:4' },
  { id: '4:3', label: 'Landscape 4:3' },
]

export const CARD_VARIANTS: Array<{ id: CardVariant; label: string }> = [
  { id: 'map-title', label: 'Map + caption' },
  { id: 'graph', label: 'Story data' },
  { id: 'auto', label: 'Title / text' },
]

export const GRAPH_SCOPES: Array<{ id: GraphScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'stat', label: 'Stat only' },
  { id: 'chart', label: 'Chart only' },
]

/** A small starter palette for the emoji sticker picker. */
export const EMOJI_PALETTE: string[] = [
  '🔥', '⭐', '✨', '📈', '📉', '🚀', '🌍', '🗺️', '📍', '💡',
  '⚡', '🏆', '✅', '❗', '➡️', '👀', '💬', '❤️', '🎯', '💰',
]
