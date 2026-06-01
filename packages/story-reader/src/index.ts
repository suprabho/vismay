// @vismay/story-reader — the scroll-synced story reader shell + editorial
// blocks, extracted from vizmaya-fyi for reuse across web apps. Brand-agnostic:
// the host injects its own chrome (logo, aura background) and home-link via the
// LogoComponent / AuraComponent / LinkComponent props, so nothing Vizmaya- or
// Next-specific lives in here.

export { default as StoryShell } from './components/story/StoryShell'
// Deprecated alias — kept for one release cycle while call sites migrate to
// `StoryShell`. The "map" in the old name became a misnomer once page
// backgrounds and the deck format made maps just one of several backdrops.
export { default as StoryMapShell } from './components/story/StoryShell'
export {
  default as StoryBackgroundSlot,
  StoryBackgroundOverlay,
} from './components/story/StoryBackgroundSlot'
export { default as VerticalCaptureFrame } from './components/story/VerticalCaptureFrame'
export { default as ThemeProvider, statColorVar } from './components/story/ThemeProvider'
