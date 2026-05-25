import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import {
  vizmayaPublicUrl,
  vizf1PublicUrl,
  footshortsPublicUrl,
} from './publicSite'

/**
 * Shared TTL for admin → consumer "open in tab" links. 24h gives a
 * comfortable admin session window without re-signing; URLs refresh on
 * every server-render anyway. If an admin leaves the page open past TTL
 * and clicks, they 401 once and a reload fixes it.
 */
const LINK_TTL_SECONDS = 24 * 60 * 60

export type VerticalSlug = 'vizmaya' | 'vizf1' | 'footshorts'

const BASE_URL_BY_VERTICAL: Record<VerticalSlug, string> = {
  vizmaya: vizmayaPublicUrl,
  vizf1: vizf1PublicUrl,
  footshorts: footshortsPublicUrl,
}

/**
 * Resolve the public base URL for a vertical. Throws on unknown slug so a
 * typo at a call site surfaces immediately rather than minting a URL with
 * an empty host.
 */
export function consumerBaseUrl(vertical: VerticalSlug): string {
  const baseUrl = BASE_URL_BY_VERTICAL[vertical]
  if (!baseUrl) throw new Error(`Unknown vertical: ${vertical}`)
  return baseUrl
}

export interface SignedStoryLinks {
  /** /story/<slug>/autoplay (gated render route on consumer domain) */
  autoplay: string
  /** /story/<slug>/share (gated render route on consumer domain) */
  share: string
}

/**
 * Mint the standard set of admin-only "open story output" links for a given
 * vertical + slug. Each link carries a 24h HMAC token; the consumer-side
 * middleware verifies before allowing the render.
 *
 * Defaults to `vizmaya` for back-compat with callers that pre-date
 * multi-vertical wiring.
 */
export function signStoryLinks(
  slug: string,
  vertical: VerticalSlug = 'vizmaya'
): SignedStoryLinks {
  const baseUrl = consumerBaseUrl(vertical)
  return {
    autoplay: signOutputUrl({
      baseUrl,
      path: `/story/${slug}/autoplay`,
      ttlSeconds: LINK_TTL_SECONDS,
    }),
    share: signOutputUrl({
      baseUrl,
      path: `/story/${slug}/share`,
      ttlSeconds: LINK_TTL_SECONDS,
    }),
  }
}

/**
 * Mint a signed URL for the per-story reports builder (vizmaya only today).
 * Lives on the consumer TLD; this is how admin opens it without setting a
 * cookie on vizmaya.fyi.
 */
export function signReportsBuilderUrl(slug: string): string {
  return signOutputUrl({
    baseUrl: vizmayaPublicUrl,
    path: `/reports/${slug}`,
    ttlSeconds: LINK_TTL_SECONDS,
  })
}

/**
 * Mint a signed URL for the reports landing index on vizmaya.fyi.
 */
export function signReportsIndexUrl(): string {
  return signOutputUrl({
    baseUrl: vizmayaPublicUrl,
    path: `/reports`,
    ttlSeconds: LINK_TTL_SECONDS,
  })
}
