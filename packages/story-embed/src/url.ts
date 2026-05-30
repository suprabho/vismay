/**
 * The "general Viz story view" is rendered by vizmaya.fyi and embedded by every
 * consumer app (vizf1, footshorts, …). This module is the single source of
 * truth for that embed URL, so the origin and path shape live in exactly one
 * place. If vizmaya later ships a chrome-less embed mode, add the param here and
 * every consumer inherits it.
 */
export const VIZMAYA_ORIGIN = 'https://vizmaya.fyi'

/** Build the embed URL for a story slug on the given render origin. */
export function storyUrl(slug: string, origin: string = VIZMAYA_ORIGIN): string {
  return `${origin}/story/${encodeURIComponent(slug)}`
}
