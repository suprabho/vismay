// The Vizmaya StoryShell wrapper (logo + next/link home link) moved into
// `@vismay/render-surface/story` during the render-surface extraction (PR 1).
// This shim keeps the existing `@/components/story/StoryShell` import in the
// public reader resolving against the package-owned wrapper.
export { StoryShell as default } from '@vismay/render-surface/story'
