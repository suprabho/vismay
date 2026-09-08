/**
 * Media-type sniffing for article `image_url` values.
 *
 * RSS ingestion takes the first `enclosure` / `media:content` it finds, and a
 * few publishers ship an HLS video manifest there instead of a still — e.g.
 * `https://cdn.jwplayer.com/manifests/0b6ZtJp9.m3u8`. The column is still
 * called `image_url`, so every renderer has to decide from the URL alone
 * whether it is looking at an image or a video.
 */

const HLS_RE = /\.m3u8$/i
const DIRECT_VIDEO_RE = /\.(?:mp4|m4v|webm|mov)$/i

/** The path part of `url`, so an extension in the query string (`?ref=x.m3u8`)
 *  can't masquerade as the resource type. Falls back to a plain split for
 *  strings the URL parser rejects. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.split(/[?#]/, 1)[0] ?? ''
  }
}

/** True for an HLS playlist (`.m3u8`) URL. */
export function isHlsUrl(url: string | null | undefined): boolean {
  return !!url && HLS_RE.test(pathOf(url))
}

/** True for a URL that points at video (an HLS manifest or a direct file) rather
 *  than a still image. Feed cards render these with a player; admin pickers
 *  drop them from image-only lists (an `<img>` can't display them and the AI
 *  image routes can't decode them as a reference). */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const path = pathOf(url)
  return HLS_RE.test(path) || DIRECT_VIDEO_RE.test(path)
}

/** `url` when it is a still image, otherwise null — for surfaces that can only
 *  show images (thumbnail grids, reference-image pickers, `<img>` previews). */
export function imageOnly<T extends string | null | undefined>(url: T): T | null {
  return isVideoUrl(url) ? null : url
}
