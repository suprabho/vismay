// ThemeProvider has no app chrome — re-export the generic one verbatim so
// existing `@/components/story/ThemeProvider` imports keep resolving.
export { ThemeProvider as default, statColorVar } from '@vismay/story-reader'
