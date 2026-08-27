// ShareMapBg moved into `@vismay/render-surface/share` during the
// render-surface extraction (PR 1). This shim keeps the existing
// `@/components/share/ShareMapBg` import in the map editor resolving against
// the package-owned component.
export { ShareMapBg as default } from '@vismay/render-surface/share'
