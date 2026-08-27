// ThemeProvider moved into `@vismay/render-surface/story` during the
// render-surface extraction (PR 1) — it re-exports the generic one from
// `@vismay/story-reader` verbatim. This shim keeps existing
// `@/components/story/ThemeProvider` imports (public reader, reports) resolving.
export {
  ThemeProvider as default,
  statColorVar,
} from '@vismay/render-surface/story'
