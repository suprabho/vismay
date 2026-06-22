/**
 * `@vismay/render-surface` — the headless render surfaces (share / report /
 * slides / autoplay / canvas-frame) extracted out of vizmaya-fyi so a future
 * `apps/render` app can mount the exact same code.
 *
 * Import the surface ENTRY components (async server components) from
 * `@vismay/render-surface/surfaces`. Import the client shells / story chrome
 * from the `./share`, `./pdf`, `./autoplay`, `./story` subpaths so the
 * server-only entries and client shells stay separable.
 *
 * This root barrel exposes only the pure (environment-free, no fs/server-only
 * imports) helpers and types that are safe from either a server or client
 * boundary. `themedLogoDataUrl` is deliberately NOT re-exported here — it reads
 * the filesystem; surface entries import it directly from `./lib/themeLogo`.
 */
export {
  applyReportOverrides,
  parseReportConfig,
  parseStoryOverrides,
  getReportMapOverride,
  getReportPins,
  isReportMapHidden,
  type ReportConfig,
  type ReportPageOverride,
  type StoryOverridesConfig,
  type OverrideFormat,
  type PinOverride,
  type PinAnchor,
} from './lib/storyReportConfig'
export { themeToMapPalette } from './lib/themeToMapPalette'
export { buildShareSampleYaml } from './lib/shareSampleYaml'
export { applyShareBrandFonts } from './lib/shareTheme'
export { useFitScale } from './lib/useFitScale'
