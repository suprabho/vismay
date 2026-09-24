/**
 * The "general Viz story view" is rendered by the brand-neutral render service
 * (`apps/render`, render.vismay.xyz) and embedded by every consumer app (vizf1,
 * footshorts, umami, …). This module is the single source of truth for that
 * embed URL, so the origin and path shape live in exactly one place.
 *
 * Embeds load the story in *chrome-less* mode via `?embed=1`: the shared
 * StoryMapShell (@vismay/story-reader) reads that flag client-side and
 * suppresses the persistent brand logo / home-link, leaving the host to
 * overlay its own chrome (back button, …) through StoryEmbed's `children`.
 * Every consumer inherits this by routing through `storyUrl()`.
 */
export const RENDER_ORIGIN = 'https://render.vismay.xyz'

/**
 * vizmaya.fyi — still the home of pages the render service doesn't serve
 * (e.g. bespoke epic landings at `/<epicSlug>`) and of the canonical, indexed
 * story URLs.
 */
export const VIZMAYA_ORIGIN = 'https://vizmaya.fyi'

/** Build the chrome-less embed URL for a story slug on the given render origin. */
export function storyUrl(slug: string, origin: string = RENDER_ORIGIN): string {
  return `${origin}/story/${encodeURIComponent(slug)}?embed=1`
}
