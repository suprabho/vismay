/**
 * Analytics seam for the render surfaces. The package is host-agnostic — it
 * mounts in vizmaya-fyi (real readers, Amplitude) AND in apps/render
 * (headless, signed-URL-gated, no analytics) — so it cannot import a host
 * app's `@/lib/analytics` directly. Instead the shells call these thin
 * forwarders, which no-op until a host registers a sink (vizmaya-fyi does so
 * from its AmplitudeProvider). Mirrors the opt-in `onSectionChange` seam on
 * `@vismay/story-reader`.
 */

export type RenderSurfaceAnalytics = {
  trackShareCardDownloaded?: (
    slug: string,
    props?: { variant?: string; ratio?: string; index?: number }
  ) => void
  trackShareCardsDownloadedAll?: (
    slug: string,
    props?: { count?: number; ratio?: string }
  ) => void
  trackAutoplayStarted?: (slug: string, props?: { aspect?: string }) => void
  trackAutoplayVideoDownloaded?: (
    slug: string,
    props?: { aspect?: string }
  ) => void
}

let sink: RenderSurfaceAnalytics = {}

export function registerRenderSurfaceAnalytics(t: RenderSurfaceAnalytics): void {
  sink = t
}

export const trackShareCardDownloaded: NonNullable<
  RenderSurfaceAnalytics['trackShareCardDownloaded']
> = (slug, props) => sink.trackShareCardDownloaded?.(slug, props)

export const trackShareCardsDownloadedAll: NonNullable<
  RenderSurfaceAnalytics['trackShareCardsDownloadedAll']
> = (slug, props) => sink.trackShareCardsDownloadedAll?.(slug, props)

export const trackAutoplayStarted: NonNullable<
  RenderSurfaceAnalytics['trackAutoplayStarted']
> = (slug, props) => sink.trackAutoplayStarted?.(slug, props)

export const trackAutoplayVideoDownloaded: NonNullable<
  RenderSurfaceAnalytics['trackAutoplayVideoDownloaded']
> = (slug, props) => sink.trackAutoplayVideoDownloaded?.(slug, props)
