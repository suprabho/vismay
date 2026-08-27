// storyReportConfig moved into `@vismay/render-surface` during the
// render-surface extraction (PR 1). This shim keeps the existing
// `@/lib/storyReportConfig` import in the reports builder resolving against the
// package-owned parser/overrides.
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
} from '@vismay/render-surface'
