/**
 * The "general Viz story view" is rendered by vizmaya.fyi and embedded by every
 * consumer app (vizf1, footshorts, …). This module is the single source of
 * truth for that embed URL, so the origin and path shape live in exactly one
 * place.
 *
 * Embeds load the story in vizmaya's *chrome-less* mode via `?embed=1`: the
 * shared StoryMapShell (@vismay/story-reader) reads that flag client-side and
 * suppresses vizmaya's persistent brand logo / home-link, leaving the host to
 * overlay its own chrome (back button, …) through StoryEmbed's `children`.
 * Every consumer inherits this by routing through `storyUrl()`; direct
 * vizmaya.fyi readers never set the flag and keep the logo.
 */
export const VIZMAYA_ORIGIN = 'https://vizmaya.fyi'

/** Build the chrome-less embed URL for a story slug on the given render origin. */
export function storyUrl(slug: string, origin: string = VIZMAYA_ORIGIN): string {
  return `${origin}/story/${encodeURIComponent(slug)}?embed=1`
}
