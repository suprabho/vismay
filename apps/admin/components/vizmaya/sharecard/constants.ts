import type { AspectRatio, CardVariant, GraphScope } from './types'

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
