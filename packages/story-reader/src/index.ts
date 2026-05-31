// @vismay/story-reader — the scroll-synced story reader shell + editorial
// blocks, extracted from vizmaya-fyi for reuse across web apps. Brand-agnostic:
// the host injects its own chrome (logo, aura background) and home-link via the
// LogoComponent / AuraComponent / LinkComponent props, so nothing Vizmaya- or
// Next-specific lives in here.

export { default as StoryMapShell } from './components/story/StoryMapShell'
export {
  default as StoryBackgroundSlot,
  StoryBackgroundOverlay,
} from './components/story/StoryBackgroundSlot'
export { default as VerticalCaptureFrame } from './components/story/VerticalCaptureFrame'
export { default as ThemeProvider, statColorVar } from './components/story/ThemeProvider'
