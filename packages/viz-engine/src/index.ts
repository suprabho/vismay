// Core engine surface
export * from './types'
export * from './registry'
export { loadVertical, registerVerticalLoader, _resetVerticalsForTesting } from './verticals'
export type { VerticalLoader as VerticalLoaderFn } from './verticals'
export * from './StoryShellContext'

// Slot dispatchers + page-level loader
export { default as VerticalLoader } from './VerticalLoader'
export { default as ForegroundVizSlot } from './ForegroundVizSlot'
export { default as ForegroundLayoutSlot } from './ForegroundLayoutSlot'
export { default as BackgroundVizSlot } from './BackgroundVizSlot'

// Charts (consumers that import these directly: StoryMapShell, demo pages, the chart module wraps ChartPanel)
export { default as ChartPanel } from './charts/ChartPanel'
export { default as MapboxBackground } from './charts/MapboxBackground'
export { default as GenericChart } from './charts/GenericChart'

// Story type taxonomy (formerly @/types/story)
export * from './types/story'

// Lib helpers (formerly @/lib/*) — order matters where files share types via re-export
export * from './lib/storyConfig.types'
export * from './lib/logoPalette'
export * from './lib/inlineMarkdown'
export * from './lib/foregroundContent'
export * from './lib/storyMapOverrides'
export * from './lib/assetUrl'
export * from './lib/resolveSlots'
export * from './foregroundLayouts'
export * from './lib/storyReadiness'
export * from './lib/pdfReadiness'
export * from './lib/chartTheme'
export * from './lib/applyMapPalette'
export * from './lib/mapboxWorldview'
export * from './lib/storyFocusArea'
export * from './lib/yamlMapPatch'
export * from './lib/schemaPrompt'
