export { AuthWidget } from './auth/AuthWidget'
export type { AuthWidgetProps, AuthWidgetBrand, AuthWidgetCopy } from './auth/AuthWidget'
export {
  createAuthBrowserClient,
  createSupabaseAuthClient,
  createAdminAuthClient,
} from './auth/client'
export type { AuthClient, AuthProvider, AuthResult } from './auth/client'

/* Shared bento story grid — the vizmaya.fyi home grid, reused by the admin. */
export { StoryCard } from './grid/StoryCard'
export type { StoryCardProps } from './grid/StoryCard'
export { StoryBentoGrid } from './grid/StoryBentoGrid'
export type { StoryBentoGridProps, RenderCardContext } from './grid/StoryBentoGrid'
export { StoryGridStyles, storyGridCss } from './grid/StoryGridStyles'
export { StoryGridFonts } from './grid/StoryGridFonts'
export { AuraBackground } from './grid/AuraBackground'
export {
  cardThemeStyle,
  storyCardTheme,
  epicCardTheme,
  withFallback,
  DEFAULT_CARD_THEME,
  EPIC_ACCENTS,
  fmtMonth,
} from './grid/theme'
export type { CardTheme } from './grid/theme'
export type { StoryCardData, StoryGridItem, Theme } from './grid/types'

/* Daily-recap markdown renderer + embedded fs: viz mount (shared by admin + footshorts/web). */
export { RecapMarkdown } from './recap/RecapMarkdown'
export { RecapVizBlock } from './recap/RecapVizBlock'
export type { RecapVizBlockProps } from './recap/RecapVizBlock'
