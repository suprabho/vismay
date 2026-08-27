// VizmayaLogo moved into `@vismay/render-surface` as `SurfaceLogo` during the
// render-surface extraction (PR 1). This shim keeps existing
// `@/components/VizmayaLogo` imports (landing pages, home, demo) resolving
// against the package-owned component — same Rive logo, same palette props.
export {
  SurfaceLogo as default,
  type VizmayaLogoPalette,
} from '@vismay/render-surface/story'
