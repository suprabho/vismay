// VerticalLoader moved into `@vismay/render-surface/story` during the
// render-surface extraction (PR 1). This shim keeps the existing
// `@/components/VerticalLoader` import in the public reader resolving against
// the package-owned, registry-driven loader.
export { VerticalLoader as default } from '@vismay/render-surface/story'
